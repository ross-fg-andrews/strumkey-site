import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
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
