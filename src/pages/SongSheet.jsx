import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useSong, useSongInSongbooks, useAccessibleSongs, useMyGroups, useAllDatabaseChords } from '../db/queries';
import { db } from '../db/schema';
import { renderInlineChords, renderAboveChords, parseLyricsWithChords, lyricsWithChordsToText, extractElements } from '../utils/lyrics-helpers';
import { useState, useRef, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useRegisterSongActions } from '../contexts/SongActionsContext';
import { deleteSong, createSong, updateSong, shareSongsWithGroups, recordSongPlay } from '../db/mutations';
import { AppError, ERROR_CODES } from '../utils/error-handling';
import ChordAutocomplete from '../components/ChordAutocomplete';
import StyledChordEditor from '../components/StyledChordEditor';
import ChordDiagram from '../components/ChordDiagram';
import { findChord } from '../utils/chord-library';
import { formatChordNameForDisplay } from '../utils/chord-formatting';
import { MicrophoneStageIcon, ChordIcon, PlusIcon, ImportIcon, TextboxIcon } from '../utils/icons';
import PDFImportModal from '../components/PDFImportModal';
import PDFExportModal from '../components/PDFExportModal';
import { useEditingSong } from '../contexts/EditingSongContext';

function EditModeScrollWrapper({ isEditing, scrollContainerRef, editViewportHeight, children, renderBanner }) {
  if (!isEditing) return children;
  return (
    <div
      ref={scrollContainerRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        width: '100%',
        height: editViewportHeight,
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {renderBanner()}
      <div className="w-full px-4 pb-8 pt-4 xl:container xl:mx-auto">
        {children}
      </div>
    </div>
  );
}

export default function SongSheet() {
  // All hooks must be called in the same order on every render
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { setEditingSong } = useEditingSong() || {};
  const chordEditorRef = useRef(null);
  const sectionButtonRef = useRef(null);
  const scrollContainerRef = useRef(null);

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
  const [showPDFExportModal, setShowPDFExportModal] = useState(false);
  const [sectionDropdownOpen, setSectionDropdownOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [chordsPanelVisible, setChordsPanelVisible] = useState(true);
  const [titleScrolledOut, setTitleScrolledOut] = useState(false);
  const [chordDiagramsSticky, setChordDiagramsSticky] = useState(false);

  const [editViewportHeight, setEditViewportHeight] = useState(
    typeof window !== 'undefined' && window.visualViewport
      ? window.visualViewport.height
      : typeof window !== 'undefined'
        ? window.innerHeight
        : 0
  );

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const showEditUI = location.pathname === '/songs/new' || isEditing;
    if (!vv || !showEditUI) return;
    const onResize = () => setEditViewportHeight(vv.height);
    onResize();
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, [isEditing, location.pathname]);

  useEffect(() => {
    const showEditUI = location.pathname === '/songs/new' || isEditing;
    setEditingSong?.(showEditUI);
    return () => setEditingSong?.(false);
  }, [isEditing, location.pathname, setEditingSong]);

  const menuRef = useRef(null);
  const songSelectorRef = useRef(null);
  const headerBlockRef = useRef(null);
  const chordDiagramsRef = useRef(null);

  // Nav bar height (px) – must match Navigation h-14 for scroll/intersection logic
  const NAV_BAR_HEIGHT = 56;

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

  // Close song selector when clicking outside (menu click-outside is handled in Navigation)
  useEffect(() => {
    function handleClickOutside(event) {
      if (songSelectorRef.current && !songSelectorRef.current.contains(event.target)) {
        setSongSelectorOpen(false);
      }
    }

    if (songSelectorOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [songSelectorOpen]);

  // Close section dropdown when clicking outside or pressing Escape
  useEffect(() => {
    function handleClickOutside(event) {
      if (sectionButtonRef.current && !sectionButtonRef.current.contains(event.target)) {
        setSectionDropdownOpen(false);
      }
    }
    function handleEscape(e) {
      if (e.key === 'Escape') setSectionDropdownOpen(false);
    }

    if (sectionDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [sectionDropdownOpen]);

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
          const chordId = chord.chordId || null;
          const key = `${normalizedChord}:${position}`;
          if (!chordPairs.has(key)) {
            chordPairs.set(key, { name: normalizedChord, position, chordId });
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
      .map(({ name: chordName, position, chordId }) => {
        // Try ID lookup first if available, then fall back to name+position lookup
        // Order: embedded, database personal, database main
        // Disable position fallback to ensure diagram matches the requested position
        const chordData = chordId
          ? findChord(chordName, instrument, tuning, position, {
              databaseChords: dbChords,
              embeddedChords: embeddedChords,
            }, chordId, false)
          : findChord(chordName, instrument, tuning, position, {
              databaseChords: dbChords,
              embeddedChords: embeddedChords,
            }, null, false);
        
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

  // Container ref for layout
  const containerRef = useRef(null);

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

  // Get register function for song actions
  const registerSongActions = useRegisterSongActions();

  // Create context value for song actions (only in view mode)
  // MUST be before any early returns to follow Rules of Hooks
  const songActionsValue = useMemo(() => {
    if (!isViewMode || isEditing || !song) {
      return null;
    }
    
    // Check if chords exist (chordDiagrams is computed later, so check uniqueChordPairs)
    const hasChords = uniqueChordPairs && uniqueChordPairs.length > 0;
    
    return {
      menuOpen,
      setMenuOpen,
      menuRef,
      chordMode,
      setChordMode,
      canEdit,
      isCreator,
      chordsPanelVisible,
      hasChords,
      toggleChordsPanel: () => setChordsPanelVisible(prev => !prev),
      songTitle: song.title,
      songArtist: song.artist,
      showTitleInNavBar: titleScrolledOut,
      handleEditClick: () => {
        // Store current chord mode before entering edit mode
        setPreviousChordMode(chordMode);
        // Force inline mode for editing (users can't position chords in "chords above" view)
        if (chordMode === 'above') {
          setChordMode('inline');
        }
        setIsEditing(true);
        setMenuOpen(false);
      },
      handleShareClick: () => {
        setShowShareModal(true);
        setMenuOpen(false);
      },
      handleDeleteClick: () => {
        setShowDeleteModal(true);
        setMenuOpen(false);
      },
      handleChordModeChange: (mode) => {
        setChordMode(mode);
        setMenuOpen(false);
      },
      handleExportPdfClick: () => {
        setShowPDFExportModal(true);
        setMenuOpen(false);
      },
    };
  }, [isViewMode, isEditing, menuOpen, chordMode, canEdit, isCreator, song, chordsPanelVisible, uniqueChordPairs, titleScrolledOut, setChordMode, setMenuOpen]);

  // Register/unregister song actions when value changes
  useEffect(() => {
    if (registerSongActions) {
      registerSongActions(songActionsValue);
    }
    // Cleanup: unregister when component unmounts or value becomes null
    return () => {
      if (registerSongActions) {
        registerSongActions(null);
      }
    };
  }, [songActionsValue, registerSongActions]);

  // Title/artist in nav bar: observe when header block scrolls under nav (view mode only)
  useEffect(() => {
    if (!isViewMode || isEditing || !headerBlockRef.current || !song) return;
    const el = headerBlockRef.current;
    const observer = new IntersectionObserver(
      ([entry]) => setTitleScrolledOut(!entry.isIntersecting),
      { root: null, rootMargin: `-${NAV_BAR_HEIGHT}px 0px 0px 0px`, threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isViewMode, isEditing, song]);

  // Chord diagrams sticky + shrink: detect when chord section touches nav (view mode, panel visible only)
  useEffect(() => {
    if (!isViewMode || isEditing || !chordsPanelVisible || chordDiagrams.length === 0) return;
    let rafId = null;
    const onScroll = () => {
      rafId = requestAnimationFrame(() => {
        const el = chordDiagramsRef.current;
        if (!el) return;
        const top = el.getBoundingClientRect().top;
        setChordDiagramsSticky(top <= NAV_BAR_HEIGHT);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // initial check
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [isViewMode, isEditing, chordsPanelVisible, chordDiagrams.length]);


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

  // Shared import handler for create and edit modes
  const handleImport = (importedData) => {
    if (importedData.title) setTitle(importedData.title);
    if (importedData.artist) setArtist(importedData.artist);
    if (importedData.lyricsText) setLyricsText(importedData.lyricsText);
  };

  const instructionalText = 'Type or paste your lyrics below. Add chords, section headings or instructions either by using the buttons in the toolbar above, or pressing the / key.';

  // Create Mode
  if (isCreateMode) {
    return (
      <>
        <PDFImportModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          onImport={handleImport}
        />
        <EditModeScrollWrapper
          isEditing={true}
          scrollContainerRef={scrollContainerRef}
          editViewportHeight={editViewportHeight}
          renderBanner={() => (
            <div className="sticky top-0 left-0 right-0 bg-gray-50 z-50">
              <div className="w-full px-4 xl:container xl:mx-auto xl:pl-16">
                <div className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <span className="h-11 flex items-center flex-shrink-0" aria-hidden>
                      <PlusIcon weight="light" size={24} className="text-gray-600" />
                    </span>
                    <button
                      type="button"
                      onClick={() => chordEditorRef.current?.openChordModal?.()}
                      className="h-11 min-w-[44px] flex flex-col items-center justify-center gap-0.5 text-gray-600 hover:text-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded px-2 text-base font-normal"
                      aria-label="Insert chord"
                    >
                      <ChordIcon weight="light" size={24} className="flex-shrink-0" />
                      <span>Chord</span>
                    </button>
                    <div className="relative" ref={sectionButtonRef}>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          chordEditorRef.current?.captureCursorPosition?.();
                        }}
                        onClick={() => setSectionDropdownOpen((open) => !open)}
                        className="h-11 min-w-[44px] flex flex-col items-center justify-center gap-0.5 text-gray-600 hover:text-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded px-2 text-base font-normal"
                        aria-label="Insert section"
                        aria-expanded={sectionDropdownOpen}
                        aria-haspopup="menu"
                      >
                        <TextboxIcon weight="light" size={24} className="flex-shrink-0" />
                        <span>Section</span>
                      </button>
                      {sectionDropdownOpen && (
                        <div className="absolute left-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-10 py-1">
                          <button
                            type="button"
                            onClick={() => {
                              chordEditorRef.current?.insertSection?.('heading', () => setSectionDropdownOpen(false));
                            }}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors"
                          >
                            Heading
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              chordEditorRef.current?.insertSection?.('instruction', () => setSectionDropdownOpen(false));
                            }}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors"
                          >
                            Instruction
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowImportModal(true)}
                      disabled={saving}
                      className="h-11 px-4 flex items-center gap-2 text-base font-normal text-gray-600 hover:text-gray-800 disabled:opacity-50 rounded-lg"
                      aria-label="Import from PDF"
                    >
                      <ImportIcon weight="light" size={18} className="flex-shrink-0" />
                      Import
                    </button>
                    <div className="h-5 w-px bg-gray-300 flex-shrink-0" aria-hidden />
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleCancel}
                        disabled={saving}
                        className="h-11 px-4 flex items-center text-base font-normal text-gray-600 hover:text-gray-800 disabled:opacity-50 rounded-lg"
                      >
                        Cancel
                      </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="btn btn-primary text-base font-normal h-11 min-h-[44px] flex items-center px-8"
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        >
          <div className="mb-6">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Song Title"
              className="heading-alice mb-2 w-full bg-transparent border-b-2 border-transparent focus:border-gray-300 outline-none p-0 transition-colors placeholder:text-gray-400"
            />
            <input
              type="text"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              placeholder="Artist Name"
              className="text-xl text-gray-600 w-full bg-transparent border-b-2 border-transparent focus:border-gray-300 outline-none p-0 transition-colors placeholder:text-gray-500"
            />
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-4">{instructionalText}</p>
            <StyledChordEditor
              ref={chordEditorRef}
              value={lyricsText}
              onChange={(e) => setLyricsText(e.target.value)}
              placeholder=""
              rows={30}
              className="w-full p-0 border-none outline-none focus:outline-none bg-transparent text-base leading-relaxed resize-none placeholder:text-gray-400"
              instrument={instrument}
              tuning={tuning}
              userId={user?.id}
            />
          </div>
        </EditModeScrollWrapper>
      </>
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

      {isEditing && (
        <PDFImportModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          onImport={handleImport}
        />
      )}

      <EditModeScrollWrapper
        isEditing={isEditing}
        scrollContainerRef={scrollContainerRef}
        editViewportHeight={editViewportHeight}
        renderBanner={() => (
          <div className="sticky top-0 left-0 right-0 bg-gray-50 z-50">
            <div className="w-full px-4 xl:container xl:mx-auto xl:pl-16">
              <div className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <span className="h-11 flex items-center flex-shrink-0" aria-hidden>
                    <PlusIcon weight="light" size={24} className="text-gray-600" />
                  </span>
                  <button
                    type="button"
                    onClick={() => chordEditorRef.current?.openChordModal?.()}
                    className="h-11 min-w-[44px] flex flex-col items-center justify-center gap-0.5 text-gray-600 hover:text-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded px-2 text-base font-normal"
                    aria-label="Insert chord"
                  >
                    <ChordIcon weight="light" size={24} className="flex-shrink-0" />
                    <span>Chord</span>
                  </button>
                  <div className="relative" ref={sectionButtonRef}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        chordEditorRef.current?.captureCursorPosition?.();
                      }}
                      onClick={() => setSectionDropdownOpen((open) => !open)}
                      className="h-11 min-w-[44px] flex flex-col items-center justify-center gap-0.5 text-gray-600 hover:text-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded px-2 text-base font-normal"
                      aria-label="Insert section"
                      aria-expanded={sectionDropdownOpen}
                      aria-haspopup="menu"
                    >
                      <TextboxIcon weight="light" size={24} className="flex-shrink-0" />
                      <span>Section</span>
                    </button>
                    {sectionDropdownOpen && (
                      <div className="absolute left-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-10 py-1">
                        <button
                          type="button"
                          onClick={() => {
                            chordEditorRef.current?.insertSection?.('heading', () => setSectionDropdownOpen(false));
                          }}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors"
                        >
                          Heading
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            chordEditorRef.current?.insertSection?.('instruction', () => setSectionDropdownOpen(false));
                          }}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors"
                        >
                          Instruction
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!lyricsText.trim() && (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowImportModal(true)}
                        disabled={saving}
                        className="h-11 px-4 flex items-center gap-2 text-base font-normal text-gray-600 hover:text-gray-800 disabled:opacity-50 rounded-lg"
                        aria-label="Import from PDF"
                      >
                        <ImportIcon weight="light" size={18} className="flex-shrink-0" />
                        Import
                      </button>
                      <div className="h-5 w-px bg-gray-300 flex-shrink-0" aria-hidden />
                    </>
                  )}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleCancelEdit}
                    disabled={saving}
                    className="h-11 px-4 flex items-center text-base font-normal text-gray-600 hover:text-gray-800 disabled:opacity-50 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="btn btn-primary text-base font-normal h-11 min-h-[44px] flex items-center px-8"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      >
      <div className="mb-6">
        <div ref={headerBlockRef} className="flex items-start justify-between mb-2">
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
                <div className="flex items-center gap-2 mb-0.5">
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
                  <div className="flex items-center gap-1">
                    <MicrophoneStageIcon size={18} className="text-gray-500" />
                    <span className="text-xl text-gray-600">{song.artist}</span>
                  </div>
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
          </div>
        </div>
      </div>

      <div ref={containerRef} className="flex flex-col">
        {/* Lyrics Section */}
        <div className="flex-1 order-2">
          {isEditing ? (
            <>
              <p className="text-sm text-gray-600 mb-4">{instructionalText}</p>
              <StyledChordEditor
                ref={chordEditorRef}
                value={lyricsText}
                onChange={(e) => setLyricsText(e.target.value)}
                placeholder=""
                rows={30}
                className="w-full p-0 border-none outline-none focus:outline-none bg-transparent text-base leading-relaxed resize-none font-mono"
                instrument={instrument}
                tuning={tuning}
                userId={user?.id}
              />
            </>
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
                        // Parse chord format: "C:2:abc123" or "C::abc123" or "C:2" or "C"
                        let chordName = part;
                        let chordPosition = 1;
                        
                        // Try to match format with ID: "C:2:abc123" or "C::abc123"
                        const idMatch = part.match(/^(.+?):(\d*):(.+)$/);
                        if (idMatch) {
                          chordName = idMatch[1].trim();
                          const positionStr = idMatch[2];
                          chordPosition = positionStr ? parseInt(positionStr, 10) || 1 : 1;
                        } else {
                          // Try to match format without ID: "C:2" or "C"
                          const positionMatch = part.match(/^(.+):(\d+)$/);
                          if (positionMatch) {
                            chordName = positionMatch[1].trim();
                            chordPosition = parseInt(positionMatch[2], 10) || 1;
                          }
                        }
                        
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
                      <p className="mb-1 whitespace-pre text-base font-mono">
                        {chordSegments.map((segment, idx) => {
                          if (segment.type === 'space') {
                            return <span key={idx}>{segment.content}</span>;
                          } else {
                            // Parse chord name from segment content (segment.content is chord name only in chords-above)
                            const segmentContent = (segment.content || '').trim();
                            let chordName = segmentContent;
                            let chordPosition = segment.chordPosition ?? 1;

                            const idMatch = segmentContent.match(/^(.+?):(\d*):(.+)$/);
                            if (idMatch) {
                              chordName = idMatch[1].trim();
                              const positionStr = idMatch[2];
                              if (positionStr) chordPosition = parseInt(positionStr, 10) || 1;
                            } else {
                              const positionMatch = segmentContent.match(/^(.+):(\d+)$/);
                              if (positionMatch) {
                                chordName = positionMatch[1].trim();
                                chordPosition = parseInt(positionMatch[2], 10) || 1;
                              }
                            }

                            // Chord row must match lyric row character-for-character so alignment is consistent.
                            // Outer span reserves Nch for grid; inner pill sizes to content + padding (badge may extend slightly).
                            const chWidth = segmentContent.length;
                            return (
                              <span
                                key={idx}
                                className="inline-block align-top"
                                style={{
                                  width: `${chWidth}ch`,
                                  minWidth: `${chWidth}ch`,
                                  transform: 'translateX(-0.25rem)',
                                }}
                              >
                                <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-primary-100 text-primary-700 rounded text-sm font-medium">
                                  <span>{formatChordNameForDisplay(chordName)}</span>
                                  {chordPosition > 1 && (
                                    <span className="inline-flex items-center justify-center rounded-full bg-primary-700 text-white text-xs font-medium leading-[1em] min-w-[1em] px-1">
                                      {chordPosition}
                                    </span>
                                  )}
                                </span>
                              </span>
                            );
                          }
                        })}
                      </p>
                    )}
                    <p className="text-base whitespace-pre font-mono">{lyricLine === '' ? '\u00A0' : lyricLine}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Chord Charts Section */}
        {chordDiagrams.length > 0 ? (
          <div 
            ref={chordDiagramsRef}
            className={`mb-6 order-1 transition-all duration-300 ease-in-out ${
              !chordsPanelVisible 
                ? 'max-h-0 overflow-hidden mb-0' 
                : 'max-h-[1000px]'
            } ${chordsPanelVisible ? 'sticky top-14 z-10 bg-gray-50' : ''} ${
              chordDiagramsSticky ? 'w-[100vw] max-w-none ml-[calc(50%-50vw)] overflow-hidden' : ''
            }`}
          >
            {/* Horizontal scrollable line – scale applied to inner so full row scales and bar fills width */}
            <div className={`flex gap-x-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent transition-opacity duration-200 ${
              chordsPanelVisible ? 'opacity-100 delay-150' : 'opacity-0 delay-0'
            } ${chordDiagramsSticky ? 'w-[125vw] min-w-[125vw] origin-top-left transition-transform duration-150 ease-out scale-[0.8]' : ''}`}>
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
            className={`mb-6 order-1 transition-all duration-300 ease-in-out ${
              !chordsPanelVisible 
                ? 'max-h-0 overflow-hidden mb-0' 
                : 'max-h-[1000px]'
            }`}
          >
            <div className={`bg-gray-50 border border-gray-200 rounded-lg p-4 transition-opacity duration-200 ${
              chordsPanelVisible ? 'opacity-100 delay-150' : 'opacity-0 delay-0'
            }`}>
              <h3 className="text-sm font-semibold mb-2">Chord Charts</h3>
              <p className="text-xs text-gray-600">
                Some chords in this song don't have diagrams available: {uniqueChordPairs.map(p => p.position > 1 ? `${p.name}:${p.position}` : p.name).join(', ')}
              </p>
            </div>
          </div>
        ) : null}
      </div>
      </EditModeScrollWrapper>

      {/* PDF Export Modal */}
      {showPDFExportModal && song && (
        <PDFExportModal
          song={song}
          chords={chords}
          chordDiagrams={chordDiagrams}
          instrument={instrument}
          tuning={tuning}
          defaultChordMode={chordMode}
          isOpen={showPDFExportModal}
          onClose={() => setShowPDFExportModal(false)}
        />
      )}

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
