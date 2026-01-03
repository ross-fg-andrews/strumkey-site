import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useMySongs, useMyGroups } from '../db/queries';

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

export default function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const songsQuery = useMySongs(user?.id);
  const groupsQuery = useMyGroups(user?.id);
  
  // Log any query errors for debugging
  if (songsQuery.error) {
    console.error('useMySongs error:', songsQuery.error);
    console.error('useMySongs error hint:', songsQuery.error.hint);
    console.error('useMySongs error details:', JSON.stringify(songsQuery.error, null, 2));
  }
  if (groupsQuery.error) {
    console.error('useMyGroups error:', groupsQuery.error);
    console.error('useMyGroups error hint:', groupsQuery.error.hint);
    console.error('useMyGroups error details:', JSON.stringify(groupsQuery.error, null, 2));
  }
  
  const songsData = songsQuery.data;
  const groupsData = groupsQuery.data;

  const songs = songsData?.songs || [];
  const groups = groupsData?.groupMembers?.map(gm => gm.group) || [];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Welcome back!</h1>
        <Link to="/songs/new" className="btn btn-primary">
          + New Song
        </Link>
      </div>

      {/* My Songs */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold">My Songs</h2>
          <Link to="/songs/new" className="text-primary-600 hover:underline">
            Create new
          </Link>
        </div>
        {songs.length === 0 ? (
          <div className="card text-center py-8 text-gray-500">
            <p>No songs yet. Create your first song!</p>
          </div>
        ) : (
          <div className="card overflow-hidden p-0">
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
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {songs.map((song) => {
                  const uniqueChords = getUniqueChords(song);
                  return (
                    <tr
                      key={song.id}
                      onClick={() => navigate(`/songs/${song.id}`)}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                    >
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* My Groups */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold">My Groups</h2>
          <button className="text-primary-600 hover:underline">
            Join group
          </button>
        </div>
        {groups.length === 0 ? (
          <div className="card text-center py-8 text-gray-500">
            <p>You're not in any groups yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {groups.map((group) => (
              <Link
                key={group.id}
                to={`/groups/${group.id}`}
                className="card hover:shadow-xl transition-shadow"
              >
                <h3 className="font-semibold text-lg mb-1">{group.name}</h3>
                {group.description && (
                  <p className="text-gray-600 text-sm">{group.description}</p>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

