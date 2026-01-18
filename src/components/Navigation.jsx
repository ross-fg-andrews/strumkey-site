import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
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
            {/* Future contextual buttons will go here */}
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
