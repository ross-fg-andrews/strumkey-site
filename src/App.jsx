import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { db } from './db/schema'
import Layout from './components/Layout'
import LandingPage from './pages/LandingPage'
import HomePage from './pages/HomePage'
import SongEditor from './pages/SongEditor'
import SongSheet from './pages/SongSheet'
import SongbookIndex from './pages/SongbookIndex'
import GroupPage from './pages/GroupPage'
import MeetingPage from './pages/MeetingPage'
import ProfilePage from './pages/ProfilePage'

function App() {
  // Log InstantDB errors for debugging
  useEffect(() => {
    // Override console.error to catch InstantDB validation errors
    const originalError = console.error;
    console.error = (...args) => {
      const errorObj = args[0];
      if (errorObj && typeof errorObj === 'object' && errorObj.op === 'error') {
        console.group('🔴 InstantDB Validation Error');
        console.error('Full error object:', JSON.stringify(errorObj, null, 2));
        console.error('Error type:', errorObj.type);
        console.error('Status:', errorObj.status);
        console.error('Client Event ID:', errorObj['client-event-id']);
        if (errorObj['original-event']) {
          console.error('Original event:', JSON.stringify(errorObj['original-event'], null, 2));
          console.error('Original event type:', errorObj['original-event']?.op);
          console.error('Original event data:', errorObj['original-event']?.data);
        }
        if (errorObj.message) {
          console.error('Error message:', errorObj.message);
        }
        if (errorObj.errors) {
          console.error('Validation errors:', errorObj.errors);
        }
        console.groupEnd();
      }
      originalError.apply(console, args);
    };

    // Also listen to window error events
    const handleError = (event) => {
      if (event.error && event.error.op === 'error') {
        console.group('🔴 InstantDB Error Event');
        console.error('Error:', event.error);
        console.groupEnd();
      }
    };
    window.addEventListener('error', handleError);

    return () => {
      console.error = originalError;
      window.removeEventListener('error', handleError);
    };
  }, []);

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route element={<Layout />}>
            <Route path="/home" element={<HomePage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/songs/new" element={<SongSheet />} />
            <Route path="/songs/:id/edit" element={<SongSheet />} />
            <Route path="/songs/:id" element={<SongSheet />} />
            <Route path="/songbooks/:id" element={<SongbookIndex />} />
            <Route path="/groups/:id" element={<GroupPage />} />
            <Route path="/meetings/:id" element={<MeetingPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App

