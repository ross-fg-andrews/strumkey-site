import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Navigation from './Navigation';
import { useAuth } from '../contexts/AuthContext';
import { SongActionsProvider } from '../contexts/SongActionsContext';
import OnboardingModal from './OnboardingModal';
import { db } from '../db/schema';

export default function Layout() {
  const { isAuthenticated, loading, user: authUser } = useAuth();
  const navigate = useNavigate();

  // Query full user data to check onboarding status
  // Use impossible condition when no user ID to avoid querying
  const { data: userData } = db.useQuery({
    $users: {
      $: {
        where: authUser?.id ? { id: authUser.id } : { id: '' },
      },
    },
  });

  const user = userData?.$users?.[0] || authUser;

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

  // Only show onboarding modal if:
  // 1. User is authenticated AND has a user ID
  // 2. We have user data from the query (not just authUser)
  // 3. hasCompletedOnboarding is NOT explicitly true
  // 4. AND user is missing required fields
  // 
  // This ensures:
  // - Modal only shows for authenticated users (not on landing page)
  // - We wait for user data to load before checking
  // - Existing users with hasCompletedOnboarding=true never see it
  const hasUserData = userData && userData.$users && userData.$users.length > 0;
  const needsOnboarding = 
    isAuthenticated &&
    authUser?.id &&
    hasUserData && // Only check if we have loaded user data
    user && // User object exists
    user.hasCompletedOnboarding !== true && // Explicitly not completed
    (!user.firstName || !user.lastName || !user.locationCity); // Missing required fields

  return (
    <SongActionsProvider>
      <div className="min-h-screen bg-gray-50">
        {/* Show onboarding modal if needed - blocks all access */}
        {needsOnboarding && <OnboardingModal />}
        
        {/* Only show navigation and content if onboarding is complete */}
        {!needsOnboarding && (
          <>
            <Navigation />
            <main className="w-full px-4 pb-8 pt-4 xl:container xl:mx-auto">
              <Outlet />
            </main>
          </>
        )}
      </div>
    </SongActionsProvider>
  );
}

