import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { parseLyricsWithChords, lyricsWithChordsToText } from '../utils/lyrics-helpers';
import { createSong, updateSong } from '../db/mutations';
import { useSong } from '../db/queries';
import ChordAutocomplete from '../components/ChordAutocomplete';

export default function SongEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [lyricsText, setLyricsText] = useState('');
  const [loading, setLoading] = useState(false);

  const isEditing = !!id;

  // Load song data when editing
  const { data: songData, error: songError } = useSong(isEditing ? id : null);
  const song = songData?.songs?.[0];

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

      if (isEditing) {
        // Update existing song
        await updateSong(id, {
          title,
          lyrics,
          artist,
          chords: chordsJson,
        });
      } else {
        // Create new song
        await createSong({
          title,
          lyrics,
          artist,
          chords: chordsJson,
          createdBy: user.id,
        });
      }

      navigate('/home');
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
      <div className="max-w-4xl mx-auto">
        <p>Loading song...</p>
      </div>
    );
  }

  // Show error state if song failed to load
  if (isEditing && songError) {
    return (
      <div className="max-w-4xl mx-auto">
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

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">
        {isEditing ? 'Edit Song' : 'Create New Song'}
      </h1>

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

