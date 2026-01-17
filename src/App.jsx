import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { db } from './db/schema'
import Layout from './components/Layout'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import AdminPanel from './pages/AdminPanel'
import HomePage from './pages/HomePage'
import SongEditor from './pages/SongEditor'
import SongSheet from './pages/SongSheet'
import SongsIndex from './pages/SongsIndex'
import SongbookIndex from './pages/SongbookIndex'
import SongbooksIndex from './pages/SongbooksIndex'
import SongbookEditor from './pages/SongbookEditor'
import GroupPage from './pages/GroupPage'
import GroupsIndex from './pages/GroupsIndex'
import MeetingPage from './pages/MeetingPage'
import ProfilePage from './pages/ProfilePage'
import ChordsPage from './pages/ChordsPage'

function App() {
  // Log InstantDB errors for debugging
  useEffect(() => {
    // Override console.error to catch InstantDB validation errors
    const originalError = console.error;
    console.error = (...args) => {
      const errorObj = args[0];
      const errorMessage = typeof errorObj === 'string' 
        ? errorObj 
        : errorObj?.message || errorObj?.toString() || '';
      const errorName = errorObj?.name || '';
      
      // Filter out harmless IndexedDB errors that occur during component unmount
      // These happen when React StrictMode causes double-mounting or when the database
      // connection closes while operations are in progress - they're typically non-fatal
      const isIndexedDBError = 
        (errorMessage.includes('IDBDatabase') && errorMessage.includes('connection is closing')) ||
        (errorName === 'InvalidStateError' && errorMessage.includes('IDBDatabase'));
      
      const isStorageError = 
        errorMessage.includes('Unable to read from storage') ||
        errorMessage.includes('Unable to write to storage');
      
      if (isIndexedDBError || isStorageError) {
        // Silently ignore these - they're expected during component lifecycle
        // and don't affect functionality
        return;
      }
      
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

    // Handle unhandled promise rejections (IndexedDB errors often come through here)
    const handleUnhandledRejection = (event) => {
      const error = event.reason;
      const errorMessage = error?.message || error?.toString() || '';
      const errorName = error?.name || '';
      
      // Filter out harmless IndexedDB errors
      const isIndexedDBError = 
        (errorMessage.includes('IDBDatabase') && errorMessage.includes('connection is closing')) ||
        (errorName === 'InvalidStateError' && errorMessage.includes('IDBDatabase'));
      
      if (isIndexedDBError) {
        // Prevent the error from showing in console
        event.preventDefault();
        return;
      }
    };
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      console.error = originalError;
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route element={<Layout />}>
            <Route path="/home" element={<HomePage />} />
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/songs" element={<SongsIndex />} />
            <Route path="/songs/new" element={<SongSheet />} />
            <Route path="/songs/:id" element={<SongSheet />} />
            <Route path="/chords" element={<ChordsPage />} />
            <Route path="/songbooks" element={<SongbooksIndex />} />
            <Route path="/songbooks/new" element={<SongbookEditor />} />
            <Route path="/songbooks/:id" element={<SongbookIndex />} />
            <Route path="/groups" element={<GroupsIndex />} />
            <Route path="/groups/:id" element={<GroupPage />} />
            <Route path="/meetings/:id" element={<MeetingPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App

