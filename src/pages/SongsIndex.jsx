import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useMySongs } from '../db/queries';

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
          {chord}
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

export default function SongsIndex() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const songsQuery = useMySongs(user?.id);
  
  const songs = songsQuery.data?.songs || [];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">My Songs</h1>
        <button
          onClick={() => navigate('/songs/new')}
          className="btn btn-primary"
        >
          + New Song
        </button>
      </div>

      {songs.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">You haven't created any songs yet.</p>
          <button
            onClick={() => navigate('/songs/new')}
            className="btn btn-primary"
          >
            Create Your First Song
          </button>
        </div>
      ) : (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left px-6 py-3 text-sm font-semibold text-gray-700">Title</th>
                  <th className="text-left px-6 py-3 text-sm font-semibold text-gray-700">Artist</th>
                  <th className="text-left px-6 py-3 text-sm font-semibold text-gray-700">Chords</th>
                </tr>
              </thead>
              <tbody>
                {songs.map((song) => {
                  const uniqueChords = getUniqueChords(song);
                  return (
                    <tr
                      key={song.id}
                      onClick={() => navigate(`/songs/${song.id}`, { state: { referrer: '/songs' } })}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-gray-900 font-medium">
                          {song.title}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-gray-600">
                          {song.artist || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <ChordLabels chords={uniqueChords} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
