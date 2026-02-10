import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useMySongs, useMySongbooks, useMyGroups } from '../db/queries';
import { shareSongsWithGroups } from '../db/mutations';
import { db } from '../db/schema';
import { id } from '@instantdb/react';
import { formatChordNameForDisplay } from '../utils/chord-formatting';
import { MicrophoneStageIcon } from '../utils/icons';

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

export default function SongsIndex() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const songsQuery = useMySongs(user?.id);
  const songbooksQuery = useMySongbooks(user?.id);
  const groupsQuery = useMyGroups(user?.id);
  
  const songs = songsQuery.data?.songs || [];
  const songbooks = songbooksQuery.data?.songbooks || [];
  const userGroups = groupsQuery.data?.groups || [];
  
  // State for batch selection and modals
  const [selectedSongIds, setSelectedSongIds] = useState(new Set());
  const [showAddToSongbookModal, setShowAddToSongbookModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Selection handlers
  const handleToggleSong = (songId, e) => {
    e.stopPropagation();
    const newSelected = new Set(selectedSongIds);
    if (newSelected.has(songId)) {
      newSelected.delete(songId);
    } else {
      newSelected.add(songId);
    }
    setSelectedSongIds(newSelected);
  };

  const clearSelection = () => {
    setSelectedSongIds(new Set());
  };

  // Batch action handlers
  const handleBatchAddToSongbook = () => {
    setShowAddToSongbookModal(true);
  };

  const handleBatchShare = () => {
    setShowShareModal(true);
  };

  const handleBatchDelete = () => {
    setShowDeleteModal(true);
  };

  return (
    <div className="space-y-8 pb-32">
      <div className="flex items-center justify-between">
        <h1 className="heading-alice">My Songs</h1>
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
        <div>
          <div className="overflow-x-auto">
            <table className="table">
              <tbody>
                {songs.map((song) => {
                  const uniqueChords = getUniqueChords(song);
                  const isSelected = selectedSongIds.has(song.id);
                  return (
                    <tr
                      key={song.id}
                      onClick={() => navigate(`/songs/${song.id}`, { state: { referrer: '/songs' } })}
                      className={`cursor-pointer focus:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}
                    >
                      <td className="px-2 py-4" onClick={(e) => handleToggleSong(song.id, e)}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handleToggleSong(song.id, e)}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded w-5 h-5"
                        />
                      </td>
                      <td className="pl-2 pr-6 py-4 align-middle">
                        <div className="flex flex-col">
                          <span className="font-['Alice',_serif] text-[20px] text-gray-900 leading-tight">
                            {song.title}
                          </span>
                          {song.artist ? (
                            <div className="flex items-center gap-0.5 mt-0">
                              <MicrophoneStageIcon size={14} className="text-gray-500" />
                              <span className="text-[14px] text-gray-500 leading-tight">
                                {song.artist}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[14px] text-gray-400 mt-0 leading-tight">—</span>
                          )}
                        </div>
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

          {/* Batch Action Toolbar - Fixed at bottom */}
          {selectedSongIds.size > 0 && (
            <div className="fixed bottom-8 left-8 right-8 z-40">
              <div className="max-w-7xl mx-auto p-4 bg-white rounded-lg border border-gray-200 shadow-lg flex items-center justify-between">
                <div className="text-sm font-medium text-gray-700">
                  {selectedSongIds.size} song{selectedSongIds.size !== 1 ? 's' : ''} selected
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleBatchAddToSongbook}
                    disabled={processing}
                    className="btn btn-secondary text-sm"
                  >
                    Add to Songbook
                  </button>
                  <button
                    onClick={handleBatchShare}
                    disabled={processing}
                    className="btn btn-secondary text-sm"
                  >
                    Share with Group
                  </button>
                  <button
                    onClick={handleBatchDelete}
                    disabled={processing}
                    className="btn btn-danger text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add to Songbook Modal */}
      {showAddToSongbookModal && (
        <AddToSongbookModal
          selectedSongIds={selectedSongIds}
          songbooks={songbooks}
          userId={user?.id}
          onClose={() => setShowAddToSongbookModal(false)}
          onSuccess={() => {
            setShowAddToSongbookModal(false);
            clearSelection();
          }}
        />
      )}

      {/* Share with Groups Modal */}
      {showShareModal && (
        <ShareSongsWithGroupsModal
          selectedSongIds={selectedSongIds}
          userGroups={userGroups}
          userId={user?.id}
          onClose={() => setShowShareModal(false)}
          onSuccess={() => {
            setShowShareModal(false);
            clearSelection();
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <DeleteSongsModal
          selectedSongIds={selectedSongIds}
          songs={songs}
          onClose={() => setShowDeleteModal(false)}
          onSuccess={() => {
            setShowDeleteModal(false);
            clearSelection();
          }}
        />
      )}
    </div>
  );
}

// Add to Songbook Modal Component
function AddToSongbookModal({ selectedSongIds, songbooks, userId, onClose, onSuccess }) {
  const [selectedSongbookId, setSelectedSongbookId] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);

  // Query existing songbookSongs to calculate max order
  const { data: songbookSongsData } = db.useQuery({
    songbookSongs: {
      $: {
        where: selectedSongbookId
          ? { songbookId: selectedSongbookId }
          : { songbookId: '' },
        order: { order: 'asc' },
      },
    },
  });
  const existingSongbookSongs = songbookSongsData?.songbookSongs || [];

  const handleAdd = async () => {
    if (!selectedSongbookId) {
      setError('Please select a songbook.');
      return;
    }

    if (!userId) {
      setError('You must be logged in to add songs to a songbook.');
      return;
    }

    setAdding(true);
    setError(null);

    try {
      // Calculate max order
      const maxOrder = existingSongbookSongs.length > 0
        ? Math.max(...existingSongbookSongs.map(ss => ss.order || 0))
        : -1;
      let currentOrder = maxOrder + 1;

      // Create transactions for batch add
      const transactions = [];
      const songIds = Array.from(selectedSongIds);
      
      for (const songId of songIds) {
        // Skip if song is already in songbook
        if (existingSongbookSongs.some(ss => ss.songId === songId)) {
          continue;
        }
        
        transactions.push(
          db.tx.songbookSongs[id()].update({
            songbookId: selectedSongbookId,
            songId,
            order: currentOrder++,
            addedAt: Date.now(),
          })
        );
      }

      if (transactions.length === 0) {
        setError('All selected songs are already in this songbook.');
        setAdding(false);
        return;
      }

      await db.transact(...transactions);
      onSuccess();
    } catch (err) {
      console.error('Error adding songs to songbook:', err);
      setError(err.message || 'Failed to add songs to songbook. Please try again.');
    } finally {
      setAdding(false);
    }
  };

  const selectedCount = selectedSongIds.size;
  const selectedSongbook = songbooks.find(sb => sb.id === selectedSongbookId);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold mb-4">Add {selectedCount} Song{selectedCount !== 1 ? 's' : ''} to Songbook</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        {songbooks.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>You don't have any songbooks yet.</p>
            <p className="text-sm mt-2">Create a songbook to add songs to it.</p>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Songbook
              </label>
              <select
                value={selectedSongbookId}
                onChange={(e) => setSelectedSongbookId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                disabled={adding}
              >
                <option value="">Choose a songbook...</option>
                {songbooks.map((songbook) => (
                  <option key={songbook.id} value={songbook.id}>
                    {songbook.title}
                  </option>
                ))}
              </select>
            </div>

            {selectedSongbook && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded text-blue-800 text-sm">
                Songs will be added to "{selectedSongbook.title}"
              </div>
            )}
          </>
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={adding}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          {songbooks.length > 0 && (
            <button
              onClick={handleAdd}
              disabled={adding || !selectedSongbookId}
              className="btn btn-primary"
            >
              {adding ? 'Adding...' : 'Add to Songbook'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Share Songs with Groups Modal Component
function ShareSongsWithGroupsModal({ selectedSongIds, userGroups, userId, onClose, onSuccess }) {
  const [selectedGroups, setSelectedGroups] = useState(new Set());
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState(null);

  const safeUserGroups = Array.isArray(userGroups) ? userGroups : [];

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

    if (!userId) {
      setError('You must be logged in to share songs.');
      return;
    }

    setSharing(true);
    setError(null);

    try {
      await shareSongsWithGroups(
        Array.from(selectedSongIds),
        Array.from(selectedGroups),
        userId
      );
      onSuccess();
    } catch (err) {
      console.error('Error sharing songs:', err);
      setError(err.message || 'Failed to share songs. Please try again.');
    } finally {
      setSharing(false);
    }
  };

  const selectedCount = selectedSongIds.size;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold mb-4">Share {selectedCount} Song{selectedCount !== 1 ? 's' : ''} with Groups</h2>

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

// Delete Songs Confirmation Modal Component
function DeleteSongsModal({ selectedSongIds, songs, onClose, onSuccess }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  const selectedSongs = songs.filter(s => selectedSongIds.has(s.id));
  const selectedCount = selectedSongIds.size;

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);

    try {
      // Create transactions for batch delete
      const transactions = selectedSongs.map(song =>
        db.tx.songs[song.id].delete()
      );

      await db.transact(...transactions);
      onSuccess();
    } catch (err) {
      console.error('Error deleting songs:', err);
      setError(err.message || 'Failed to delete songs. Please try again.');
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold mb-4">Delete Song{selectedCount !== 1 ? 's' : ''}</h2>
        
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        <p className="text-gray-700 mb-6">
          Are you sure you want to delete {selectedCount} song{selectedCount !== 1 ? 's' : ''}? This action cannot be undone.
        </p>

        {selectedCount <= 5 && (
          <div className="mb-6">
            <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
              {selectedSongs.map(song => (
                <li key={song.id}>{song.title}{song.artist ? ` by ${song.artist}` : ''}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={deleting}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="btn btn-danger"
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
