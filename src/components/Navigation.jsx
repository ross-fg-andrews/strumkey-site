import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSongActions } from '../contexts/SongActionsContext';
import { db } from '../db/schema';
import {
  MenuIcon,
  XIcon,
  HomeIcon,
  MusicIcon,
  BookIcon,
  UsersIcon,
  UserIcon,
  GearIcon,
  LogOutIcon,
  AdminIcon,
  ChordIcon,
  ArrowLineUpIcon,
  ArrowLineDownIcon,
} from '../utils/icons';
import SongBrowser from './SongBrowser';

export default function Navigation() {
  const [isOpen, setIsOpen] = useState(false);
  const [showSongBrowser, setShowSongBrowser] = useState(false);
  const { user: authUser, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // Query the full user object to check isSiteAdmin
  const { data: userData } = db.useQuery({
    $users: {
      $: {
        where: authUser?.id ? { id: authUser.id } : { id: '' },
      },
    },
  });

  const user = userData?.$users?.[0] || authUser;
  const isSiteAdmin = user?.isSiteAdmin === true;

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
    setIsOpen(false);
  };

  const handleLinkClick = () => {
    setIsOpen(false);
    setShowSongBrowser(false);
  };

  // Detect if we're on a song page (but not /songs index)
  const isSongPage = location.pathname.startsWith('/songs/') && location.pathname !== '/songs';
  
  // Get song actions context (only available when viewing a song)
  const songActions = useSongActions();

  // Close menu when clicking outside (for song actions menu)
  useEffect(() => {
    if (!songActions?.menuRef || !songActions?.menuOpen) return;
    
    function handleClickOutside(event) {
      if (songActions.menuRef.current && !songActions.menuRef.current.contains(event.target)) {
        songActions.setMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [songActions?.menuOpen, songActions?.menuRef, songActions?.setMenuOpen]);
  
  // Reset song browser state when navigating away from song page
  useEffect(() => {
    if (!isSongPage && showSongBrowser) {
      setShowSongBrowser(false);
    }
  }, [isSongPage, showSongBrowser]);
  
  // When opening navigation on a song page, show song browser
  const handleOpenNavigation = () => {
    setIsOpen(true);
    if (isSongPage) {
      setShowSongBrowser(true);
    } else {
      setShowSongBrowser(false);
    }
  };
  
  // When closing, reset song browser state
  const handleCloseNavigation = () => {
    setIsOpen(false);
    setShowSongBrowser(false);
  };
  
  // Handle back to standard navigation from song browser
  const handleBackToNavigation = () => {
    setShowSongBrowser(false);
  };

  const isActive = (path) => {
    if (path === '/home') {
      return location.pathname === '/home';
    }
    return location.pathname.startsWith(path);
  };

  const navigationItems = [
    { name: 'Home', path: '/home', icon: HomeIcon },
    { name: 'Songs', path: '/songs', icon: MusicIcon },
    { name: 'Songbooks', path: '/songbooks', icon: BookIcon },
    { name: 'Chords', path: '/chords', icon: ChordIcon },
    { name: 'Groups', path: '/groups', icon: UsersIcon },
  ];

  const bottomItems = [
    { name: 'Profile', path: '/profile', icon: UserIcon },
    { name: 'Settings', path: '/profile', icon: GearIcon },
  ];

  return (
    <>
      {/* Sticky Top Menu Bar */}
      <div className="sticky top-0 z-40 bg-gray-50">
        <div className="flex items-center justify-between px-4 h-14">
          {/* Left: Menu Button */}
          <button
            onClick={handleOpenNavigation}
            className="p-2 rounded-lg hover:bg-gray-200 transition-colors"
            aria-label="Open navigation"
          >
            <MenuIcon className="h-6 w-6 text-gray-700" />
          </button>
          
          {/* Right: Reserved for contextual buttons */}
          <div className="flex items-center gap-2">
            {/* Song Actions Menu Button (ellipsis) */}
            {isSongPage && songActions && (
              <div className="relative" ref={songActions.menuRef}>
                <button
                  onClick={() => songActions.setMenuOpen(!songActions.menuOpen)}
                  className="p-2 rounded-lg hover:bg-gray-200 transition-colors"
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

                {songActions.menuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                    <div className="py-1">
                      <button
                        onClick={() => songActions.handleChordModeChange('inline')}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
                          songActions.chordMode === 'inline' ? 'bg-gray-50 font-medium' : ''
                        }`}
                      >
                        Inline Chords
                      </button>
                      <button
                        onClick={() => songActions.handleChordModeChange('above')}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
                          songActions.chordMode === 'above' ? 'bg-gray-50 font-medium' : ''
                        }`}
                      >
                        Chords Above
                      </button>
                      <button
                        onClick={() => songActions.handleExportPdfClick?.()}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                      >
                        Export as PDF
                      </button>
                      {songActions.isCreator && (
                        <>
                          <div className="border-t border-gray-200 my-1"></div>
                          <button
                            onClick={songActions.handleShareClick}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                          >
                            Share with Group
                          </button>
                        </>
                      )}
                      {songActions.canEdit && (
                        <>
                          <div className="border-t border-gray-200 my-1"></div>
                          <button
                            onClick={songActions.handleEditClick}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                          >
                            Edit
                          </button>
                        </>
                      )}
                      {songActions.isCreator && (
                        <>
                          <div className="border-t border-gray-200 my-1"></div>
                          <button
                            onClick={songActions.handleDeleteClick}
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
            )}
            {/* Toggle Chords Panel Button */}
            {isSongPage && songActions && songActions.toggleChordsPanel && songActions.hasChords && (() => {
              // Always use up/down arrows since chords are always displayed horizontally above lyrics
              const ToggleIcon = songActions.chordsPanelVisible ? ArrowLineUpIcon : ArrowLineDownIcon;
              
              return (
                <button
                  onClick={songActions.toggleChordsPanel}
                  className="p-2 rounded-lg hover:bg-gray-200 transition-colors"
                  aria-label={songActions.chordsPanelVisible ? "Hide chords panel" : "Show chords panel"}
                >
                  <ToggleIcon className="h-6 w-6 text-gray-700" />
                </button>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-20 z-[45] transition-opacity"
          onClick={handleCloseNavigation}
        />
      )}

      {/* Side Navigation Panel */}
      <div
        className={`fixed top-0 left-0 h-full w-[380px] max-[320px]:w-full bg-gray-50 shadow-xl z-50 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {showSongBrowser ? (
          <SongBrowser
            onClose={handleCloseNavigation}
            onBackToNavigation={handleBackToNavigation}
          />
        ) : (
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <Link
                to="/home"
                onClick={handleLinkClick}
                className="font-['Alice',_serif] font-normal text-[28px] text-gray-900"
              >
                Strumkey
              </Link>
              <button
                onClick={handleCloseNavigation}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                aria-label="Close navigation"
              >
                <XIcon className="h-5 w-5 text-gray-600" />
              </button>
            </div>

            {/* Navigation Items - Top Section */}
            <nav className="flex-1 overflow-y-auto pt-0 pb-4">
              <div className="px-2">
                {navigationItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.path);
                  return (
                    <Link
                      key={item.name}
                      to={item.path}
                      onClick={handleLinkClick}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg mb-1 transition-colors ${
                        active
                          ? 'bg-gray-200/60 text-gray-900'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <Icon weight="light" className={`h-5 w-5 ${active ? 'text-gray-900' : 'text-gray-500'}`} />
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </nav>

            {/* Bottom Section */}
            <div className="py-4">
              <div className="px-2">
                {bottomItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.path);
                  return (
                    <Link
                      key={item.name}
                      to={item.path}
                      onClick={handleLinkClick}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg mb-1 transition-colors ${
                        active
                          ? 'bg-gray-200/60 text-gray-900'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <Icon weight="light" className={`h-5 w-5 ${active ? 'text-gray-900' : 'text-gray-500'}`} />
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
                {isSiteAdmin && (
                  <Link
                    to="/admin"
                    onClick={handleLinkClick}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg mb-1 transition-colors ${
                      isActive('/admin')
                        ? 'bg-gray-200/60 text-gray-900'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <AdminIcon weight="light" className={`h-5 w-5 ${isActive('/admin') ? 'text-gray-900' : 'text-gray-500'}`} />
                    <span>Admin</span>
                  </Link>
                )}
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg mb-1 w-full text-left text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <LogOutIcon weight="light" className="h-5 w-5 text-gray-500" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
