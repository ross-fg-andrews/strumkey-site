import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { createSongbook, updateSongbook, addSongToSongbook, removeSongFromSongbook, updateSongbookSongOrder } from '../db/mutations';
import { useAccessibleSongs, useSongbook, useMySongbooks } from '../db/queries';
import { getChordNames, searchChordNames } from '../utils/chord-library';
import { formatChordNameForDisplay } from '../utils/chord-formatting';
import { db } from '../db/schema';

// Helper function to extract unique chords from song chords data
function getUniqueChords(song) {
  try {
    if (!song.chords) return [];
    const chordsArray = JSON.parse(song.chords);
    const uniqueChords = [...new Set(chordsArray.map(c => c.chord))];
    return uniqueChords;
  } catch {
    return [];
  }
}

// Component to render chords as labels
function ChordLabels({ chords }) {
  if (chords.length === 0) {
    return <span className="text-gray-400">No chords</span>;
  }

  const displayChords = chords.slice(0, 3);
  const remainingCount = chords.length - 3;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {displayChords.map((chord, index) => (
        <span
          key={index}
          className="inline-block px-2 py-1 bg-primary-100 text-primary-700 rounded text-sm font-medium"
        >
          {formatChordNameForDisplay(chord)}
        </span>
      ))}
      {remainingCount > 0 && (
        <span className="text-gray-500 text-sm">
          and {remainingCount} more
        </span>
      )}
    </div>
  );
}

// Chord filter component (reused from SongsIndex)
function ChordFilter({ selectedChords, onChordsChange }) {
  const [chordQuery, setChordQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const allChords = useMemo(() => getChordNames(), []);
  const filteredChords = useMemo(() => {
    if (!chordQuery) return allChords.slice(0, 20);
    return searchChordNames(chordQuery, 'ukulele', 'ukulele_standard', 20);
  }, [chordQuery, allChords]);

  const handleAddChord = (chord) => {
    if (!selectedChords.includes(chord)) {
      onChordsChange([...selectedChords, chord]);
    }
    setChordQuery('');
    setShowDropdown(false);
  };

  const handleRemoveChord = (chord) => {
    onChordsChange(selectedChords.filter(c => c !== chord));
  };

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-2 mb-2">
        {selectedChords.map((chord) => (
          <span
            key={chord}
            className="inline-flex items-center gap-1 px-2 py-1 bg-primary-600 text-white rounded text-sm"
          >
            {chord}
            <button
              type="button"
              onClick={() => handleRemoveChord(chord)}
              className="hover:text-primary-200 focus:outline-none"
              aria-label={`Remove ${chord}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="relative">
        <input
          type="text"
          value={chordQuery}
          onChange={(e) => {
            setChordQuery(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => {
            setTimeout(() => setShowDropdown(false), 200);
          }}
          placeholder="Add chord filter..."
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
        {showDropdown && filteredChords.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
            {filteredChords
              .filter(chord => !selectedChords.includes(chord))
              .map((chord) => (
                <button
                  key={chord}
                  type="button"
                  onClick={() => handleAddChord(chord)}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors"
                >
                  {chord}
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SongbookEditor() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // Songbooks are always created as private - users can share them later
  const type = 'private';
  const groupId = '';
  const [songbookId, setSongbookId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChords, setSelectedChords] = useState([]);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [justCreated, setJustCreated] = useState(false);
  const [addingSongId, setAddingSongId] = useState(null);
  // Optimistic updates: track songs that were just added but might not be in query yet
  const [optimisticSongbookSongs, setOptimisticSongbookSongs] = useState([]);

  // Don't run queries until auth is loaded
  const userId = authLoading ? null : (user?.id || null);

  // Get accessible songs (only if user is loaded)
  // Songbooks are created as private, so use all accessible songs
  const accessibleSongsQuery = useAccessibleSongs(userId);
  const allSongs = accessibleSongsQuery.data?.songs || [];

  // Get songbook data if it exists (only query when we have an ID)
  const { data: songbookData } = useSongbook(songbookId, userId);
  const songbook = songbookData?.songbooks?.[0];
  const relationshipSongbookSongs = songbook?.songbookSongs || [];

  // Direct query for songbookSongs (primary source - more reliable than relationship query)
  const { data: directSongbookSongsData } = db.useQuery({
    songbookSongs: {
      $: {
        where: songbookId ? { songbookId } : { songbookId: '' },
        order: { order: 'asc' },
      },
      song: {},
    },
  });
  const directSongbookSongs = directSongbookSongsData?.songbookSongs || [];

  // Use direct query as primary source (relationship queries can have permission issues)
  // Fall back to relationship query only if direct query returns nothing and relationship has results
  const rawSongbookSongs = directSongbookSongs.length > 0 
    ? directSongbookSongs 
    : relationshipSongbookSongs;
  
  // Enrich songbookSongs with song data from accessible songs if relationship isn't loaded
  // This ensures we can display songs even if the relationship query fails
  // Use allSongs (which includes both accessible songs and group songs) for the map
  const accessibleSongsMap = new Map(
    allSongs.map(song => [song.id, song])
  );
  
  const songbookSongs = rawSongbookSongs.map(ss => {
    // If song relationship is loaded, use it
    if (ss.song) {
      return ss;
    }
    // Otherwise, try to find the song in accessible songs
    const song = accessibleSongsMap.get(ss.songId);
    if (song) {
      return { ...ss, song };
    }
    // If song not found, return as-is (will be filtered out in rendering)
    return ss;
  });
  
  // Merge with optimistic updates (songs that were just added but not yet in query)
  // Filter out optimistic songs that are now in the real query
  const realSongIds = new Set(songbookSongs.map(ss => ss.songId));
  const optimisticOnly = optimisticSongbookSongs.filter(oss => !realSongIds.has(oss.songId));
  const allSongbookSongs = [...songbookSongs, ...optimisticOnly];
  
  const selectedSongIds = new Set(allSongbookSongs.map(ss => ss.songId));
  
  // Clean up optimistic updates when they appear in the real query
  useEffect(() => {
    if (optimisticSongbookSongs.length > 0 && realSongIds.size > 0) {
      // Remove optimistic songs that are now in the real query
      setOptimisticSongbookSongs(prev => 
        prev.filter(oss => !realSongIds.has(oss.songId))
      );
    }
  }, [realSongIds.size, songbookSongs.length]);

  // Debug: Log songbook data changes
  useEffect(() => {
    if (songbookId) {
      const relationshipCount = relationshipSongbookSongs.length;
      const directCount = directSongbookSongs.length;
      const usingDirect = directCount > relationshipCount;
      
      // Only log when there are changes to avoid spam
      if (directCount > 0 || relationshipCount > 0) {
        const songsWithData = songbookSongs.filter(ss => ss.song).length;
        const songsWithoutData = songbookSongs.filter(ss => !ss.song).length;
        
        console.log('📊 Songbook query data:', {
          songbookId,
          songbook: songbook ? { id: songbook.id, title: songbook.title } : null,
          relationshipQuery: {
            count: relationshipCount,
            songIds: relationshipSongbookSongs.map(ss => ss.songId),
          },
          directQuery: {
            count: directCount,
            songIds: directSongbookSongs.map(ss => ss.songId),
            songsWithRelationship: directSongbookSongs.filter(ss => ss.song).length,
            songsWithoutRelationship: directSongbookSongs.filter(ss => !ss.song).length,
          },
          usingDirectQuery: usingDirect,
          finalCount: songbookSongs.length,
          songsWithData,
          songsWithoutData,
          selectedSongIds: Array.from(selectedSongIds),
        });
      }
      
      // If direct query has more songs than the relationship query, log a warning
      // This is expected - relationship queries can have permission issues, so we use direct query
      if (directCount > relationshipCount && relationshipCount > 0) {
        console.warn('⚠️ Direct query found more songs than relationship query - this is expected, using direct query.', {
          directCount,
          relationshipCount,
        });
      }
      
      // Check if a recently added song is missing from the direct query
      // Only report error if:
      // 1. The transaction synced successfully (window.lastAddSynced === true)
      // 2. At least 1 second has passed (to allow real-time queries to propagate)
      // 3. The song still isn't found in the direct query
      if (addingSongId && directCount === 0 && window.lastAddSynced === true) {
        const timeSinceAdd = Date.now() - (window.lastAddTime || 0);
        // Wait at least 1 second before reporting - real-time queries need time to propagate
        if (timeSinceAdd >= 1000 && timeSinceAdd < 10000) {
          console.error('❌ Song was added and synced, but not found in direct query after 1+ seconds!', {
            addingSongId,
            directCount,
            relationshipCount,
            timeSinceAdd: `${(timeSinceAdd / 1000).toFixed(2)}s`,
          });
          console.error('   This indicates a PERMISSIONS issue in InstantDB dashboard.');
          console.error('   Solution: Go to InstantDB dashboard → Permissions → songbookSongs');
          console.error('   Set CREATE permission: authenticated users can create');
          console.error('   Set READ permission: authenticated users can view');
        }
      }
    }
  }, [songbookId, songbook, relationshipSongbookSongs, directSongbookSongs, songbookSongs, selectedSongIds, addingSongId]);

  // Fallback: Query user's songbooks to find newly created one if ID not set (only if user is loaded)
  const { data: mySongbooksData } = useMySongbooks(userId);
  const mySongbooks = mySongbooksData?.songbooks || [];

  // Detect newly created songbook from real-time query
  useEffect(() => {
    if (justCreated && !songbookId && title.trim() && userId) {
      // Find the most recently created private songbook that matches our form data
      const matchingSongbook = mySongbooks
        .filter(sb => 
          sb.title === title.trim() && 
          sb.createdBy === userId &&
          sb.type === 'private'
        )
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
      
      if (matchingSongbook) {
        setSongbookId(matchingSongbook.id);
        setJustCreated(false);
      }
    }
  }, [mySongbooks, songbookId, title, userId, justCreated]);

  // Filter available songs (exclude already selected, apply search/filter)
  const filteredSongs = useMemo(() => {
    let filtered = allSongs.filter(song => !selectedSongIds.has(song.id));

    // Filter by search query (title or artist)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(song => {
        const title = (song.title || '').toLowerCase();
        const artist = (song.artist || '').toLowerCase();
        return title.includes(query) || artist.includes(query);
      });
    }

    // Filter by chords - only show songs that use ONLY the selected chords
    if (selectedChords.length > 0) {
      filtered = filtered.filter(song => {
        const songChords = getUniqueChords(song);
        const selectedChordsSet = new Set(selectedChords);
        
        if (songChords.length === 0) return false;
        return songChords.every(chord => selectedChordsSet.has(chord));
      });
    }

    return filtered;
  }, [allSongs, selectedSongIds, searchQuery, selectedChords]);

  // Handle saving songbook metadata
  const handleSaveSongbook = async (e) => {
    e.preventDefault();
    setError(null);

    if (!userId) {
      setError('You must be logged in to create a songbook.');
      return;
    }

    if (!title.trim()) {
      setError('Please enter a songbook title.');
      return;
    }

    setSaving(true);

    try {
      if (songbookId) {
        // Update existing songbook (title and description only)
        await updateSongbook(songbookId, {
          title: title.trim(),
          description: description.trim() || null,
        });
      } else {
        // Create new songbook as private (InstantDB will generate the ID)
        const songbookData = {
          title: title.trim(),
          description: description.trim() || null,
          type: 'private',
          groupId: '', // Workaround: database requires groupId, use empty string for private
          createdBy: userId,
        };
        
        console.log('Creating songbook with data:', songbookData);
        await createSongbook(songbookData);
        console.log('Songbook creation transaction completed');
        
        // Set flag to indicate we just created a songbook
        // The useEffect will detect it from the real-time query
        setJustCreated(true);
      }
    } catch (err) {
      console.error('Error saving songbook:', err);
      console.error('Error details:', {
        message: err?.message,
        type: err?.type,
        status: err?.status,
        op: err?.op,
        errors: err?.errors,
        data: err?.data,
        fullError: JSON.stringify(err, null, 2),
      });
      
      // Provide more helpful error message
      let errorMessage = 'Failed to save songbook. ';
      if (err?.message) {
        errorMessage += err.message;
      } else if (err?.errors && Array.isArray(err.errors)) {
        errorMessage += err.errors.join(', ');
      } else {
        errorMessage += 'Please check the browser console for details.';
      }
      
      setError(errorMessage);
      setJustCreated(false);
    } finally {
      setSaving(false);
    }
  };

  // Handle adding a song to the songbook
  const handleAddSong = async (songId, songData = null) => {
    console.log('handleAddSong called with:', { songId, songbookId, selectedSongIds: Array.from(selectedSongIds) });
    
    if (!songbookId) {
      setError('Please save the songbook first before adding songs.');
      return;
    }

    // Check if song is already in the songbook
    if (selectedSongIds.has(songId)) {
      console.log('Song already in songbook, ignoring');
      setError('This song is already in the songbook.');
      return;
    }

    if (addingSongId === songId) {
      console.log('Already adding this song, ignoring duplicate click');
      return;
    }

    if (!userId) {
      setError('You must be logged in to add songs to a songbook.');
      return;
    }

    setAddingSongId(songId);
    setError(null);
    const addStartTime = Date.now();
    window.lastAddTime = addStartTime; // Track when we added for permission checking
    window.lastAddSynced = false; // Track if transaction synced

    try {
      // Calculate the next order (max order + 1)
      const maxOrder = songbookSongs.length > 0
        ? Math.max(...songbookSongs.map(ss => ss.order || 0))
        : -1;
      const newOrder = maxOrder + 1;

      console.log('Adding song to songbook:', { songbookId, songId, newOrder, songbookSongsCount: songbookSongs.length });
      
      // Private songbooks can add any accessible song
      const result = await addSongToSongbook(songbookId, songId, newOrder);
      
      console.log('addSongToSongbook result:', result);
      
      // Check if transaction actually succeeded
      if (result?.status === 'synced') {
        window.lastAddSynced = true; // Mark that transaction synced successfully
        console.log('✅ Transaction synced successfully');
        console.log('⏳ Waiting for real-time query update (may take a moment)...');
        console.log('   The direct query should update automatically if permissions allow.');
        
        // Optimistically add the song to the UI immediately
        // Use songData passed from button click if available, otherwise find in allSongs
        const song = songData || allSongs.find(s => s.id === songId);
        if (song && song.title) {
          // Create a clean copy of the song object to ensure all properties are included
          const cleanSongData = {
            id: song.id,
            title: song.title,
            artist: song.artist || null,
            lyrics: song.lyrics || '',
            chords: song.chords || '[]',
            createdBy: song.createdBy,
            createdAt: song.createdAt,
            updatedAt: song.updatedAt,
          };
          
          const optimisticSongbookSong = {
            id: `optimistic-${songId}-${Date.now()}`, // Temporary ID
            songbookId,
            songId,
            order: newOrder,
            addedAt: Date.now(),
            song: cleanSongData, // Include full song data
          };
          setOptimisticSongbookSongs(prev => [...prev, optimisticSongbookSong]);
          console.log('✨ Optimistically added song to UI:', { 
            songId, 
            title: cleanSongData.title, 
            artist: cleanSongData.artist,
            usedPassedData: !!songData,
            optimisticSongbookSong: optimisticSongbookSong,
            hasSong: !!optimisticSongbookSong.song,
            songTitle: optimisticSongbookSong.song?.title
          });
        } else {
          console.warn('⚠️ Could not find song or song missing title for optimistic update:', {
            songId,
            foundSong: !!song,
            songTitle: song?.title,
            hasPassedData: !!songData,
            allSongsCount: allSongs.length,
          });
        }
      } else {
        window.lastAddSynced = false;
        console.error('❌ Transaction did not sync:', result);
        setError('Failed to add song. Transaction did not complete successfully.');
      }
      
      // Clear any previous errors on success
      setError(null);
    } catch (err) {
      console.error('Error adding song to songbook:', err);
      console.error('Error details:', {
        message: err?.message,
        type: err?.type,
        status: err?.status,
        op: err?.op,
        errors: err?.errors,
        data: err?.data,
        fullError: JSON.stringify(err, null, 2),
      });
      
      // Remove optimistic update on error
      setOptimisticSongbookSongs(prev => prev.filter(oss => oss.songId !== songId));
      
      let errorMessage = 'Failed to add song to songbook. ';
      if (err?.message) {
        errorMessage += err.message;
      } else if (err?.errors && Array.isArray(err.errors)) {
        errorMessage += err.errors.join(', ');
      } else {
        errorMessage += 'Please check the browser console for details.';
      }
      
      setError(errorMessage);
    } finally {
      setAddingSongId(null);
    }
  };

  // Handle removing a song from the songbook
  const handleRemoveSong = async (songbookSongId) => {
    try {
      // If it's an optimistic song (starts with "optimistic-"), just remove it from state
      if (songbookSongId.startsWith('optimistic-')) {
        setOptimisticSongbookSongs(prev => prev.filter(oss => oss.id !== songbookSongId));
        return;
      }
      
      await removeSongFromSongbook(songbookSongId);
      
      // Reorder remaining songs (only real songs, optimistic ones will get order when created)
      const remainingSongs = songbookSongs
        .filter(ss => ss.id !== songbookSongId)
        .sort((a, b) => (a.order || 0) - (b.order || 0));
      
      // Update orders sequentially
      for (let i = 0; i < remainingSongs.length; i++) {
        if (remainingSongs[i].order !== i) {
          await updateSongbookSongOrder(remainingSongs[i].id, i);
        }
      }
    } catch (err) {
      console.error('Error removing song from songbook:', err);
      setError('Failed to remove song from songbook. Please try again.');
    }
  };

  // Handle drag and drop reordering
  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.target);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = async (e, dropIndex) => {
    e.preventDefault();
    setDragOverIndex(null);

    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      return;
    }

    const sortedSongs = [...songbookSongs].sort((a, b) => (a.order || 0) - (b.order || 0));
    const draggedSong = sortedSongs[draggedIndex];
    const newSongs = [...sortedSongs];
    newSongs.splice(draggedIndex, 1);
    newSongs.splice(dropIndex, 0, draggedSong);

    // Update all affected orders
    try {
      for (let i = 0; i < newSongs.length; i++) {
        if (newSongs[i].order !== i) {
          await updateSongbookSongOrder(newSongs[i].id, i);
        }
      }
    } catch (err) {
      console.error('Error reordering songs:', err);
      setError('Failed to reorder songs. Please try again.');
    } finally {
      setDraggedIndex(null);
    }
  };

  // Helper function to render a songbook song row
  const renderSongbookSongRow = (songbookSong, index, song) => {
    // Use song from songbookSong if available, otherwise use passed song parameter
    const songToDisplay = songbookSong.song || song;
    
    // Debug logging for optimistic songs
    if (songbookSong.id?.startsWith('optimistic-')) {
      console.log('🎨 Rendering optimistic song:', {
        songbookSongId: songbookSong.id,
        songId: songbookSong.songId,
        hasSongbookSongSong: !!songbookSong.song,
        hasSongParam: !!song,
        songToDisplayTitle: songToDisplay?.title,
        songToDisplayArtist: songToDisplay?.artist,
        songbookSongSongTitle: songbookSong.song?.title,
        songParamTitle: song?.title,
        songbookSongKeys: Object.keys(songbookSong),
        songKeys: song ? Object.keys(song) : [],
        songbookSongSongKeys: songbookSong.song ? Object.keys(songbookSong.song) : [],
        fullSongbookSong: JSON.stringify(songbookSong, null, 2),
      });
    }
    
    return (
      <div
        key={songbookSong.id}
        draggable
        onDragStart={(e) => handleDragStart(e, index)}
        onDragOver={(e) => handleDragOver(e, index)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, index)}
        className={`flex items-center gap-4 p-4 border rounded transition-colors ${
          draggedIndex === index ? 'opacity-50' : ''
        } ${
          dragOverIndex === index ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:bg-gray-50'
        }`}
      >
        <div className="cursor-move text-gray-400 hover:text-gray-600">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
          </svg>
        </div>
        <div className="flex-1">
          <span className="text-gray-500 mr-4">#{index + 1}</span>
          <span className="font-medium">{songToDisplay?.title || 'Untitled'}</span>
          {songToDisplay?.artist && (
            <span className="text-gray-600 ml-2">- {songToDisplay.artist}</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => handleRemoveSong(songbookSong.id)}
          className="text-red-600 hover:text-red-700 px-3 py-1 rounded hover:bg-red-50"
        >
          Remove
        </button>
      </div>
    );
  };

  // Get sorted songs for display (includes optimistic updates)
  const sortedSongbookSongs = useMemo(() => {
    const sorted = [...allSongbookSongs].sort((a, b) => (a.order || 0) - (b.order || 0));
    
    // Debug: Log songbookSongs data structure
    const songsWithoutData = sorted.filter(ss => !ss.song);
    if (songsWithoutData.length > 0) {
      console.warn('⚠️ Some songbookSongs missing song relationship:', {
        count: songsWithoutData.length,
        songbookSongs: songsWithoutData.map(ss => ({
          id: ss.id,
          songId: ss.songId,
          isOptimistic: ss.id?.startsWith('optimistic-'),
        })),
      });
    }
    
    return sorted;
  }, [allSongbookSongs]);

  const handleBack = () => {
    // Try to go back in browser history, fallback to songbooks list
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/songbooks');
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-center gap-4 mb-4">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          aria-label="Go back"
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
          <span>Back</span>
        </button>
      </div>
      <h1 className="text-3xl font-bold">Create New Songbook</h1>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700">
          {error}
        </div>
      )}

      {/* Songbook Metadata Form */}
      <div className="card space-y-6">
        <h2 className="text-xl font-semibold">Songbook Details</h2>
        <form onSubmit={handleSaveSongbook} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="input"
              placeholder="Songbook title"
              disabled={saving}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input"
              rows={3}
              placeholder="Optional description"
              disabled={saving}
            />
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary"
            >
              {saving ? 'Saving...' : songbookId ? 'Update Songbook' : 'Save Songbook'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/songbooks')}
              disabled={saving}
              className="btn btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>

        {songbookId && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded text-green-700">
            <p>Songbook saved! You can now add songs below.</p>
          </div>
        )}
      </div>

      {/* Selected Songs Section */}
      {songbookId && (
        <div className="card space-y-4">
          <h2 className="text-xl font-semibold">Songs in Songbook</h2>
          {sortedSongbookSongs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No songs in this songbook yet. Add songs from the table below.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sortedSongbookSongs.map((songbookSong, index) => {
                let song = songbookSong.song;
                
                // Debug: Log if song is missing or missing title
                if (!song || !song.title) {
                  // Try to find the song in allSongs as a fallback
                  const fallbackSong = allSongs.find(s => s.id === songbookSong.songId);
                  if (fallbackSong) {
                    console.log('✅ Found song in allSongs fallback:', {
                      songId: songbookSong.songId,
                      title: fallbackSong.title,
                      isOptimistic: songbookSong.id?.startsWith('optimistic-'),
                    });
                    song = fallbackSong;
                    // Update the songbookSong with the fallback song
                    songbookSong = { ...songbookSong, song: fallbackSong };
                  } else {
                    console.warn('⚠️ Song not loaded for songbookSong:', {
                      songbookSongId: songbookSong.id,
                      songId: songbookSong.songId,
                      isOptimistic: songbookSong.id?.startsWith('optimistic-'),
                      hasSong: !!song,
                      songTitle: song?.title,
                      songbookSongKeys: Object.keys(songbookSong),
                      songKeys: song ? Object.keys(song) : [],
                    });
                    
                    return (
                      <div
                        key={songbookSong.id}
                        className="flex items-center gap-4 p-4 border border-gray-200 rounded bg-gray-50"
                      >
                        <div className="flex-1">
                          <span className="text-gray-500 mr-4">#{index + 1}</span>
                          <span className="text-gray-400 italic">
                            Song (ID: {songbookSong.songId}) - Loading...
                          </span>
                        </div>
                      </div>
                    );
                  }
                }

                return renderSongbookSongRow(songbookSong, index, song);
              })}
            </div>
          )}
        </div>
      )}

      {/* Available Songs Table */}
      {songbookId && (
        <div className="card space-y-4">
          <h2 className="text-xl font-semibold">Add Songs</h2>

          {/* Search and Filter Controls */}
          <div className="space-y-4">
            <div>
              <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-2">
                Search Songs
              </label>
              <input
                id="search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title or artist..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Filter by Chords
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Only show songs that use <strong>only</strong> the selected chords (and no others)
              </p>
              <ChordFilter
                selectedChords={selectedChords}
                onChordsChange={setSelectedChords}
              />
              {selectedChords.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedChords([])}
                  className="mt-2 text-sm text-primary-600 hover:text-primary-700 underline"
                >
                  Clear chord filter
                </button>
              )}
            </div>

            {/* Results count */}
            {(searchQuery || selectedChords.length > 0) && (
              <div className="text-sm text-gray-600 pt-2 border-t border-gray-200">
                Showing {filteredSongs.length} of {allSongs.length - selectedSongIds.size} available songs
              </div>
            )}
          </div>

          {/* Songs Table */}
          {filteredSongs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No songs match your filters.</p>
              {(searchQuery || selectedChords.length > 0) && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedChords([]);
                  }}
                  className="mt-2 text-primary-600 hover:underline"
                >
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Title
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Artist
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Chords
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredSongs.map((song) => {
                    const uniqueChords = getUniqueChords(song);
                    return (
                      <tr key={song.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-gray-900 font-medium">
                            {song.title}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                          {song.artist || <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-6 py-4">
                          <ChordLabels chords={uniqueChords} />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleAddSong(song.id, song)}
                            disabled={addingSongId === song.id || !songbookId}
                            className="btn btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {addingSongId === song.id ? 'Adding...' : 'Add to Songbook'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

