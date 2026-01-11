import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { addToWaitingList } from '../db/mutations';
import { useUserByEmail } from '../db/queries';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [showWaitingList, setShowWaitingList] = useState(false);
  const [waitingListSuccess, setWaitingListSuccess] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState('');
  const { sendMagicCode, verifyCode, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  
  // Use hook to check if user exists - query when checkingEmail is set
  // Always pass a value (empty string if no email) to ensure hook is always called
  const emailToCheck = checkingEmail.trim() || '';
  const { data: userData, error: userQueryError } = useUserByEmail(emailToCheck);
  
  // Store the latest user data in a ref so we can access it in the submit handler
  const userDataRef = useRef(userData);
  useEffect(() => {
    userDataRef.current = userData;
    if (userQueryError) {
      console.error('User query error:', userQueryError);
    }
  }, [userData, userQueryError]);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/home');
    }
  }, [isAuthenticated, navigate]);

  // Don't render the login form if already authenticated
  if (isAuthenticated) {
    return null;
  }

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    
    if (!email.trim()) {
      setMessage('Please enter an email address.');
      return;
    }

    setLoading(true);
    setMessage('');
    setShowWaitingList(false);

    const normalizedEmail = email.trim().toLowerCase();
    
    // Trigger the query by setting checkingEmail
    setCheckingEmail(normalizedEmail);
    
    // Wait a moment for the query to start
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Wait for query to complete - poll up to 2 seconds
    let attempts = 0;
    let previousData = undefined;
    let users = [];
    while (attempts < 20) {
      await new Promise(resolve => setTimeout(resolve, 100));
      const currentData = userDataRef.current;
      users = currentData?.$users || [];
      
      // Check if data has changed (query completed)
      if (currentData !== previousData && currentData !== undefined) {
        // Data has updated, query likely completed
        break;
      }
      previousData = currentData;
      attempts++;
    }

    // Check if user exists - check if any user's email matches (case-insensitive)
    const userFound = users.length > 0 && users.some(u => {
      const userEmail = u.email?.toLowerCase().trim();
      return userEmail === normalizedEmail;
    });

    // Debug logging
    console.log('Checking user existence:', {
      normalizedEmail,
      usersFound: users.length,
      userEmails: users.map(u => u.email),
      userFound,
      userData: userDataRef.current,
      queryError: userQueryError
    });
    
    // If there's a query error, it might be a permissions issue
    // In that case, we'll try sending the code anyway and let InstantDB handle it
    if (userQueryError) {
      console.error('Query error details:', userQueryError);
      console.warn('Permission error detected. Trying to send code anyway - InstantDB will handle validation.');
      // Continue to try sending code - InstantDB auth will fail if user doesn't exist
    }

    // If query returned no users and no error, user likely doesn't exist
    // But if there was an error, it might be a permissions issue, so try anyway
    if (!userFound && !userQueryError) {
      // User doesn't exist, show waiting list message
      setShowWaitingList(true);
      setLoading(false);
      setCheckingEmail(''); // Reset
      return;
    }
    
    // If there was an error but we're proceeding, log it
    if (userQueryError) {
      console.log('Proceeding despite query error - will let InstantDB auth validate');
    }

    // User exists, proceed with sending code
    const result = await sendMagicCode(email);
    
    if (result.success) {
      setMessage('Check your email for the verification code!');
      setCodeSent(true);
    } else {
      setMessage('Error sending verification code. Please try again.');
    }
    
    setLoading(false);
    setCheckingEmail(''); // Reset
  };

  const handleCodeSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    const result = await verifyCode(email, code);
    
    if (result.success) {
      // Auth state will update automatically, redirect will be handled by useEffect
      // when isAuthenticated becomes true
    } else {
      setMessage('Invalid code. Please try again.');
    }
    
    setLoading(false);
  };

  const handleBack = () => {
    setCodeSent(false);
    setCode('');
    setMessage('');
    setShowWaitingList(false);
    setWaitingListSuccess(false);
  };

  const handleWaitingListSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      await addToWaitingList(email);
      setWaitingListSuccess(true);
      setEmail('');
    } catch (error) {
      console.error('Error adding to waiting list:', error);
      setMessage('Error joining waiting list. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-primary-900 mb-2">
            Strumkey
          </h1>
          <p className="text-gray-700">
            Log in to your account
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-xl p-8">
          <h2 className="text-2xl font-semibold mb-6">Log In</h2>
          
          {waitingListSuccess ? (
            <div className="text-center">
              <h3 className="text-xl font-semibold mb-4">You're on the list!</h3>
              <p className="text-gray-600 mb-6">
                We'll notify you when Strumkey is ready. Thanks for your interest!
              </p>
              <button
                onClick={handleBack}
                className="btn btn-secondary"
              >
                Try Another Email
              </button>
            </div>
          ) : showWaitingList ? (
            <div>
              <p className="text-gray-700 mb-4">
                This email is not associated with an existing account. To create an account, you'll need an invite.
              </p>
              <p className="text-gray-600 mb-6">
                Would you like to join our waiting list? We'll notify you when Strumkey is ready.
              </p>
              <form onSubmit={handleWaitingListSubmit} className="space-y-4">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                  className="input"
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-primary w-full"
                >
                  {loading ? 'Joining...' : 'Join Waiting List'}
                </button>
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={loading}
                  className="btn btn-secondary w-full"
                >
                  Back
                </button>
              </form>
            </div>
          ) : !codeSent ? (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
                className="input"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary w-full"
              >
                {loading ? 'Checking...' : 'Send Verification Code'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleCodeSubmit} className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-2">
                  Code sent to: <strong>{email}</strong>
                </p>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Enter verification code"
                  required
                  className="input"
                  disabled={loading}
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-primary flex-1"
                >
                  {loading ? 'Verifying...' : 'Verify Code'}
                </button>
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={loading}
                  className="btn btn-secondary"
                >
                  Back
                </button>
              </div>
            </form>
          )}

          {message && (
            <p className={`mt-4 text-sm ${message.includes('Error') || message.includes('Invalid') ? 'text-red-600' : 'text-green-600'}`}>
              {message}
            </p>
          )}

          <div className="mt-6 text-center">
            <a
              href="/"
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              ← Back to home
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
