import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
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
} from '../utils/icons';

export default function Navigation() {
  const [isOpen, setIsOpen] = useState(false);
  const { user: authUser, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

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
    { name: 'Groups', path: '/groups', icon: UsersIcon },
  ];

  const bottomItems = [
    { name: 'Profile', path: '/profile', icon: UserIcon },
    { name: 'Settings', path: '/profile', icon: GearIcon },
  ];

  return (
    <>
      {/* Menu Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-4 left-4 z-40 p-2 rounded-lg hover:bg-gray-200 transition-colors"
        aria-label="Open navigation"
      >
        <MenuIcon className="h-6 w-6 text-gray-700" />
      </button>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Side Navigation Panel */}
      <div
        className={`fixed top-0 left-0 h-full w-64 max-[320px]:w-full bg-white shadow-xl z-50 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <Link
              to="/home"
              onClick={handleLinkClick}
              className="text-2xl font-bold text-primary-600"
            >
              Strumkey
            </Link>
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Close navigation"
            >
              <XIcon className="h-5 w-5 text-gray-600" />
            </button>
          </div>

          {/* Navigation Items - Top Section */}
          <nav className="flex-1 overflow-y-auto py-4">
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
                        ? 'bg-primary-50 text-primary-700 font-medium'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${active ? 'text-primary-600' : 'text-gray-500'}`} />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* Bottom Section */}
          <div className="border-t border-gray-200 py-4">
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
                        ? 'bg-primary-50 text-primary-700 font-medium'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${active ? 'text-primary-600' : 'text-gray-500'}`} />
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
                      ? 'bg-primary-50 text-primary-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <AdminIcon className={`h-5 w-5 ${isActive('/admin') ? 'text-primary-600' : 'text-gray-500'}`} />
                  <span>Admin</span>
                </Link>
              )}
              <button
                onClick={handleSignOut}
                className="flex items-center gap-3 px-3 py-2 rounded-lg mb-1 w-full text-left text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <LogOutIcon className="h-5 w-5 text-gray-500" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
