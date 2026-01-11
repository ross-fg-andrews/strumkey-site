import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../db/schema';
import { createInvite } from '../db/mutations';
import { useWaitingList, useInvites } from '../db/queries';

export default function AdminPanel() {
  const { user: authUser, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [inviteEmail, setInviteEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [copiedToken, setCopiedToken] = useState(null);

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

  const { data: waitingListData } = useWaitingList();
  const { data: invitesData } = useInvites();

  const waitingList = waitingListData?.waitingList || [];
  const invites = invitesData?.invites || [];

  // Redirect if not authenticated or not admin
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (!isSiteAdmin) {
      navigate('/home');
      return;
    }
  }, [isAuthenticated, isSiteAdmin, navigate]);

  if (!isAuthenticated || !isSiteAdmin) {
    return null;
  }

  const handleCreateInvite = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    if (!inviteEmail.trim()) {
      setMessage('Please enter an email address.');
      setLoading(false);
      return;
    }

    try {
      const { token } = await createInvite(inviteEmail.trim(), authUser.id);
      const inviteLink = `${window.location.origin}/?invite=${token}`;
      
      setMessage('Invite created successfully!');
      setInviteEmail('');
      
      // Copy to clipboard
      navigator.clipboard.writeText(inviteLink);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 3000);
    } catch (error) {
      console.error('Error creating invite:', error);
      setMessage('Error creating invite. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const copyInviteLink = (token) => {
    const inviteLink = `${window.location.origin}/?invite=${token}`;
    navigator.clipboard.writeText(inviteLink);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 3000);
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Admin Panel</h1>
      </div>

      {/* Create Invite Section */}
      <div className="card">
        <h2 className="text-2xl font-semibold mb-4">Create Invite</h2>
        <form onSubmit={handleCreateInvite} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="user@example.com"
              required
              className="input"
              disabled={loading}
            />
            <p className="text-sm text-gray-500 mt-1">
              Enter the email address for the person you want to invite
            </p>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
          >
            {loading ? 'Creating...' : 'Create Invite'}
          </button>
        </form>

        {message && (
          <p className={`mt-4 text-sm ${message.includes('Error') ? 'text-red-600' : 'text-green-600'}`}>
            {message}
          </p>
        )}
      </div>

      {/* Invites List */}
      <div className="card">
        <h2 className="text-2xl font-semibold mb-4">Invites ({invites.length})</h2>
        {invites.length === 0 ? (
          <p className="text-gray-500">No invites created yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Used By
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {invites.map((invite) => (
                  <tr key={invite.id}>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {invite.email}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(invite.createdAt)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {invite.usedAt ? (
                        <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
                          Used
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {invite.usedAt ? formatDate(invite.usedAt) : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <button
                        onClick={() => copyInviteLink(invite.token)}
                        className="text-primary-600 hover:text-primary-700"
                      >
                        {copiedToken === invite.token ? 'Copied!' : 'Copy Link'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Waiting List */}
      <div className="card">
        <h2 className="text-2xl font-semibold mb-4">Waiting List ({waitingList.length})</h2>
        {waitingList.length === 0 ? (
          <p className="text-gray-500">No one on the waiting list yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Joined
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Notified
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {waitingList.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {entry.email}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(entry.createdAt)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {entry.notified ? (
                        <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
                          Yes
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded">
                          No
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
