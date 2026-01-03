import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useMySongbooks } from '../db/queries';
import { deleteSongbook, duplicateSongbook } from '../db/mutations';
import { db } from '../db/schema';
import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function SongbooksIndex() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id;
  const songbooksQuery = useMySongbooks(userId);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [duplicatingId, setDuplicatingId] = useState(null);
  const [menuPosition, setMenuPosition] = useState(null);
  const menuRefs = useRef({});
  const buttonRefs = useRef({});
  const menuPortalRef = useRef(null);
  
  if (songbooksQuery.error) {
    console.error('useMySongbooks error:', songbooksQuery.error);
  }
  
  const songbooks = songbooksQuery.data?.songbooks || [];

  // Query meetings for all songbooks to check if they can be deleted
  const songbookIds = songbooks.map(sb => sb.id);
  const { data: meetingsData } = db.useQuery({
    meetings: {
      $: {
        where: songbookIds.length > 0 
          ? { songbookId: { $in: songbookIds } }
          : { songbookId: '' },
      },
    },
  });

  // Filter to only upcoming meetings and create a map by songbookId
  const now = Date.now();
  const meetingsBySongbookId = new Map(
    (meetingsData?.meetings || [])
      .filter(m => m.date && m.date >= now)
      .map(m => [m.songbookId, m])
  );

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
        const buttonRef = buttonRefs.current[menuPosition.songbookId];
        
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

  // Handle duplicate songbook
  const handleDuplicate = async (songbook) => {
    if (!userId) {
      alert('You must be logged in to duplicate a songbook.');
      return;
    }

    setDuplicatingId(songbook.id);
    setOpenMenuId(null);

    try {
      // Get the songbook with its songs
      const { data: songbookData } = await db.query({
        songbooks: {
          $: {
            where: { id: songbook.id },
          },
        },
        songbookSongs: {
          $: {
            where: { songbookId: songbook.id },
            order: { order: 'asc' },
          },
        },
      });

      const songbookSongs = songbookData?.songbookSongs || [];
      const newSongbookId = await duplicateSongbook(songbook, songbookSongs, userId);
      
      alert('Songbook duplicated successfully!');
      navigate(`/songbooks/${newSongbookId}`);
    } catch (err) {
      console.error('Error duplicating songbook:', err);
      alert('Failed to duplicate songbook. Please try again.');
    } finally {
      setDuplicatingId(null);
    }
  };

  // Handle delete songbook
  const handleDelete = async (songbook) => {
    if (!userId) {
      alert('You must be logged in to delete a songbook.');
      return;
    }

    // Check for upcoming meetings using the songbook
    const hasFutureMeetings = meetingsBySongbookId.has(songbook.id);
    
    if (hasFutureMeetings) {
      alert('Songbook is attached to upcoming meetings. Remove it from meetings first.');
      setOpenMenuId(null);
      return;
    }

    if (!confirm(`Are you sure you want to delete "${songbook.title}"? This action cannot be undone.`)) {
      setOpenMenuId(null);
      return;
    }

    setDeletingId(songbook.id);
    setOpenMenuId(null);

    try {
      await deleteSongbook(songbook.id);
      // The query will automatically update via real-time sync
    } catch (err) {
      console.error('Error deleting songbook:', err);
      alert('Failed to delete songbook. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  // Handle edit songbook - navigate to songbook page (edit functionality can be added there)
  const handleEdit = (songbookId) => {
    navigate(`/songbooks/${songbookId}`);
    setOpenMenuId(null);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Songbooks</h1>
        <Link to="/songbooks/new" className="btn btn-primary">
          + New Songbook
        </Link>
      </div>

      {songbooks.length === 0 ? (
        <div className="card text-center py-12 text-gray-500">
          <p className="text-lg mb-2">No songbooks yet.</p>
          <p className="text-sm">Create a songbook to organize your songs</p>
        </div>
      ) : (
        <div className="card" style={{ position: 'relative', overflow: 'visible' }}>
          <div className="overflow-x-auto" style={{ overflowY: 'visible' }}>
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Title
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {songbooks.map((songbook) => {
                  const isMenuOpen = openMenuId === songbook.id;
                  const isDeleting = deletingId === songbook.id;
                  const isDuplicating = duplicatingId === songbook.id;
                  
                  return (
                    <tr key={songbook.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Link
                          to={`/songbooks/${songbook.id}`}
                          className="text-sm font-medium text-gray-900 hover:text-primary-600"
                          onClick={(e) => {
                            // Don't navigate if clicking from within the actions cell
                            if (e.target.closest('td:last-child')) {
                              e.preventDefault();
                            }
                          }}
                        >
                          {songbook.title}
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-gray-600 max-w-md truncate">
                          {songbook.description || <span className="text-gray-400">—</span>}
                        </p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-xs text-gray-500">
                          {songbook.type === 'private' ? 'Private' : 'Group'}
                        </span>
                      </td>
                      <td 
                        className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium"
                        onClick={(e) => e.stopPropagation()}
                        style={{ position: 'relative', overflow: 'visible' }}
                      >
                        <div className="relative" ref={el => {
                          menuRefs.current[songbook.id] = el;
                          buttonRefs.current[songbook.id] = el?.querySelector('button');
                        }}>
                          <button
                            type="button"
                            onClick={(e) => {
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
                                  songbookId: songbook.id
                                });
                                setOpenMenuId(songbook.id);
                              }
                            }}
                            disabled={isDeleting || isDuplicating}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            aria-label="Songbook actions"
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
      {menuPosition && openMenuId === menuPosition.songbookId && (() => {
        const songbook = songbooks.find(sb => sb.id === menuPosition.songbookId);
        if (!songbook) return null;
        
        const isDuplicating = duplicatingId === songbook.id;
        const isDeleting = deletingId === songbook.id;
        
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
                  handleDuplicate(songbook);
                  setOpenMenuId(null);
                  setMenuPosition(null);
                }}
                disabled={isDuplicating}
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed bg-white"
              >
                {isDuplicating ? 'Duplicating...' : 'Duplicate'}
              </button>
              <button
                type="button"
                onClick={() => {
                  handleEdit(songbook.id);
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
                  handleDelete(songbook);
                  setOpenMenuId(null);
                  setMenuPosition(null);
                }}
                disabled={isDeleting}
                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed bg-white"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>,
          document.body
        );
      })()}
    </div>
  );
}

