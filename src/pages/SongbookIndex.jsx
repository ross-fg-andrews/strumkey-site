import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSongbook, useAccessibleSongs, useMyGroups } from '../db/queries';
import { db } from '../db/schema';
import { useEffect, useState, useRef } from 'react';
import { copySong, removeSongFromSongbook, shareSongsWithGroups } from '../db/mutations';
import { createPortal } from 'react-dom';

export default function SongbookIndex() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id;
  const [openMenuId, setOpenMenuId] = useState(null);
  const [menuPosition, setMenuPosition] = useState(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const menuRefs = useRef({});
  const buttonRefs = useRef({});
  const menuPortalRef = useRef(null);
  
  // Get songbook metadata
  const { data: songbookData } = useSongbook(id, userId);
  const songbook = songbookData?.songbooks?.[0];

  // Get accessible songs to enrich songbookSongs
  const accessibleSongsQuery = useAccessibleSongs(userId);
  const allSongs = accessibleSongsQuery.data?.songs || [];
  const accessibleSongIds = new Set(allSongs.map(s => s.id));
  const { data: groupsData } = useMyGroups(userId);

  // Create accessible songs map
  const accessibleSongsMap = new Map(
    allSongs.map(song => [song.id, song])
  );

  // Direct query for songbookSongs without song relationship first (to avoid permission issues)
  // Then we'll enrich with accessible songs
  const { data: directSongbookSongsData } = db.useQuery({
    songbookSongs: {
      $: {
        where: id ? { songbookId: id } : { songbookId: '' },
        order: { order: 'asc' },
      },
      // Don't query song relationship here - we'll enrich manually
    },
  });
  const directSongbookSongs = directSongbookSongsData?.songbookSongs || [];

  // Get song IDs that we need to query directly (from songbookSongs but not in accessible songs)
  const missingSongIds = directSongbookSongs
    .map(ss => ss.songId)
    .filter(songId => songId && !accessibleSongIds.has(songId));

  // Query songs directly if we have missing song IDs
  const { data: directSongsData } = db.useQuery({
    songs: {
      $: {
        where: missingSongIds.length > 0 ? { id: { $in: missingSongIds } } : { id: '' },
      },
    },
  });
  const directSongs = directSongsData?.songs || [];
  
  // Add direct songs to our songs map
  directSongs.forEach(song => {
    accessibleSongsMap.set(song.id, song);
    accessibleSongIds.add(song.id);
  });

  // Relationship query from songbook (fallback)
  const relationshipSongbookSongs = songbook?.songbookSongs || [];

  // Handle click outside to close menus
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openMenuId) {
        const buttonRef = buttonRefs.current[openMenuId];
        const menuElement = document.querySelector('[data-menu-portal]');
        if (buttonRef && !buttonRef.contains(event.target) && 
            menuElement && !menuElement.contains(event.target)) {
          setOpenMenuId(null);
          setMenuPosition(null);
        }
      }
    };

    if (openMenuId) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [openMenuId]);

  // Adjust menu position after render to account for actual menu height
  useEffect(() => {
    if (menuPosition && menuPortalRef.current) {
      // Use requestAnimationFrame to measure and adjust before paint
      requestAnimationFrame(() => {
        const menuElement = menuPortalRef.current;
        const buttonRef = buttonRefs.current[menuPosition.songbookSongId];
        
        if (menuElement && buttonRef) {
          const menuRect = menuElement.getBoundingClientRect();
          const buttonRect = buttonRef.getBoundingClientRect();
          const actualMenuHeight = menuRect.height;
          const buffer = 8;
          const spaceBelow = window.innerHeight - buttonRect.bottom;
          const spaceAbove = buttonRect.top;
          
          // Recalculate if menu should be above
          const shouldPositionAbove = spaceBelow < (actualMenuHeight + buffer) && spaceAbove > spaceBelow;
          
          let newTop;
          if (shouldPositionAbove) {
            // Position so bottom of menu is just above button
            newTop = Math.max(0, buttonRect.top - actualMenuHeight - buffer);
          } else {
            // Position so top of menu is just below button
            newTop = buttonRect.bottom + buffer;
          }
          
          // Only update if position needs to change
          if (Math.abs(newTop - menuPosition.top) > 1) {
            setMenuPosition(prev => ({ ...prev, top: newTop }));
          }
        }
      });
    }
  }, [menuPosition, openMenuId]);

  // Debug logging
  useEffect(() => {
    if (id) {
      console.log('📊 SongbookIndex Debug:', {
        songbookId: id,
        songbook: songbook ? { id: songbook.id, title: songbook.title } : null,
        directSongbookSongsCount: directSongbookSongs.length,
        relationshipSongbookSongsCount: relationshipSongbookSongs.length,
        directSongbookSongs: directSongbookSongs.map(ss => ({
          id: ss.id,
          songId: ss.songId,
          hasSong: !!ss.song,
          songTitle: ss.song?.title,
        })),
        relationshipSongbookSongs: relationshipSongbookSongs.map(ss => ({
          id: ss.id,
          songId: ss.songId,
          hasSong: !!ss.song,
          songTitle: ss.song?.title,
        })),
        accessibleSongsCount: allSongs.length,
        accessibleSongIds: Array.from(accessibleSongIds).slice(0, 10),
      });
    }
  }, [id, songbook, directSongbookSongs, relationshipSongbookSongs, allSongs.length, accessibleSongIds]);

  // Use direct query as primary source, fall back to relationship query
  const rawSongbookSongs = directSongbookSongs.length > 0 
    ? directSongbookSongs 
    : relationshipSongbookSongs;

  // Check if user owns the songbook
  const userOwnsSongbook = songbook && userId && songbook.createdBy === userId;

  // Handle duplicate song
  const handleDuplicate = async (song) => {
    if (!userId) {
      alert('You must be logged in to duplicate a song.');
      return;
    }

    try {
      await copySong(song, userId);
      alert('Song duplicated successfully!');
    } catch (err) {
      console.error('Error duplicating song:', err);
      alert('Failed to duplicate song. Please try again.');
    }
    setOpenMenuId(null);
  };

  // Handle remove song from songbook
  const handleRemove = async (songbookSongId) => {
    if (!confirm('Are you sure you want to remove this song from the songbook?')) {
      return;
    }

    try {
      await removeSongFromSongbook(songbookSongId);
    } catch (err) {
      console.error('Error removing song from songbook:', err);
      alert('Failed to remove song from songbook. Please try again.');
    }
    setOpenMenuId(null);
  };

  // Handle edit song
  const handleEdit = (songId) => {
    navigate(`/songs/${songId}`);
    setOpenMenuId(null);
  };

  const songbookSongs = rawSongbookSongs
    .map(ss => {
      // If song relationship is loaded, use it
      if (ss.song) {
        return ss;
      }
      // Otherwise, try to find the song in accessible songs
      const song = accessibleSongsMap.get(ss.songId);
      if (song) {
        return { ...ss, song };
      }
      // If song not found and user owns songbook, try to fetch it directly
      // (might be a song they added but don't have direct access to)
      if (userOwnsSongbook && ss.songId) {
        // Return with songId but no song data - we'll handle this in rendering
        return ss;
      }
      // If song not found, return as-is (will be filtered out)
      return ss;
    })
    // Filter: if user owns songbook, show all songs (even if we don't have song data yet)
    // Otherwise, only show songs user has access to
    .filter(ss => {
      if (userOwnsSongbook) {
        // User owns songbook - show all songs, even if we don't have song data yet
        // (it will be enriched or shown as "Loading...")
        return true;
      }
      
      // For other users' songbooks, only show accessible songs
      if (!ss.song) {
        console.warn('⚠️ SongbookSong missing song data:', {
          songbookSongId: ss.id,
          songId: ss.songId,
          inAccessibleSongs: accessibleSongIds.has(ss.songId),
        });
        return false;
      }
      const hasAccess = accessibleSongIds.has(ss.song.id);
      if (!hasAccess) {
        console.warn('⚠️ Song not accessible:', {
          songId: ss.song.id,
          songTitle: ss.song.title,
          accessibleSongIdsCount: accessibleSongIds.size,
        });
      }
      return hasAccess;
    });

  if (!songbook) {
    return (
      <div className="max-w-4xl mx-auto">
        <p>Loading songbook...</p>
      </div>
    );
  }

  const canShare = userOwnsSongbook && songbook.type === 'private';
  const userGroups = groupsData?.groupMembers?.map(gm => gm.group).filter(Boolean) || [];

  const handleBack = () => {
    // Try to go back in browser history, fallback to songbooks list
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/songbooks');
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
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
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            <h1 className="text-3xl font-bold mb-2">{songbook.title}</h1>
            {songbook.description && (
              <p className="text-gray-600">{songbook.description}</p>
            )}
          </div>
          {canShare && (
            <button
              onClick={() => setShowShareModal(true)}
              className="btn btn-primary"
            >
              Share with Group
            </button>
          )}
        </div>
      </div>

      {songbookSongs.length === 0 ? (
        <div className="card text-center py-8 text-gray-500">
          <p>No songs in this songbook.</p>
          {user && !userOwnsSongbook && (
            <p className="text-sm mt-2">
              Some songs may not be visible if you don't have access to them.
            </p>
          )}
        </div>
      ) : (
        <div className="card">
          <div className="overflow-x-auto overflow-y-visible">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    #
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Title
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Artist
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {songbookSongs.map((songbookSong, index) => {
                  const song = songbookSong.song;
                  const isMenuOpen = openMenuId === songbookSong.id;
                  
                  if (!song) {
                    // Song data not loaded yet - show loading state
                    return (
                      <tr key={songbookSong.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          #{index + 1}
                        </td>
                        <td colSpan="3" className="px-6 py-4 text-sm text-gray-400 italic">
                          Song (ID: {songbookSong.songId}) - Loading...
                        </td>
                      </tr>
                    );
                  }
                  
                  return (
                    <tr 
                      key={songbookSong.id} 
                      onClick={() => navigate(`/songs/${song.id}?songbook=${id}`)}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        #{index + 1}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-gray-900">
                          {song.title}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {song.artist || <span className="text-gray-400">—</span>}
                      </td>
                      <td 
                        className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium relative"
                        style={{ overflow: 'visible' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="relative inline-block" ref={el => {
                          menuRefs.current[songbookSong.id] = el;
                          buttonRefs.current[songbookSong.id] = el?.querySelector('button');
                        }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isMenuOpen) {
                                setOpenMenuId(null);
                                setMenuPosition(null);
                              } else {
                                const rect = e.currentTarget.getBoundingClientRect();
                                // Approximate menu height: 3 buttons (~36px each) + divider + padding ≈ 130px
                                const menuHeight = 130;
                                const buffer = 8; // Space between button and menu
                                const spaceBelow = window.innerHeight - rect.bottom;
                                const spaceAbove = rect.top;
                                
                                // Position menu above if there's not enough space below
                                // Use above if: not enough space below AND more space above than below
                                const shouldPositionAbove = spaceBelow < (menuHeight + buffer) && spaceAbove > spaceBelow;
                                
                                // Calculate top position
                                // When above: position so bottom of menu is just above button (with buffer gap)
                                // When below: position so top of menu is just below button (with buffer gap)
                                let topPosition;
                                if (shouldPositionAbove) {
                                  // Bottom of menu at (rect.top - buffer), so top at (rect.top - buffer - menuHeight)
                                  topPosition = Math.max(0, rect.top - menuHeight - buffer);
                                } else {
                                  topPosition = rect.bottom + buffer;
                                }
                                
                                setMenuPosition({
                                  top: topPosition,
                                  right: window.innerWidth - rect.right,
                                  songbookSongId: songbookSong.id,
                                  songId: song.id
                                });
                                setOpenMenuId(songbookSong.id);
                              }
                            }}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            aria-label="Song actions"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-5 w-5 text-gray-600"
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

                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Portal menu - rendered outside table DOM */}
      {menuPosition && openMenuId === menuPosition.songbookSongId && (() => {
        const songbookSong = songbookSongs.find(ss => ss.id === menuPosition.songbookSongId);
        if (!songbookSong || !songbookSong.song) return null;
        const song = songbookSong.song;
        
        return createPortal(
          <div 
            ref={menuPortalRef}
            data-menu-portal
            className="fixed w-48 rounded-lg shadow-lg border border-gray-200 bg-white"
            style={{ 
              top: `${menuPosition.top}px`,
              right: `${menuPosition.right}px`,
              zIndex: 99999
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="py-1">
              <button
                type="button"
                onClick={() => {
                  handleDuplicate(song);
                  setOpenMenuId(null);
                  setMenuPosition(null);
                }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 bg-white"
              >
                Duplicate
              </button>
              <button
                type="button"
                onClick={() => {
                  handleEdit(song.id);
                  setOpenMenuId(null);
                  setMenuPosition(null);
                }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 bg-white"
              >
                Edit
              </button>
              <div className="border-t border-gray-200 my-1"></div>
              <button
                type="button"
                onClick={() => {
                  handleRemove(songbookSong.id);
                  setOpenMenuId(null);
                  setMenuPosition(null);
                }}
                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 bg-white"
              >
                Remove from Songbook
              </button>
            </div>
          </div>,
          document.body
        );
      })()}

      {/* Share Songbook with Groups Modal */}
      {showShareModal && songbook && (
        <ShareSongbookWithGroupsModal
          songbookId={songbook.id}
          songbookTitle={songbook.title}
          songbookSongs={songbookSongs}
          userGroups={userGroups}
          userId={userId}
          onClose={() => setShowShareModal(false)}
          onSuccess={() => setShowShareModal(false)}
        />
      )}
    </div>
  );
}

// Share Songbook with Groups Modal Component
function ShareSongbookWithGroupsModal({ songbookId, songbookTitle, songbookSongs, userGroups, userId, onClose, onSuccess }) {
  const [selectedGroups, setSelectedGroups] = useState(new Set());
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState(null);

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
      setError('You must be logged in to share songbooks.');
      return;
    }

    setSharing(true);
    setError(null);

    try {
      // Get all song IDs from the songbook
      const songIds = songbookSongs
        .map(ss => ss.song?.id)
        .filter(Boolean);

      if (songIds.length === 0) {
        setError('This songbook has no songs to share.');
        return;
      }

      // Share all songs with selected groups
      await shareSongsWithGroups(
        songIds,
        Array.from(selectedGroups),
        userId
      );

      onSuccess();
    } catch (err) {
      console.error('Error sharing songbook:', err);
      setError(err.message || 'Failed to share songbook. Please try again.');
    } finally {
      setSharing(false);
    }
  };

  const selectedGroupNames = userGroups
    .filter(g => selectedGroups.has(g.id))
    .map(g => g.name);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold mb-4">Share "{songbookTitle}" with Groups</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        {selectedGroups.size > 0 && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-yellow-800 text-sm">
            <strong>Note:</strong> This will share all {songbookSongs.length} song{songbookSongs.length !== 1 ? 's' : ''} in this songbook with {selectedGroupNames.length === 1 ? selectedGroupNames[0] : 'the selected groups'}.
          </div>
        )}

        {userGroups.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>You're not a member of any groups yet.</p>
            <p className="text-sm mt-2">Join or create a group to share songbooks.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
            {userGroups.map((group) => (
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
                  <div className="font-medium">{group.name}</div>
                  {group.description && (
                    <div className="text-sm text-gray-600">{group.description}</div>
                  )}
                </div>
              </label>
            ))}
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
          {userGroups.length > 0 && (
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

