import { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAccessibleSongs, useSongbook } from '../db/queries';
import { db } from '../db/schema';
import { XIcon, MicrophoneStageIcon } from '../utils/icons';

// Utility function to get sort key (removes leading articles)
function getSortKey(title) {
  if (!title) return '';
  const trimmed = title.trim();
  const lower = trimmed.toLowerCase();
  
  // Remove leading articles (case-insensitive)
  if (lower.startsWith('the ')) {
    return trimmed.substring(4).trim();
  }
  if (lower.startsWith('a ')) {
    return trimmed.substring(2).trim();
  }
  if (lower.startsWith('an ')) {
    return trimmed.substring(3).trim();
  }
  
  return trimmed;
}

// Group songs by first letter (after article removal)
function groupSongsByLetter(songs) {
  const grouped = new Map();
  
  songs.forEach(song => {
    const sortKey = getSortKey(song.title);
    if (!sortKey) return;
    
    const firstLetter = sortKey.charAt(0).toUpperCase();
    if (!/[A-Z]/.test(firstLetter)) return; // Only group letters
    
    if (!grouped.has(firstLetter)) {
      grouped.set(firstLetter, []);
    }
    grouped.get(firstLetter).push(song);
  });
  
  // Sort songs within each group
  grouped.forEach((songsInGroup, letter) => {
    songsInGroup.sort((a, b) => {
      const keyA = getSortKey(a.title).toLowerCase();
      const keyB = getSortKey(b.title).toLowerCase();
      return keyA.localeCompare(keyB);
    });
  });
  
  // Convert to array and sort by letter
  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([letter, songs]) => ({ letter, songs }));
}

export default function SongBrowser({ onClose, onBackToNavigation }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const songbookId = searchParams.get('songbook');
  const listRef = useRef(null);
  const [focusedIndex, setFocusedIndex] = useState(null);
  
  // Get songbook data if in songbook context
  const { data: songbookData } = useSongbook(songbookId, user?.id);
  const songbook = songbookData?.songbooks?.[0];
  
  // Get accessible songs
  const { data: accessibleSongsData } = useAccessibleSongs(user?.id);
  const allAccessibleSongs = accessibleSongsData?.songs || [];
  const accessibleSongsMap = new Map(
    allAccessibleSongs.map(song => [song.id, song])
  );
  
  // Get songbook songs if in songbook context
  const { data: songbookSongsData } = db.useQuery({
    songbookSongs: {
      $: {
        where: songbookId ? { songbookId } : { songbookId: '' },
        order: { order: 'asc' },
      },
    },
  });
  const rawSongbookSongs = songbookSongsData?.songbookSongs || [];
  
  // Determine which songs to display
  const songsToDisplay = useMemo(() => {
    if (songbookId) {
      // Songbook view: enrich songbookSongs with accessible songs
      return rawSongbookSongs
        .map(ss => {
          const song = accessibleSongsMap.get(ss.songId);
          return song ? { ...ss, song } : null;
        })
        .filter(Boolean)
        .map(ss => ss.song)
        .filter(Boolean);
    } else {
      // All Songs view
      return allAccessibleSongs;
    }
  }, [songbookId, rawSongbookSongs, accessibleSongsMap, allAccessibleSongs]);
  
  // Group songs by letter
  const groupedSongs = useMemo(() => {
    return groupSongsByLetter(songsToDisplay);
  }, [songsToDisplay]);
  
  // Handle song click
  const handleSongClick = (songId) => {
    let targetPath = `/songs/${songId}`;
    if (songbookId) {
      targetPath += `?songbook=${songbookId}`;
    }
    navigate(targetPath);
    onClose();
  };
  
  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!listRef.current) return;
      
      const allSongs = groupedSongs.flatMap(group => group.songs);
      if (allSongs.length === 0) return;
      
      let newIndex = focusedIndex;
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        newIndex = focusedIndex === null ? 0 : Math.min(focusedIndex + 1, allSongs.length - 1);
        setFocusedIndex(newIndex);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        newIndex = focusedIndex === null ? allSongs.length - 1 : Math.max(focusedIndex - 1, 0);
        setFocusedIndex(newIndex);
      } else if (e.key === 'Enter' && focusedIndex !== null) {
        e.preventDefault();
        const song = allSongs[focusedIndex];
        if (song) {
          handleSongClick(song.id);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onBackToNavigation();
      }
      
      // Scroll focused item into view
      if (newIndex !== null && newIndex !== focusedIndex) {
        const songElements = listRef.current.querySelectorAll('[data-song-index]');
        const targetElement = Array.from(songElements).find(
          el => parseInt(el.getAttribute('data-song-index')) === newIndex
        );
        if (targetElement) {
          targetElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedIndex, groupedSongs, songbookId, navigate, onClose, onBackToNavigation]);
  
  // Reset focus when songs change
  useEffect(() => {
    setFocusedIndex(null);
  }, [groupedSongs]);
  
  // Calculate flat index for each song
  let flatIndex = 0;
  
  return (
    <div className="flex flex-col h-full">
      {/* Header - Sticky */}
      <div className="flex-shrink-0">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="font-['Alice',_serif] font-normal text-[28px] text-gray-900">
            Strumkey
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Close navigation"
          >
            <XIcon className="h-5 w-5 text-gray-600" />
          </button>
        </div>
        
        {/* Back Button */}
        <div className="px-4">
          <button
            onClick={onBackToNavigation}
            className="bg-slate-200 hover:bg-slate-300 rounded-lg px-3 py-2 flex items-center gap-2 w-full text-left transition-colors mb-3"
            aria-label="Back to navigation"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 text-gray-600"
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
            <span className="truncate text-gray-700 font-['Alice',_serif] font-normal text-[24px]">
              {songbook ? songbook.name : 'All Songs'}
            </span>
          </button>
        </div>
        {/* Separator Line - matches button width (same px-4 padding) */}
        <div className="px-4">
          <div className="border-b border-gray-200"></div>
        </div>
      </div>
      
      {/* Song List - Scrollable */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-6">
        {groupedSongs.length === 0 ? (
          <div className="py-8 text-center text-gray-500">
            <p>No songs found</p>
          </div>
        ) : (
          groupedSongs.map(({ letter, songs }) => (
            <div key={letter}>
              {/* Letter Header */}
              <div className="border-b border-gray-200 py-2">
                <div className="text-gray-500 text-sm font-medium">{letter}</div>
              </div>
              
              {/* Songs in this group */}
              {songs.map((song) => {
                const currentIndex = flatIndex++;
                const isFocused = focusedIndex === currentIndex;
                
                return (
                  <button
                    key={song.id}
                    data-song-index={currentIndex}
                    onClick={() => handleSongClick(song.id)}
                    onFocus={() => setFocusedIndex(currentIndex)}
                    className={`w-full text-left border-b border-gray-200 py-3 hover:bg-gray-100 transition-colors focus:outline-none focus:bg-gray-100 ${
                      isFocused ? 'bg-gray-100' : ''
                    }`}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="font-['Alice',_serif] text-[20px] text-gray-900 leading-tight truncate">
                        {song.title || 'Untitled'}
                      </span>
                      {song.artist ? (
                        <div className="flex items-center gap-0.5 mt-0">
                          <MicrophoneStageIcon size={14} className="text-gray-500 flex-shrink-0" />
                          <span className="text-[14px] text-gray-500 leading-tight truncate">
                            {song.artist}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[14px] text-gray-400 mt-0 leading-tight">—</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
