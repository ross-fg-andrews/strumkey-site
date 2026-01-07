import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { parseLyricsWithChords, lyricsWithChordsToText, extractCustomChords, buildEmbeddedChordsData } from '../utils/lyrics-helpers';
import { createSong, updateSong } from '../db/mutations';
import { useSong, usePersonalChords, useMainLibraryChords } from '../db/queries';
import ChordAutocomplete from '../components/ChordAutocomplete';
import { importSongFromPDF } from '../utils/pdf-parser';

export default function SongEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [lyricsText, setLyricsText] = useState('');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState(null);
  const fileInputRef = useRef(null);

  const isEditing = !!id;

  // Instrument and tuning settings
  const instrument = 'ukulele';
  const tuning = 'ukulele_standard';

  // Load song data when editing
  const { data: songData, error: songError } = useSong(isEditing ? id : null);
  const song = songData?.songs?.[0];

  // Get personal and main library chords for embedding logic
  const { data: personalChordsData } = usePersonalChords(user?.id, instrument, tuning);
  const { data: mainLibraryChordsData } = useMainLibraryChords(instrument, tuning);
  const personalChords = personalChordsData?.chords || [];
  const mainLibraryChords = mainLibraryChordsData?.chords || [];

  useEffect(() => {
    if (isEditing && song) {
      // Populate form with existing song data
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
    }
  }, [isEditing, song]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Check if user is authenticated
      if (!user || !user.id) {
        alert('You must be logged in to save a song.');
        setLoading(false);
        return;
      }

      const { lyrics, chords } = parseLyricsWithChords(lyricsText);
      // Store chords as JSON string (use empty array if no chords)
      // InstantDB requires a non-null value, so use "[]" as default
      const chordsJson = chords && chords.length > 0 ? JSON.stringify(chords) : '[]';

      // Extract custom chords (not in main library) and build embedded chords data
      const customChordNames = extractCustomChords(chords, instrument, tuning, {
        mainLibraryChords,
        personalChords,
      });
      
      // Build embedded chords data for personal library chords only
      const embeddedChords = buildEmbeddedChordsData(
        customChordNames,
        personalChords,
        instrument,
        tuning
      );
      
      const embeddedChordsJson = embeddedChords.length > 0 ? JSON.stringify(embeddedChords) : null;

      if (isEditing) {
        // Update existing song
        await updateSong(id, {
          title,
          lyrics,
          artist,
          chords: chordsJson,
          embeddedChords: embeddedChordsJson,
        });
        // Navigate to the song view after updating
        navigate(`/songs/${id}`);
      } else {
        // Create new song
        const newSongId = await createSong({
          title,
          lyrics,
          artist,
          chords: chordsJson,
          embeddedChords: embeddedChordsJson,
          createdBy: user.id,
        });
        // Wait a bit longer to ensure InstantDB has synced the new song
        // This prevents hook order issues when the component tries to load before data is ready
        await new Promise(resolve => setTimeout(resolve, 300));
        // Navigate to the newly created song view
        navigate(`/songs/${newSongId}`, { replace: true });
      }
    } catch (error) {
      console.error('Error saving song:', error);
      console.error('Error details:', {
        message: error?.message,
        type: error?.type,
        status: error?.status,
        op: error?.op,
        errors: error?.errors,
        data: error?.data,
        fullError: JSON.stringify(error, null, 2),
      });
      
      // Provide more specific error message
      let errorMessage = 'Error saving song. Please try again.';
      if (error?.message) {
        errorMessage = `Error: ${error.message}`;
      } else if (error?.errors && Array.isArray(error.errors)) {
        errorMessage = `Validation errors: ${error.errors.join(', ')}`;
      } else if (error?.op === 'error') {
        errorMessage = 'Database validation error. Please check your input.';
      }
      
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Show loading state when editing and song is not yet loaded
  if (isEditing && !song && !songError) {
    return (
      <div>
        <p>Loading song...</p>
      </div>
    );
  }

  // Show error state if song failed to load
  if (isEditing && songError) {
    return (
      <div>
        <p className="text-red-600">Error loading song: {songError.message || 'Unknown error'}</p>
        <button
          onClick={() => navigate('/home')}
          className="btn btn-secondary mt-4"
        >
          Back to Home
        </button>
      </div>
    );
  }

  const handleBack = () => {
    if (isEditing && id) {
      // If editing, go back to the song view
      navigate(`/songs/${id}`);
    } else {
      // If creating, try to go back in history or go to songs list
      if (window.history.length > 1) {
        navigate(-1);
      } else {
        navigate('/songs');
      }
    }
  };

  const handlePDFImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    // Validate file type
    if (file.type !== 'application/pdf') {
      setImportError('Please select a valid PDF file.');
      return;
    }

    setImporting(true);
    setImportError(null);

    try {
      const songData = await importSongFromPDF(file);
      
      // Populate form fields with imported data
      setTitle(songData.title || '');
      setArtist(songData.artist || '');
      setLyricsText(songData.lyrics || '');
      
      // Show success message
      alert('Song imported successfully! Please review and edit the imported content before saving.');
    } catch (error) {
      console.error('Error importing PDF:', error);
      setImportError(error.message || 'Failed to import PDF. Please make sure the PDF contains readable text.');
    } finally {
      setImporting(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div>
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="text-3xl font-bold">
          {isEditing ? 'Edit Song' : 'Create New Song'}
        </h1>
        <button
          type="button"
          onClick={handleImportClick}
          disabled={importing}
          className="btn btn-secondary flex items-center gap-2 flex-shrink-0"
        >
          {importing ? (
            <>
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Importing...
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Import from PDF
            </>
          )}
        </button>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        onChange={handlePDFImport}
        className="hidden"
      />

      {importError && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800 text-sm">{importError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="input"
            placeholder="Song title"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Artist</label>
          <input
            type="text"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            className="input"
            placeholder="Artist name"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Lyrics *</label>
          <p className="text-sm text-gray-600 mb-2">
            Paste your lyrics here. Press <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">/</kbd> to add chords, e.g., "Amazing [C]grace"
          </p>
          <ChordAutocomplete
            value={lyricsText}
            onChange={(e) => setLyricsText(e.target.value)}
            required
            rows={20}
            className="input font-mono"
            placeholder="Paste lyrics here...&#10;Press / to add chords"
            userId={user?.id}
            instrument={instrument}
            tuning={tuning}
          />
        </div>

        <div className="flex gap-4">
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
          >
            {loading ? 'Saving...' : 'Save Song'}
          </button>
          <button
            type="button"
            onClick={() => navigate(isEditing ? `/songs/${id}` : '/home')}
            className="btn btn-secondary"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

