import { useParams } from 'react-router-dom';
import { useSongbook } from '../db/queries';

export default function SongbookIndex() {
  const { id } = useParams();
  const { data } = useSongbook(id);

  const songbook = data?.songbooks?.[0];
  const songs = songbook?.songbookSongs?.map(ss => ss.song).filter(Boolean) || [];

  if (!songbook) {
    return (
      <div className="max-w-4xl mx-auto">
        <p>Loading songbook...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">{songbook.title}</h1>
        {songbook.description && (
          <p className="text-gray-600">{songbook.description}</p>
        )}
      </div>

      <div className="space-y-4">
        {songs.length === 0 ? (
          <div className="card text-center py-8 text-gray-500">
            <p>No songs in this songbook yet.</p>
          </div>
        ) : (
          songs.map((song, index) => (
            <div key={song.id} className="card">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-gray-500 mr-4">#{index + 1}</span>
                  <a
                    href={`/songs/${song.id}`}
                    className="text-lg font-semibold hover:text-primary-600"
                  >
                    {song.title}
                  </a>
                  {song.artist && (
                    <span className="text-gray-600 ml-2">- {song.artist}</span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

