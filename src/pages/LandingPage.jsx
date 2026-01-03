import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function LandingPage() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const { sendMagicCode, verifyCode, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Redirect if already authenticated
  if (isAuthenticated) {
    navigate('/home');
    return null;
  }

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

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
          Ukelio
        </h1>
        <p className="text-xl text-gray-700 mb-8">
          Create, share, and manage songs for your ukulele group
        </p>

        <div className="bg-white rounded-lg shadow-xl p-8 mb-8">
          <h2 className="text-2xl font-semibold mb-6">Get Started</h2>
          
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

          {message && (
            <p className={`mt-4 ${message.includes('Error') || message.includes('Invalid') ? 'text-red-600' : 'text-green-600'}`}>
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

