import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Navigation from './Navigation';
import { useAuth } from '../contexts/AuthContext';
import { SongActionsProvider } from '../contexts/SongActionsContext';

export default function Layout() {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/');
    }
  }, [loading, isAuthenticated, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <SongActionsProvider>
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="w-full px-4 pb-8 pt-4 xl:container xl:mx-auto">
          <Outlet />
        </main>
      </div>
    </SongActionsProvider>
  );
}

