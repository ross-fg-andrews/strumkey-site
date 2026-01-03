import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useSong, useSongInSongbooks } from '../db/queries';
import { renderInlineChords, renderAboveChords, parseLyricsWithChords, lyricsWithChordsToText } from '../utils/lyrics-helpers';
import { useState, useRef, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { deleteSong, createSong, updateSong } from '../db/mutations';
import { AppError, ERROR_CODES } from '../utils/error-handling';
import ChordAutocomplete from '../components/ChordAutocomplete';
import StyledChordEditor from '../components/StyledChordEditor';
import ChordDiagram from '../components/ChordDiagram';
import { findChord } from '../utils/chord-library';

export default function SongSheet() {
  // All hooks must be called in the same order on every render
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [chordMode, setChordMode] = useState('inline'); // 'inline' or 'above'
  const [menuOpen, setMenuOpen] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const menuRef = useRef(null);
  
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

  // Compute mode after hooks (this is just derived state, not affecting hook order)
  const isCreateMode = location.pathname === '/songs/new';
  const isEditMode = !isCreateMode && location.pathname.includes('/edit');
  const isViewMode = !isEditMode && !isCreateMode && id;
  
  const inSongbooks = isViewMode && songbookData?.songbookSongs?.length > 0;

  // Check if user has editing rights (user created the song)
  const canEdit = user && song && song.createdBy === user.id;
  const isCreator = user && song && song.createdBy === user.id;

  // Initialize edit mode with song data
  useEffect(() => {
    if (isEditMode && song) {
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
  }, [isEditMode, isCreateMode, song]);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    }

    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [menuOpen]);

  // Parse chords from JSON string (must be before early returns for hooks)
  let chords = [];
  if (song?.chords) {
    try {
      chords = JSON.parse(song.chords);
    } catch (e) {
      console.error('Error parsing chords:', e);
      chords = [];
    }
  }
  
  // Extract unique chord names from the song (must be before early returns)
  const uniqueChordNames = useMemo(() => {
    if (!chords || chords.length === 0) return [];
    const chordNames = new Set();
    chords.forEach(chord => {
      if (chord.chord) {
        chordNames.add(chord.chord);
      }
    });
    return Array.from(chordNames);
  }, [chords]);

  // Get chord diagrams data for unique chords using static library (must be before early returns)
  const chordDiagrams = useMemo(() => {
    if (!uniqueChordNames || uniqueChordNames.length === 0) return [];
    
    return uniqueChordNames
      .map(chordName => {
        const chordData = findChord(chordName, instrument, tuning);
        if (chordData && chordData.frets) {
          return {
            name: chordName,
            frets: chordData.frets,
            instrument: chordData.instrument,
            tuning: chordData.tuning,
          };
        }
        return null;
      })
      .filter(Boolean);
  }, [uniqueChordNames, instrument, tuning]);

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

      if (isEditMode) {
        await updateSong(id, {
          title,
          lyrics,
          artist,
          chords: chordsJson,
        });
        navigate(`/songs/${id}`);
      } else {
        const newSong = await createSong({
          title,
          lyrics,
          artist,
          chords: chordsJson,
          createdBy: user.id,
        });
        // Navigate to the new song (we need to get the ID from the response)
        // For now, navigate to home - the createSong might not return the ID directly
        // Let's check the mutations file to see what it returns
        navigate('/home');
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

  const handleCancel = () => {
    if (isEditMode) {
      navigate(`/songs/${id}`);
    } else {
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


  // Show loading state when editing and song is not yet loaded
  if ((isEditMode || isViewMode) && !song && !error && !isCreateMode) {
    return (
      <div className="max-w-4xl mx-auto">
        <p>Loading song...</p>
      </div>
    );
  }

  if (error && isViewMode) {
    return (
      <div className="max-w-4xl mx-auto">
        <p className="text-red-600">Error loading song: {error.message || 'Unknown error'}</p>
      </div>
    );
  }

  // Edit/Create Mode
  if (isEditMode || isCreateMode) {
    return (
      <div className="max-w-4xl mx-auto">
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
            onClick={handleCancel}
            disabled={saving}
            className="btn btn-secondary"
          >
            Cancel
          </button>
        </div>

        {/* Editable Title */}
        <div className="mb-6">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={isCreateMode ? "Song Title" : ""}
            className="text-4xl font-bold mb-2 w-full bg-transparent border-b-2 border-transparent focus:border-gray-300 outline-none p-0 transition-colors placeholder:text-gray-400"
          />
          
          {/* Editable Artist */}
          <input
            type="text"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder={isCreateMode ? "Artist Name" : ""}
            className="text-xl text-gray-600 w-full bg-transparent border-b-2 border-transparent focus:border-gray-300 outline-none p-0 transition-colors placeholder:text-gray-500"
          />
        </div>

        {/* Editable Lyrics */}
        <div>
          <StyledChordEditor
            value={lyricsText}
            onChange={(e) => setLyricsText(e.target.value)}
            placeholder={isCreateMode ? "Paste your lyrics here.\n\nPress / to add chords inline with your lyrics.\n\nExample:\nAmazing [C]grace how [G]sweet the [Am]sound\nThat saved a [F]wretch like [C]me" : ""}
            rows={30}
            className="w-full p-0 border-none outline-none focus:outline-none bg-transparent text-lg leading-relaxed resize-none placeholder:text-gray-400"
            instrument={instrument}
            tuning={tuning}
          />
        </div>
      </div>
    );
  }

  // View Mode (existing behavior)
  if (!song) {
    return (
      <div className="max-w-4xl mx-auto">
        <p>Loading song...</p>
      </div>
    );
  }
  
  const renderedLyrics = chordMode === 'inline'
    ? renderInlineChords(song.lyrics, chords)
    : renderAboveChords(song.lyrics, chords);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
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
          <div>
            <h1 className="text-4xl font-bold mb-2">{song.title}</h1>
            {song.artist && (
              <p className="text-xl text-gray-600">{song.artist}</p>
            )}
          </div>
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
                  {canEdit && (
                    <>
                      <div className="border-t border-gray-200 my-1"></div>
                      <button
                        onClick={() => {
                          navigate(`/songs/${id}/edit`);
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
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:gap-6">
        {/* Lyrics Section */}
        <div className="flex-1 order-2 md:order-1">
          {chordMode === 'inline' ? (
            <div className="space-y-2">
              {renderedLyrics.map((line, i) => (
                <p key={i} className="text-lg leading-relaxed">
                  {line.split(/\[([^\]]+)\]/).map((part, j) => {
                    if (j % 2 === 1) {
                      return <span key={j} className="inline-block px-2 py-1 bg-primary-100 text-primary-700 rounded text-sm font-medium">{part}</span>;
                    }
                    return <span key={j}>{part}</span>;
                  })}
                </p>
              ))}
            </div>
          ) : (
            <div className="space-y-2 font-mono">
              {renderedLyrics.map(({ chordSegments, lyricLine }, i) => (
                <div key={i} className="leading-relaxed">
                  {chordSegments && chordSegments.length > 0 && (
                    <p className="mb-1 whitespace-pre text-lg font-mono">
                      {chordSegments.map((segment, idx) => {
                        if (segment.type === 'space') {
                          return <span key={idx}>{segment.content}</span>;
                        } else {
                          return (
                            <span
                              key={idx}
                              className="inline-block px-2 py-1 bg-primary-100 text-primary-700 rounded text-sm font-medium -mx-2"
                            >
                              {segment.content}
                            </span>
                          );
                        }
                      })}
                    </p>
                  )}
                  <p className="text-lg whitespace-pre">{lyricLine}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Chord Charts Section */}
        {chordDiagrams.length > 0 ? (
          <div className="mb-6 md:mb-0 md:w-64 md:flex-shrink-0 order-1 md:order-2">
            {/* Desktop: flex wrap layout */}
            <div className="hidden md:flex flex-wrap gap-2 justify-start">
              {chordDiagrams.map(({ name, frets, instrument: chordInstrument, tuning: chordTuning }) => (
                <ChordDiagram 
                  key={name}
                  frets={frets} 
                  chordName={name}
                  instrument={chordInstrument || instrument}
                  tuning={chordTuning || tuning}
                />
              ))}
            </div>
            {/* Mobile: horizontal scrollable line */}
            <div className="md:hidden flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
              {chordDiagrams.map(({ name, frets, instrument: chordInstrument, tuning: chordTuning }) => (
                <ChordDiagram 
                  key={name}
                  frets={frets} 
                  chordName={name}
                  instrument={chordInstrument || instrument}
                  tuning={chordTuning || tuning}
                />
              ))}
            </div>
          </div>
        ) : uniqueChordNames.length > 0 ? (
          // Show message if chords exist but don't match
          <div className="mb-6 md:mb-0 md:w-64 md:flex-shrink-0 order-1 md:order-2">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-2">Chord Charts</h3>
              <p className="text-xs text-gray-600">
                Some chords in this song don't have diagrams available: {uniqueChordNames.join(', ')}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
