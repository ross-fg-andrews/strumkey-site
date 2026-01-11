import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { addToWaitingList, useInvite as markInviteUsed } from '../db/mutations';
import { useInviteByToken } from '../db/queries';

export default function LandingPage() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [waitingListSuccess, setWaitingListSuccess] = useState(false);
  const [searchParams] = useSearchParams();
  const { sendMagicCode, verifyCode, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  const inviteToken = searchParams.get('invite');
  const { data: inviteData } = useInviteByToken(inviteToken || '');
  const invite = inviteData?.invites?.[0];

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/home');
    }
  }, [isAuthenticated, navigate]);

  // Validate invite email matches entered email
  useEffect(() => {
    if (invite && email && email.toLowerCase() !== invite.email.toLowerCase()) {
      setMessage(`This invite is for ${invite.email}. Please use that email address.`);
    } else if (invite && email && email.toLowerCase() === invite.email.toLowerCase()) {
      setMessage('');
    }
  }, [invite, email]);

  // Check if invite is already used or invalid
  useEffect(() => {
    if (inviteToken && !invite) {
      setMessage('Invalid invite link.');
    } else if (invite && invite.usedAt) {
      setMessage('This invite has already been used.');
    }
  }, [invite, inviteToken]);

  // Mark invite as used when user becomes available after sign-up
  useEffect(() => {
    if (invite && user?.id && !invite.usedAt) {
      markInviteUsed(invite.id, user.id).catch(error => {
        console.error('Error marking invite as used:', error);
      });
    }
  }, [invite, user]);

  // Prefill email when invite is loaded
  useEffect(() => {
    if (invite && invite.email && !email) {
      setEmail(invite.email);
    }
  }, [invite, email]);

  if (isAuthenticated) {
    return null;
  }

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

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    // Validate invite email if invite exists
    if (invite) {
      if (email.toLowerCase() !== invite.email.toLowerCase()) {
        setMessage(`This invite is for ${invite.email}. Please use that email address.`);
        setLoading(false);
        return;
      }
      if (invite.usedAt) {
        setMessage('This invite has already been used.');
        setLoading(false);
        return;
      }
    }

    const result = await sendMagicCode(email);
    
    if (result.success) {
      setMessage('Check your email for the verification code!');
      setCodeSent(true);
    } else {
      setMessage('Error sending verification code. Please try again.');
    }
    
    setLoading(false);
  };

  const handleCodeSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    const result = await verifyCode(email, code);
    
    if (result.success) {
      // Auth state will update automatically, redirect handled by isAuthenticated check
      // Invite will be marked as used by the useEffect below when user becomes available
      navigate('/home');
    } else {
      setMessage('Invalid code. Please try again.');
    }
    
    setLoading(false);
  };

  const handleBack = () => {
    setCodeSent(false);
    setCode('');
    setMessage('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center px-4">
      <div className="max-w-2xl w-full text-center">
        <h1 className="text-5xl font-bold text-primary-900 mb-4">
          Strumkey
        </h1>
        <p className="text-xl text-gray-700 mb-8">
          Create, share, and manage songs for your ukulele group
        </p>

        <div className="bg-white rounded-lg shadow-xl p-8 mb-8">
          {inviteToken && !invite ? (
            // Invalid invite
            <div className="text-center">
              <h2 className="text-2xl font-semibold mb-4">Invalid Invite Link</h2>
              <p className="text-gray-600 mb-6">
                This invite link is not valid or has expired.
              </p>
              <div className="space-y-2">
                <Link to="/" className="btn btn-primary inline-block">
                  Go to Home
                </Link>
                <p className="text-sm text-gray-600">
                  or{' '}
                  <Link to="/login" className="text-primary-600 hover:text-primary-700 font-medium">
                    log in
                  </Link>
                  {' '}if you already have an account
                </p>
              </div>
            </div>
          ) : invite && invite.usedAt ? (
            // Used invite
            <div className="text-center">
              <h2 className="text-2xl font-semibold mb-4">Invite Already Used</h2>
              <p className="text-gray-600 mb-6">
                This invite has already been used. If you have an account, please log in.
              </p>
              <div className="space-y-2">
                <Link to="/login" className="btn btn-primary inline-block">
                  Log In
                </Link>
                <p className="text-sm text-gray-600">
                  or{' '}
                  <Link to="/" className="text-primary-600 hover:text-primary-700 font-medium">
                    join the waiting list
                  </Link>
                </p>
              </div>
            </div>
          ) : invite ? (
            // Valid invite sign-up flow
            <>
              <h2 className="text-2xl font-semibold mb-2">You've been invited!</h2>
              <p className="text-gray-600 mb-6">
                Sign up with your email to get started.
              </p>
              
              {!codeSent ? (
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
                    {loading ? 'Sending...' : 'Send Verification Code'}
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
            </>
          ) : waitingListSuccess ? (
            // Waiting list success message
            <div className="text-center">
              <h2 className="text-2xl font-semibold mb-4">You're on the list!</h2>
              <p className="text-gray-600 mb-6">
                We'll notify you when Strumkey is ready. Thanks for your interest!
              </p>
            </div>
          ) : !codeSent ? (
            // Waiting list form
            <>
              <h2 className="text-2xl font-semibold mb-2">Join the Waiting List</h2>
              <p className="text-gray-600 mb-6">
                Strumkey is currently in private beta. Join our waiting list to be notified when we launch!
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
              </form>
              <div className="mt-4 text-center">
                <p className="text-sm text-gray-600">
                  Already have an account?{' '}
                  <Link to="/login" className="text-primary-600 hover:text-primary-700 font-medium">
                    Log in
                  </Link>
                </p>
              </div>
            </>
          ) : (
            // Code verification (shouldn't happen without invite, but handle it)
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
            <p className={`mt-4 text-sm ${message.includes('Error') || message.includes('Invalid') || message.includes('already') ? 'text-red-600' : 'text-green-600'}`}>
              {message}
            </p>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-6 text-left">
          <div className="bg-white rounded-lg p-6 shadow-md">
            <h3 className="font-semibold text-lg mb-2">Create Songs</h3>
            <p className="text-gray-600">
              Build song sheets with chords and lyrics for your group
            </p>
          </div>
          <div className="bg-white rounded-lg p-6 shadow-md">
            <h3 className="font-semibold text-lg mb-2">Organize Songbooks</h3>
            <p className="text-gray-600">
              Compile songs into songbooks for easy access
            </p>
          </div>
          <div className="bg-white rounded-lg p-6 shadow-md">
            <h3 className="font-semibold text-lg mb-2">Schedule Meetings</h3>
            <p className="text-gray-600">
              Plan group meetings with songs and track RSVPs
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

