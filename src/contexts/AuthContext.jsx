import { createContext, useContext } from 'react';
import { db } from '../db/schema';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Use InstantDB's built-in useAuth hook
  const authState = db.useAuth();

  const sendMagicCode = async (email) => {
    try {
      await db.auth.sendMagicCode({ email });
      return { success: true };
    } catch (error) {
      return { success: false, error };
    }
  };

  const verifyCode = async (email, code) => {
    try {
      await db.auth.signInWithMagicCode({ email, code });
      return { success: true };
    } catch (error) {
      return { success: false, error };
    }
  };

  // Keep signIn for backward compatibility (but it just sends code)
  const signIn = sendMagicCode;

  const signOut = async () => {
    try {
      await db.auth.signOut();
      return { success: true };
    } catch (error) {
      return { success: false, error };
    }
  };

  const value = {
    user: authState.user,
    loading: authState.isLoading,
    error: authState.error,
    signIn,
    sendMagicCode,
    verifyCode,
    signOut,
    isAuthenticated: !!authState.user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

