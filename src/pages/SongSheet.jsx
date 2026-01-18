import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useSong, useSongInSongbooks, useAccessibleSongs, useMyGroups, useAllDatabaseChords } from '../db/queries';
import { db } from '../db/schema';
import { renderInlineChords, renderAboveChords, parseLyricsWithChords, lyricsWithChordsToText, extractElements } from '../utils/lyrics-helpers';
import { useState, useRef, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { deleteSong, createSong, updateSong, shareSongsWithGroups, recordSongPlay } from '../db/mutations';
import { AppError, ERROR_CODES } from '../utils/error-handling';
import ChordAutocomplete from '../components/ChordAutocomplete';
import StyledChordEditor from '../components/StyledChordEditor';
import ChordDiagram from '../components/ChordDiagram';
import { findChord } from '../utils/chord-library';
import { formatChordNameForDisplay } from '../utils/chord-formatting';
import PDFImportModal from '../components/PDFImportModal';

export default function SongSheet() {
  // All hooks must be called in the same order on every render
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  
  const [chordMode, setChordMode] = useState('inline'); // 'inline' or 'above'
  const [previousChordMode, setPreviousChordMode] = useState(null); // Store previous mode when entering edit
  const [menuOpen, setMenuOpen] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [songSelectorOpen, setSongSelectorOpen] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const menuRef = useRef(null);
  const songSelectorRef = useRef(null);
  
  // Instrument and tuning settings (can be made configurable later)
  const instrument = 'ukulele';
  const tuning = 'ukulele_standard';

  // Edit/create mode state - must be declared before conditional hooks
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [lyricsText, setLyricsText] = useState('');
  const [saving, setSaving] = useState(false);

  // Always call these hooks in the same order
  // Use id directly (will be undefined for /songs/new, which is handled by the hooks)
  const { data, error } = useSong(id);
  const song = data?.songs?.[0];
  const { data: songbookData } = useSongInSongbooks(id);
  const { data: groupsData } = useMyGroups(user?.id);
  
  // Also query groups directly as a fallback if group relation isn't populated
  const groupMembers = groupsData?.data?.groupMembers || [];
  const groupIds = Array.isArray(groupMembers) 
    ? groupMembers.map(gm => gm?.groupId).filter(Boolean)
    : [];
  const { data: directGroupsData } = db.useQuery({
    groups: {
      $: {
        where: groupIds.length > 0 ? { id: { $in: groupIds } } : { id: '' },
      },
    },
  });
  
  // Get songbook ID and group ID from query parameters
  const songbookId = searchParams.get('songbook');
  const groupId = searchParams.get('group');
  
  // Get accessible songs to enrich songbookSongs
  // Use null instead of undefined to ensure consistent hook calls
  const accessibleSongsQuery = useAccessibleSongs(user?.id ?? null);
  // Ensure we always have an array, even if data is undefined
  const allSongs = (accessibleSongsQuery?.data?.songs && Array.isArray(accessibleSongsQuery.data.songs)) 
    ? accessibleSongsQuery.data.songs 
    : [];
  const accessibleSongsMap = new Map(
    allSongs.map(song => [song.id, song])
  );
  
  // Query songbookSongs directly when in songbook context (similar to SongbookIndex)
  const { data: songbookSongsData } = db.useQuery({
    songbookSongs: {
      $: {
        where: songbookId ? { songbookId } : { songbookId: '' },
        order: { order: 'asc' },
      },
    },
  });
  const rawSongbookSongs = songbookSongsData?.songbookSongs || [];
  
  // Enrich songbookSongs with song data from accessible songs
  // Also include the current song even if not in accessibleSongs (user is viewing it)
  // This handles the case where a newly created song isn't in accessible songs yet
  const contextSongbookSongs = useMemo(() => {
    if (!Array.isArray(rawSongbookSongs)) {
      return [];
    }
    return rawSongbookSongs
      .map(ss => {
        // Try to get song from accessible songs map first
        let songData = accessibleSongsMap.get(ss.songId);
        // If not found and this is the current song being viewed, use the song from useSong hook
        if (!songData && ss.songId === id && song) {
          songData = song;
        }
        if (songData) {
          return { ...ss, song: songData };
        }
        return null;
      })
      .filter(Boolean);
  }, [rawSongbookSongs, accessibleSongsMap, id, song]);

  // Compute mode after hooks (this is just derived state, not affecting hook order)
  const isCreateMode = location.pathname === '/songs/new';
  const isViewMode = !isCreateMode && id && !isEditing;
  
  const inSongbooks = isViewMode && songbookData?.songbookSongs?.length > 0;

  // Check if user has editing rights (user created the song)
  const canEdit = user && song && song.createdBy === user.id;
  const isCreator = user && song && song.createdBy === user.id;

  // Initialize edit mode with song data
  useEffect(() => {
    if (isEditing && song) {
      setTitle(song.title || '');
      setArtist(song.artist || '');
      
      // Convert lyrics and chords back to editable text format
      let chords = [];
      if (song.chords) {
        try {
          chords = JSON.parse(song.chords);
        } catch (e) {
          console.error('Error parsing chords:', e);
          chords = [];
        }
      }
      
      const lyricsText = lyricsWithChordsToText(song.lyrics || '', chords);
      setLyricsText(lyricsText);
    } else if (isCreateMode) {
      // Initialize with empty values and placeholder text
      setTitle('');
      setArtist('');
      setLyricsText('');
    }
  }, [isEditing, isCreateMode, song]);

  // Track song plays - record a play when user views a song for 60+ seconds
  useEffect(() => {
    // Only track plays for:
    // - View mode (not edit mode or create mode)
    // - Saved songs (has an id - not new/unsaved songs)
    // - Authenticated users
    // - Existing songs (song object exists)
    if (!isViewMode || !song || !song.id || !user?.id || isEditing || isCreateMode) {
      return;
    }

    // Start 60-second timer
    const timerId = setTimeout(() => {
      // Timer completed - record the play
      recordSongPlay(song.id, user.id).catch((error) => {
        console.error('Error recording song play:', error);
        // Don't throw - play tracking failures shouldn't break the app
      });
    }, 60000); // 60 seconds

    // Cleanup function - clear timer if:
    // - Component unmounts
    // - User navigates away
    // - User enters edit mode
    // - Song changes
    // - Mode changes
    return () => {
      clearTimeout(timerId);
    };
  }, [isViewMode, song?.id, user?.id, isEditing, isCreateMode]);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
      if (songSelectorRef.current && !songSelectorRef.current.contains(event.target)) {
        setSongSelectorOpen(false);
      }
    }

    if (menuOpen || songSelectorOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [menuOpen, songSelectorOpen]);

  // Parse chords from JSON string (must be before early returns for hooks)
  // Always ensure chords is an array to maintain consistent hook dependencies
  // During editing, parse chords from lyricsText in real-time
  const chords = useMemo(() => {
    // If editing, parse chords from the current lyricsText
    if (isEditing && lyricsText) {
      try {
        const { chords: parsedChords } = parseLyricsWithChords(lyricsText);
        return Array.isArray(parsedChords) ? parsedChords : [];
      } catch (e) {
        console.error('Error parsing chords from lyricsText:', e);
        return [];
      }
    }
    
    // Otherwise, use saved chords from song
    if (!song?.chords) {
      return [];
    }
    try {
      const parsed = JSON.parse(song.chords);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('Error parsing chords:', e);
      return [];
    }
  }, [isEditing, lyricsText, song?.chords]);
  
  // Extract unique chord name-position pairs from the song (must be before early returns)
  const uniqueChordPairs = useMemo(() => {
    if (!chords || chords.length === 0) return [];
    const chordPairs = new Map(); // Use Map with key "name:position" to track unique pairs
    chords.forEach(chord => {
      if (chord.chord) {
        // Trim and normalize chord name to ensure proper matching
        const normalizedChord = chord.chord.trim();
        if (normalizedChord) {
          // Get position from chord object (parsed from chordPosition field, default to 1)
          const position = chord.chordPosition || 1;
          const key = `${normalizedChord}:${position}`;
          if (!chordPairs.has(key)) {
            chordPairs.set(key, { name: normalizedChord, position });
          }
        }
      }
    });
    return Array.from(chordPairs.values());
  }, [chords]);

  // Parse embedded chords from song data
  const embeddedChords = useMemo(() => {
    if (!song?.embeddedChords) return [];
    try {
      const parsed = JSON.parse(song.embeddedChords);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('Error parsing embedded chords:', e);
      return [];
    }
  }, [song?.embeddedChords]);

  // Get database chords for lookup
  const { data: dbChordsData } = useAllDatabaseChords(user?.id, instrument, tuning);
  const dbChords = dbChordsData?.chords || [];

  // Get chord diagrams data for unique chord-position pairs (must be before early returns)
  const chordDiagrams = useMemo(() => {
    if (!uniqueChordPairs || uniqueChordPairs.length === 0) return [];
    
    return uniqueChordPairs
      .map(({ name: chordName, position }) => {
        // Try to find chord with specific position in order: embedded, database personal, database main
        const chordData = findChord(chordName, instrument, tuning, position, {
          databaseChords: dbChords,
          embeddedChords: embeddedChords,
        });
        
        if (chordData && chordData.frets) {
          return {
            name: chordName,
            position: position,
            frets: chordData.frets,
            baseFret: chordData.baseFret, // Pass baseFret if available
            instrument: chordData.instrument || instrument,
            tuning: chordData.tuning || tuning,
          };
        }
        return null;
      })
      .filter(Boolean);
  }, [uniqueChordPairs, instrument, tuning, dbChords, embeddedChords]);

  // Track container width using ResizeObserver (detects zoom and resize) - MUST be before early returns
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  // Measure longest lyric line width using hidden DOM element (zoom-aware) - MUST be before early returns
  const longestLineWidth = useMemo(() => {
    if (!song?.lyrics) return 0;
    
    const lines = song.lyrics.split('\n');
    if (lines.length === 0) return 0;
    
    // Create a hidden measurement element with same styling as lyrics
    // Match the exact CSS classes: font-mono, text-base (16px), leading-relaxed (1.625)
    const measureSpan = document.createElement('span');
    measureSpan.style.cssText = `
      position: absolute;
      visibility: hidden;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 16px;
      line-height: 1.625;
      white-space: pre;
      padding: 0;
      margin: 0;
      top: -9999px;
      left: -9999px;
    `;
    document.body.appendChild(measureSpan);
    
    let maxWidth = 0;
    lines.forEach(line => {
      // Measure non-empty lines (including lines with only spaces)
      if (line.length > 0) {
        measureSpan.textContent = line;
        const width = measureSpan.getBoundingClientRect().width; // Zoom-aware measurement
        maxWidth = Math.max(maxWidth, width);
      }
    });
    
    document.body.removeChild(measureSpan);
    return maxWidth;
  }, [song?.lyrics]);

  // Track container width using ResizeObserver (detects zoom and resize)
  useEffect(() => {
    if (!containerRef.current) return;
    
    // ResizeObserver fires on: window resize, browser zoom, content changes
    const observer = new ResizeObserver((entries) => {
      const width = entries[0].contentRect.width; // Zoom-aware measurement
      if (width > 0) {
        setContainerWidth(width);
      }
    });
    
    observer.observe(containerRef.current);
    
    // Initial measurement (in case ResizeObserver doesn't fire immediately)
    const initialWidth = containerRef.current.getBoundingClientRect().width;
    if (initialWidth > 0) {
      setContainerWidth(initialWidth);
    }
    
    return () => {
      observer.disconnect();
    };
  }, [song?.id]); // Re-observe when song changes

  // Track mobile state (reactive to window resize)
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile(); // Initial check
    window.addEventListener('resize', checkMobile);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  // Calculate optimal chord chart container width - MUST be before early returns
  // ALWAYS prioritizes preventing lyric line breaks over showing more chords
  const optimalChordWidth = useMemo(() => {
    // On mobile (< 768px), use default behavior (horizontal scroll)
    if (isMobile) {
      return null; // null means use default CSS (mobile behavior)
    }
    
    // Need both measurements to calculate
    // If containerWidth is 0, we haven't measured yet - use fallback
    if (!containerWidth || containerWidth === 0 || !longestLineWidth) {
      return 256; // Fallback to md:w-64 (256px) until we have measurements
    }
    
    const gap = 12; // gap-x-3 = 12px
    const chordWidth = 74; // From ChordDiagram component (labelContainerWidth)
    const containerGap = 24; // md:gap-6 = 24px between lyrics and chords
    
    // Smart buffer calculation: use more buffer when space is tight, less when there's plenty
    // Base buffer accounts for:
    // - Text rendering variations across browsers
    // - Subpixel rendering differences
    // - Font metrics variations
    // - Potential word wrapping edge cases
    // - Browser zoom rendering differences
    const baseBuffer = 70; // Slightly increased buffer to prevent occasional breaks
    
    // Calculate how much space lyrics actually need
    const lyricNeedsWidth = longestLineWidth + baseBuffer;
    
    // Calculate available space for chords
    const availableForChords = containerWidth - lyricNeedsWidth - containerGap;
    
    // Minimum width for 2 chords (minimum per row - STRICT REQUIREMENT)
    const minTwoChordsWidth = 2 * (chordWidth + gap) - gap;
    
    // If not enough space for 2 chords with normal buffer, try with reduced buffer
    // ALWAYS show at least 2 chords - never fall back to 1
    if (availableForChords < minTwoChordsWidth) {
      // Try with reduced lyrics buffer to fit 2 chords
      const tightLyricWidth = longestLineWidth + 50; // Reduced buffer for tight space
      const tightAvailableForChords = containerWidth - tightLyricWidth - containerGap;
      if (tightAvailableForChords >= minTwoChordsWidth) {
        return minTwoChordsWidth; // Show 2 chords with tighter lyrics buffer
      }
      // If still not enough, try even tighter buffer
      const veryTightLyricWidth = longestLineWidth + 40; // Very tight buffer
      const veryTightAvailableForChords = containerWidth - veryTightLyricWidth - containerGap;
      if (veryTightAvailableForChords >= minTwoChordsWidth) {
        return minTwoChordsWidth; // Show 2 chords with very tight lyrics buffer
      }
      // Last resort: use minimum buffer but still show 2 chords
      // This ensures we always show 2 chords, even if lyrics buffer is minimal
      return minTwoChordsWidth;
    }
    
    // Calculate how many chords could theoretically fit
    const theoreticalChords = Math.floor(availableForChords / (chordWidth + gap));
    
    // Dynamic reduction: be more conservative when space is tight, use space efficiently when there's room
    // Minimum is 2 chords per row
    // If we have plenty of space (theoreticalChords >= 4), reduce by 1
    // If space is moderate (theoreticalChords == 3), reduce by 1
    // If space is tight (theoreticalChords == 2), keep 2 (minimum)
    let maxChordsPerRow;
    if (theoreticalChords >= 4) {
      // Plenty of space - reduce by 1 to be safe but use space efficiently
      maxChordsPerRow = Math.min(5, theoreticalChords - 1);
    } else if (theoreticalChords === 3) {
      // Moderate space - reduce by 1 to prevent breaks
      maxChordsPerRow = 2;
    } else {
      // Tight space - keep minimum of 2 chords
      maxChordsPerRow = 2;
    }
    
    // Ensure minimum of 2 chords per row
    maxChordsPerRow = Math.max(2, maxChordsPerRow);
    
    // Calculate optimal width: chords width + gaps
    const calculatedWidth = maxChordsPerRow * (chordWidth + gap) - gap;
    
    // Ensure minimum width for usability (at least 2 chords)
    const minWidth = minTwoChordsWidth;
    
    // Calculate the actual lyrics width with this chord width
    const actualLyricsWidth = containerWidth - calculatedWidth - containerGap;
    
    // Safety check: ensure lyrics have enough room (longest line + buffer)
    // Use a slightly larger buffer for the safety check to prevent edge cases
    const safetyBuffer = 50; // Extra safety margin
    if (actualLyricsWidth < longestLineWidth + safetyBuffer && maxChordsPerRow > 2) {
      // Reduce by one chord to ensure lyrics have enough space (but keep minimum of 2)
      const reducedChords = Math.max(2, maxChordsPerRow - 1);
      const reducedWidth = Math.max(minWidth, reducedChords * (chordWidth + gap) - gap);
      const reducedLyricsWidth = containerWidth - reducedWidth - containerGap;
      
      // Double-check that reduced width gives enough space
      if (reducedLyricsWidth >= longestLineWidth + safetyBuffer) {
        return reducedWidth;
      }
      // If even reduced doesn't work, use minimum 2 chords with tighter buffer
      // ALWAYS show at least 2 chords - never fall back to 1
      const minTwoWidth = minTwoChordsWidth;
      const minTwoLyricsWidth = containerWidth - minTwoWidth - containerGap;
      // Use minimum 2 chords - lyrics will have whatever space is left
      // This prioritizes showing 2 chords over perfect lyrics spacing
      return minTwoWidth;
    }
    
    // Final check: ensure we're not leaving excessive gap
    // If there's more than 100px gap between chords and lyrics, we can add one more chord
    const gapBetween = actualLyricsWidth - longestLineWidth;
    if (gapBetween > 100 && maxChordsPerRow < 5 && theoreticalChords > maxChordsPerRow) {
      // We have plenty of buffer, can safely add one more chord
      const increasedChords = Math.min(5, maxChordsPerRow + 1);
      const increasedWidth = increasedChords * (chordWidth + gap) - gap;
      const newLyricsWidth = containerWidth - increasedWidth - containerGap;
      
      // Only add the chord if lyrics still have enough space (longest line + 50px buffer for safety)
      if (newLyricsWidth >= longestLineWidth + 50) {
        return increasedWidth;
      }
    }
    
    return calculatedWidth;
  }, [longestLineWidth, containerWidth, isMobile]);

  // Find current song position in songbook and calculate navigation
  const songbookNavigation = useMemo(() => {
    if (!songbookId || !contextSongbookSongs.length || !id) {
      return null;
    }

    // Find current song's position in the songbook
    const currentIndex = contextSongbookSongs.findIndex(ss => ss.song?.id === id);
    
    if (currentIndex === -1) {
      // Current song not found in this songbook
      return null;
    }

    const previousSongbookSong = currentIndex > 0 ? contextSongbookSongs[currentIndex - 1] : null;
    const nextSongbookSong = currentIndex < contextSongbookSongs.length - 1 ? contextSongbookSongs[currentIndex + 1] : null;

    return {
      currentIndex,
      totalSongs: contextSongbookSongs.length,
      previousSongId: previousSongbookSong?.song?.id || null,
      nextSongId: nextSongbookSong?.song?.id || null,
      songs: contextSongbookSongs.map((ss, idx) => ({
        id: ss.song?.id,
        title: ss.song?.title,
        artist: ss.song?.artist,
        position: idx + 1,
      })),
    };
  }, [songbookId, contextSongbookSongs, id]);

  // Navigation handlers
  const handlePreviousSong = () => {
    if (songbookNavigation?.previousSongId && songbookId) {
      navigate(`/songs/${songbookNavigation.previousSongId}?songbook=${songbookId}`);
    }
  };

  const handleNextSong = () => {
    if (songbookNavigation?.nextSongId && songbookId) {
      navigate(`/songs/${songbookNavigation.nextSongId}?songbook=${songbookId}`);
    }
  };

  const handleJumpToSong = (songId) => {
    if (songId && songbookId) {
      navigate(`/songs/${songId}?songbook=${songbookId}`);
      setSongSelectorOpen(false);
    }
  };

  const handleSave = async () => {
    if (!user || !user.id) {
      alert('You must be logged in to save a song.');
      return;
    }

    if (!title.trim()) {
      alert('Please enter a song title.');
      return;
    }

    if (!lyricsText.trim()) {
      alert('Please enter lyrics.');
      return;
    }

    setSaving(true);

    try {
      const { lyrics, chords } = parseLyricsWithChords(lyricsText);
      const chordsJson = chords && chords.length > 0 ? JSON.stringify(chords) : '[]';

      if (isEditing && id) {
        await updateSong(id, {
          title,
          lyrics,
          artist,
          chords: chordsJson,
        });
        // Exit edit mode after successful save
        setIsEditing(false);
        // Restore previous chord mode if it was stored
        if (previousChordMode !== null) {
          setChordMode(previousChordMode);
          setPreviousChordMode(null);
        }
      } else {
        const newSongId = await createSong({
          title,
          lyrics,
          artist,
          chords: chordsJson,
          createdBy: user.id,
        });
        // Wait a bit longer to ensure InstantDB has synced the new song
        // This prevents hook order issues when the component tries to load before data is ready
        await new Promise(resolve => setTimeout(resolve, 300));
        // Navigate to the newly created song view with replace to avoid history issues
        navigate(`/songs/${newSongId}`, { replace: true });
      }
    } catch (error) {
      console.error('Error saving song:', error);
      let errorMessage = 'Error saving song. Please try again.';
      if (error?.message) {
        errorMessage = `Error: ${error.message}`;
      } else if (error?.errors && Array.isArray(error.errors)) {
        errorMessage = `Validation errors: ${error.errors.join(', ')}`;
      }
      alert(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    // Reset form fields to original song values
    if (song) {
      setTitle(song.title || '');
      setArtist(song.artist || '');
      
      let chords = [];
      if (song.chords) {
        try {
          chords = JSON.parse(song.chords);
        } catch (e) {
          console.error('Error parsing chords:', e);
          chords = [];
        }
      }
      
      const lyricsText = lyricsWithChordsToText(song.lyrics || '', chords);
      setLyricsText(lyricsText);
    }
    setIsEditing(false);
    // Restore previous chord mode if it was stored
    if (previousChordMode !== null) {
      setChordMode(previousChordMode);
      setPreviousChordMode(null);
    }
  };

  const handleCancel = () => {
    if (isCreateMode) {
      navigate('/home');
    }
  };

  const handleDelete = async () => {
    // Check if song is in songbooks
    if (inSongbooks) {
      alert('Song is in one or more songbooks. Remove it from songbooks first.');
      setShowDeleteModal(false);
      return;
    }

    setDeleteLoading(true);
    try {
      await deleteSong(id);
      navigate('/home');
    } catch (error) {
      console.error('Error deleting song:', error);
      const errorMessage = error?.userMessage || error?.message || 'Error deleting song. Please try again.';
      alert(errorMessage);
      setDeleteLoading(false);
      setShowDeleteModal(false);
    }
  };


  // Show loading state when viewing and song is not yet loaded
  if (isViewMode && id && !song && !error) {
    return (
      <div>
        <p>Loading song...</p>
      </div>
    );
  }

  if (error && isViewMode) {
    return (
      <div>
        <p className="text-red-600">Error loading song: {error.message || 'Unknown error'}</p>
      </div>
    );
  }

  // Create Mode
  if (isCreateMode) {
    const handleImport = (importedData) => {
      // Pre-fill form fields with imported data
      if (importedData.title) {
        setTitle(importedData.title);
      }
      if (importedData.artist) {
        setArtist(importedData.artist);
      }
      if (importedData.lyricsText) {
        setLyricsText(importedData.lyricsText);
      }
    };

    return (
      <div>
        {/* Save and Cancel buttons above the title */}
        <div className="flex gap-4 mb-6">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            disabled={saving}
            className="btn btn-secondary"
          >
            Import
          </button>
          <button
            onClick={handleCancel}
            disabled={saving}
            className="btn btn-secondary"
          >
            Cancel
          </button>
        </div>

        {/* PDF Import Modal */}
        <PDFImportModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          onImport={handleImport}
        />

        {/* Editable Title */}
        <div className="mb-6">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Song Title"
            className="heading-alice mb-2 w-full bg-transparent border-b-2 border-transparent focus:border-gray-300 outline-none p-0 transition-colors placeholder:text-gray-400"
          />
          
          {/* Editable Artist */}
          <input
            type="text"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="Artist Name"
            className="text-xl text-gray-600 w-full bg-transparent border-b-2 border-transparent focus:border-gray-300 outline-none p-0 transition-colors placeholder:text-gray-500"
          />
        </div>

        {/* Editable Lyrics */}
        <div>
          <StyledChordEditor
            value={lyricsText}
            onChange={(e) => setLyricsText(e.target.value)}
            placeholder="Paste your lyrics here.\n\nPress / to add chords inline with your lyrics.\n\nExample:\nAmazing [C]grace how [G]sweet the [Am]sound\nThat saved a [F]wretch like [C]me"
            rows={30}
            className="w-full p-0 border-none outline-none focus:outline-none bg-transparent text-base leading-relaxed resize-none placeholder:text-gray-400"
            instrument={instrument}
            tuning={tuning}
            userId={user?.id}
          />
        </div>
      </div>
    );
  }

  // View Mode (existing behavior)
  // We always need song to exist, whether viewing or editing
  if (!song) {
    return (
      <div>
        <p>Loading song...</p>
      </div>
    );
  }
  
  // Only calculate rendered lyrics if we're not editing
  const renderedLyrics = !isEditing
    ? (chordMode === 'inline'
        ? renderInlineChords(song.lyrics, chords)
        : renderAboveChords(song.lyrics, chords))
    : [];
  
  // Parse elements for styling (only if we're not editing)
  const { headings, instructions } = !isEditing && song.lyrics ? extractElements(song.lyrics) : { headings: [], instructions: [] };


  return (
    <div>
      {/* Edit Banner */}
      {isEditing && (
        <div className="fixed top-0 left-0 right-0 bg-primary-50 border-b border-primary-200 z-40 shadow-sm">
          <div className="w-full px-4 xl:container xl:mx-auto xl:pl-16">
            <div className="flex items-center justify-between py-3">
              <p className="text-sm font-medium text-primary-900">
                You are editing this song
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="btn btn-primary text-sm"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={handleCancelEdit}
                  disabled={saving}
                  className="btn btn-secondary text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && song && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">Delete Song</h2>
            <p className="text-gray-700 mb-6">
              Are you sure you want to delete "{song.title}"? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleteLoading}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="btn btn-danger"
              >
                {deleteLoading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <>
                <div className="mb-6">
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="heading-alice mb-2 w-full bg-transparent border-b-2 border-transparent focus:border-gray-300 outline-none p-0 transition-colors"
                  />
                  <input
                    type="text"
                    value={artist}
                    onChange={(e) => setArtist(e.target.value)}
                    className="text-xl text-gray-600 w-full bg-transparent border-b-2 border-transparent focus:border-gray-300 outline-none p-0 transition-colors"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-2">
                  {isViewMode && songbookNavigation ? (
                    <div className="relative" ref={songSelectorRef}>
                      <button
                        onClick={() => setSongSelectorOpen(!songSelectorOpen)}
                        className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer"
                        aria-label="Select song from songbook"
                      >
                        <h1 className="heading-alice">{song.title}</h1>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className={`h-5 w-5 text-gray-600 transition-transform ${songSelectorOpen ? 'rotate-180' : ''}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </button>
                      {songSelectorOpen && (
                        <div className="absolute left-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-10 max-h-96 overflow-y-auto">
                          <div className="py-1">
                            {songbookNavigation.songs.map((songItem) => (
                              <button
                                key={songItem.id}
                                onClick={() => handleJumpToSong(songItem.id)}
                                className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors ${
                                  songItem.id === id ? 'bg-primary-50 text-primary-700 font-medium' : ''
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-gray-500 font-mono text-xs w-6">
                                    {songItem.position}.
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium truncate">{songItem.title}</div>
                                    {songItem.artist && (
                                      <div className="text-xs text-gray-500 truncate">{songItem.artist}</div>
                                    )}
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <h1 className="heading-alice">{song.title}</h1>
                  )}
                </div>
                {song.artist && (
                  <p className="text-xl text-gray-600">{song.artist}</p>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Previous/Next Navigation Buttons */}
            {!isEditing && isViewMode && songbookNavigation && (
              <div className="flex items-center gap-1">
                <div className="relative group">
                  <button
                    onClick={handlePreviousSong}
                    disabled={!songbookNavigation.previousSongId}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Previous song"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                  </button>
                  <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-900 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                    Previous song
                  </span>
                </div>
                <div className="relative group">
                  <button
                    onClick={handleNextSong}
                    disabled={!songbookNavigation.nextSongId}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Next song"
                  >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                  </button>
                  <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-900 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                    Next song
                  </span>
                </div>
              </div>
            )}
            {!isEditing && (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="btn p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  aria-label="Song actions"
                >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                />
              </svg>
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
                <div className="py-1">
                  <button
                    onClick={() => {
                      setChordMode('inline');
                      setMenuOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
                      chordMode === 'inline' ? 'bg-gray-50 font-medium' : ''
                    }`}
                  >
                    Inline Chords
                  </button>
                  <button
                    onClick={() => {
                      setChordMode('above');
                      setMenuOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
                      chordMode === 'above' ? 'bg-gray-50 font-medium' : ''
                    }`}
                  >
                    Chords Above
                  </button>
                  {isCreator && (
                    <>
                      <div className="border-t border-gray-200 my-1"></div>
                      <button
                        onClick={() => {
                          setShowShareModal(true);
                          setMenuOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                      >
                        Share with Group
                      </button>
                    </>
                  )}
                  {canEdit && (
                    <>
                      <div className="border-t border-gray-200 my-1"></div>
                      <button
                        onClick={() => {
                          // Store current chord mode before entering edit mode
                          setPreviousChordMode(chordMode);
                          // Force inline mode for editing (users can't position chords in "chords above" view)
                          if (chordMode === 'above') {
                            setChordMode('inline');
                          }
                          setIsEditing(true);
                          setMenuOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                      >
                        Edit
                      </button>
                    </>
                  )}
                  {isCreator && (
                    <>
                      <div className="border-t border-gray-200 my-1"></div>
                      <button
                        onClick={() => {
                          setShowDeleteModal(true);
                          setMenuOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
            )}
          </div>
        </div>
      </div>

      <div ref={containerRef} className="flex flex-col md:flex-row md:gap-6">
        {/* Lyrics Section */}
        <div className="flex-1 order-2 md:order-1">
          {isEditing ? (
            <StyledChordEditor
              value={lyricsText}
              onChange={(e) => setLyricsText(e.target.value)}
              rows={30}
              className="w-full p-0 border-none outline-none focus:outline-none bg-transparent text-base leading-relaxed resize-none font-mono"
              instrument={instrument}
              tuning={tuning}
              userId={user?.id}
            />
          ) : chordMode === 'inline' ? (
            <div className="space-y-2 font-mono">
              {renderedLyrics.map((line, i) => {
                // Check if this line is a heading
                const headingMatch = line.match(/\{heading:([^}]+)\}/);
                if (headingMatch) {
                  return (
                    <p key={i} className="text-lg font-bold text-gray-800 mt-4 mb-2 first:mt-0">
                      {headingMatch[1].trim()}
                    </p>
                  );
                }
                
                // Check if this line is an instruction
                const instructionMatch = line.match(/\{instruction:([^}]+)\}/);
                if (instructionMatch) {
                  return (
                    <p key={i} className="text-sm italic text-gray-600 my-2 border-l-2 border-gray-300 pl-3">
                      {instructionMatch[1].trim()}
                    </p>
                  );
                }
                
                // Regular lyric line
                return (
                  <p key={i} className="text-base leading-relaxed">
                    {line === '' ? '\u00A0' : line.split(/\[([^\]]+)\]/).map((part, j) => {
                      if (j % 2 === 1) {
                        // Parse position from chord name format: "C:2" -> chord "C", position 2
                        const positionMatch = part.match(/^(.+):(\d+)$/);
                        const chordName = positionMatch ? positionMatch[1].trim() : part;
                        const chordPosition = positionMatch ? parseInt(positionMatch[2], 10) : 1;
                        
                        return (
                          <span key={j} className="inline-flex items-center gap-1.5 px-2 py-1 bg-primary-100 text-primary-700 rounded text-sm font-medium">
                            <span>{formatChordNameForDisplay(chordName)}</span>
                            {chordPosition > 1 && (
                              <span className="inline-flex items-center justify-center rounded-full bg-primary-700 text-white text-xs font-medium leading-[1em] min-w-[1em] px-1">
                                {chordPosition}
                              </span>
                            )}
                          </span>
                        );
                      }
                      return <span key={j}>{part}</span>;
                    })}
                  </p>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2 font-mono">
              {renderedLyrics.map((lineData, i) => {
                // Handle headings and instructions
                if (lineData.type === 'heading') {
                  return (
                    <p key={i} className="text-lg font-bold text-gray-800 mt-4 mb-2 first:mt-0">
                      {lineData.text}
                    </p>
                  );
                }
                
                if (lineData.type === 'instruction') {
                  return (
                    <p key={i} className="text-sm italic text-gray-600 my-2 border-l-2 border-gray-300 pl-3">
                      {lineData.text}
                    </p>
                  );
                }
                
                // Regular line with chords
                const { chordSegments, lyricLine } = lineData;
                return (
                  <div key={i} className="leading-relaxed">
                    {chordSegments && chordSegments.length > 0 && (
                      <p className="mb-1 whitespace-pre text-lg font-mono">
                        {chordSegments.map((segment, idx) => {
                          if (segment.type === 'space') {
                            return <span key={idx}>{segment.content}</span>;
                          } else {
                            // Parse position from chord name format: "C:2" -> chord "C", position 2
                            const positionMatch = segment.content.match(/^(.+):(\d+)$/);
                            const chordName = positionMatch ? positionMatch[1].trim() : segment.content;
                            const chordPosition = positionMatch ? parseInt(positionMatch[2], 10) : 1;
                            
                            return (
                              <span
                                key={idx}
                                className="inline-flex items-center gap-1.5 px-2 py-1 bg-primary-100 text-primary-700 rounded text-sm font-medium -mx-2"
                              >
                                <span>{formatChordNameForDisplay(chordName)}</span>
                                {chordPosition > 1 && (
                                  <span className="inline-flex items-center justify-center rounded-full bg-primary-700 text-white text-xs font-medium leading-[1em] min-w-[1em] px-1">
                                    {chordPosition}
                                  </span>
                                )}
                              </span>
                            );
                          }
                        })}
                      </p>
                    )}
                    <p className="text-base whitespace-pre">{lyricLine === '' ? '\u00A0' : lyricLine}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Chord Charts Section */}
        {chordDiagrams.length > 0 ? (
          <div 
            className="mb-6 md:mb-0 md:flex-shrink-0 order-1 md:order-2"
            style={optimalChordWidth !== null ? { width: `${optimalChordWidth}px` } : undefined}
          >
            {/* Desktop: flex wrap layout */}
            <div className="hidden md:flex flex-wrap gap-x-3 gap-y-6 justify-start">
              {chordDiagrams.map(({ name, frets, baseFret, position, instrument: chordInstrument, tuning: chordTuning }) => (
                <ChordDiagram 
                  key={`${name}-${position}`}
                  frets={frets} 
                  baseFret={baseFret}
                  chordName={name}
                  position={position}
                  instrument={chordInstrument || instrument}
                  tuning={chordTuning || tuning}
                />
              ))}
            </div>
            {/* Mobile: horizontal scrollable line */}
            <div className="md:hidden flex gap-x-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
              {chordDiagrams.map(({ name, frets, baseFret, position, instrument: chordInstrument, tuning: chordTuning }) => (
                <ChordDiagram 
                  key={`${name}-${position}`}
                  frets={frets} 
                  baseFret={baseFret}
                  chordName={name}
                  position={position}
                  instrument={chordInstrument || instrument}
                  tuning={chordTuning || tuning}
                />
              ))}
            </div>
          </div>
        ) : uniqueChordPairs.length > 0 ? (
          // Show message if chords exist but don't match
          <div 
            className="mb-6 md:mb-0 md:flex-shrink-0 order-1 md:order-2"
            style={optimalChordWidth !== null ? { width: `${optimalChordWidth}px` } : undefined}
          >
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-2">Chord Charts</h3>
              <p className="text-xs text-gray-600">
                Some chords in this song don't have diagrams available: {uniqueChordPairs.map(p => p.position > 1 ? `${p.name}:${p.position}` : p.name).join(', ')}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {/* Share with Groups Modal */}
      {showShareModal && song && (
        <ShareWithGroupsModal
          songId={song.id}
          songTitle={song.title}
          userGroups={
            (() => {
              // Try to get groups from the relation first
              const groupMembersList = groupsData?.data?.groupMembers || [];
              let groups = Array.isArray(groupMembersList)
                ? groupMembersList
                    .map(gm => gm?.group)
                    .filter(Boolean)
                    .filter(group => group && group.id)
                : [];
              
              // Fallback: if relation isn't populated, use direct groups query
              if (groups.length === 0 && directGroupsData?.groups) {
                groups = directGroupsData.groups.filter(group => group && group.id);
              }
              
              // Debug logging
              console.log('SongSheet - groupsData:', groupsData);
              console.log('SongSheet - groupMembers:', groupsData?.groupMembers);
              console.log('SongSheet - directGroupsData:', directGroupsData);
              console.log('SongSheet - final groups:', groups);
              
              return groups;
            })()
          }
          onClose={() => {
            setShowShareModal(false);
            setShareError(null);
          }}
          onSuccess={() => {
            setShowShareModal(false);
            setShareError(null);
          }}
        />
      )}
    </div>
  );
}

// Share with Groups Modal Component
function ShareWithGroupsModal({ songId, songTitle, userGroups, onClose, onSuccess }) {
  const { user } = useAuth();
  const [selectedGroups, setSelectedGroups] = useState(new Set());
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState(null);

  // Ensure userGroups is always an array
  const safeUserGroups = Array.isArray(userGroups) ? userGroups : [];
  
  // Debug: log groups data to help troubleshoot
  if (safeUserGroups.length === 0 && userGroups !== undefined) {
    console.log('ShareWithGroupsModal: No groups found. userGroups:', userGroups);
  }

  const handleToggleGroup = (groupId) => {
    const newSelected = new Set(selectedGroups);
    if (newSelected.has(groupId)) {
      newSelected.delete(groupId);
    } else {
      newSelected.add(groupId);
    }
    setSelectedGroups(newSelected);
  };

  const handleShare = async () => {
    if (selectedGroups.size === 0) {
      setError('Please select at least one group.');
      return;
    }

    if (!user?.id) {
      setError('You must be logged in to share songs.');
      return;
    }

    setSharing(true);
    setError(null);

    try {
      await shareSongsWithGroups(
        [songId],
        Array.from(selectedGroups),
        user.id
      );
      onSuccess();
    } catch (err) {
      console.error('Error sharing song:', err);
      setError(err.message || 'Failed to share song. Please try again.');
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold mb-4">Share "{songTitle}" with Groups</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        {safeUserGroups.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>You're not a member of any groups yet.</p>
            <p className="text-sm mt-2">Join or create a group to share songs.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
            {safeUserGroups.map((group) => {
              if (!group || !group.id) return null;
              return (
                <label
                  key={group.id}
                  className="flex items-center gap-2 p-2 border rounded hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedGroups.has(group.id)}
                    onChange={() => handleToggleGroup(group.id)}
                    className="rounded"
                  />
                  <div className="flex-1">
                    <div className="font-medium">{group.name || 'Unnamed Group'}</div>
                    {group.description && (
                      <div className="text-sm text-gray-600">{group.description}</div>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={sharing}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          {safeUserGroups.length > 0 && (
            <button
              onClick={handleShare}
              disabled={sharing || selectedGroups.size === 0}
              className="btn btn-primary"
            >
              {sharing ? 'Sharing...' : `Share with ${selectedGroups.size} Group${selectedGroups.size !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
