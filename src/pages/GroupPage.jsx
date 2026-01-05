import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  useGroup,
  useGroupSongs,
  useGroupMeetings,
  useGroupMembers,
  usePendingMemberships,
  useGroupSongbooks,
  useMyGroups,
  useMySongs,
  useAccessibleSongs,
} from '../db/queries';
import {
  shareSongWithGroup,
  removeSongFromGroup,
  updateGroup,
  approveMembership,
  declineMembership,
  deleteGroupMembership,
  createGroupSongbook,
  addPrivateSongToGroup,
  shareSongsWithGroups,
  addSongToSongbook,
} from '../db/mutations';
import { db } from '../db/schema';
import { id } from '@instantdb/react';

// Helper function to format user display name from profile data
// Uses firstName and lastName from user profile, falls back to email, then to "User {userId}"
function formatUserName(user, fallbackUserId, fallbackEmail = null) {
  if (!user) {
    return fallbackEmail || `User ${fallbackUserId}`;
  }
  
  // Use firstName and lastName from user profile (saved in profile page)
  if (user.firstName || user.lastName) {
    return `${user.firstName || ''} ${user.lastName || ''}`.trim();
  }
  
  // Fall back to email if available
  if (user.email) {
    return user.email;
  }
  
  // Use fallback email if provided (e.g., from auth context for current user)
  if (fallbackEmail) {
    return fallbackEmail;
  }
  
  // Last resort: show User {userId}
  return `User ${fallbackUserId}`;
}

export default function GroupPage() {
  const { id: groupId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [sharingSongId, setSharingSongId] = useState(null);
  const [removingShareId, setRemovingShareId] = useState(null);
  const [error, setError] = useState(null);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showCreateSongbookModal, setShowCreateSongbookModal] = useState(false);
  const [showAddSongsModal, setShowAddSongsModal] = useState(null); // songbookId
  const [newSongbookTitle, setNewSongbookTitle] = useState('');
  const [newSongbookDescription, setNewSongbookDescription] = useState('');
  const [creatingSongbook, setCreatingSongbook] = useState(false);
  const [leavingGroup, setLeavingGroup] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editingGroupName, setEditingGroupName] = useState('');
  const [editingGroupDescription, setEditingGroupDescription] = useState('');
  const [savingGroup, setSavingGroup] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState(null);
  const [selectedSongsForSongbook, setSelectedSongsForSongbook] = useState(new Set());

  // Queries
  const { data: groupData } = useGroup(groupId);
  const group = groupData?.groups?.[0];
  const { data: songsData } = useGroupSongs(groupId);
  const { data: meetingsData } = useGroupMeetings(groupId);
  const { data: membersData } = useGroupMembers(groupId);
  const { data: pendingData } = usePendingMemberships(groupId);
  const { data: songbooksData } = useGroupSongbooks(groupId);
  const { data: groupsData } = useMyGroups(user?.id);
  const { data: accessibleSongsData } = useAccessibleSongs(user?.id);
  const { data: mySongsData } = useMySongs(user?.id);

  const songs = songsData?.songShares?.map(ss => ss.song).filter(Boolean) || [];
  const songShares = songsData?.songShares || [];
  const meetings = meetingsData?.meetings || [];
  const members = membersData?.groupMembers?.filter(m => m.status === 'approved') || [];
  const pendingMembers = pendingData?.groupMembers || [];
  const songbooks = songbooksData?.songbooks || [];

  // Check if user is admin or member
  const userMembership = groupsData?.groupMembers?.find(
    gm => gm.groupId === groupId && gm.userId === user?.id && gm.status === 'approved'
  );
  const isAdmin = group && user?.id && (group.createdBy === user?.id || userMembership?.role === 'admin');
  const isMember = !!userMembership;

  // Get user's songs that aren't already shared with the group
  const groupSongIds = new Set(songShares.map(ss => ss.songId).filter(Boolean));
  const availableSongs = (accessibleSongsData?.songs || []).filter(
    song => !groupSongIds.has(song.id)
  );
  const myPrivateSongs = (mySongsData?.songs || []).filter(
    song => !groupSongIds.has(song.id)
  );
  const groupSongs = songs;

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'songs', label: 'Songs' },
    { id: 'songbooks', label: 'Songbooks' },
    { id: 'meetings', label: 'Meetings' },
    ...(isAdmin ? [{ id: 'settings', label: 'Settings' }] : []),
  ];

  if (!group) {
    return (
      <div className="max-w-6xl mx-auto">
        <p>Loading group...</p>
      </div>
    );
  }

  const memberCount = members.length;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold">{group.name}</h1>
              {isAdmin && (
                <span className="px-2 py-1 bg-primary-100 text-primary-700 rounded text-xs font-medium">
                  Admin
                </span>
              )}
              {isMember && !isAdmin && (
                <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                  Member
                </span>
              )}
            </div>
            {group.description && (
              <p className="text-gray-600 mb-2">{group.description}</p>
            )}
            <p className="text-sm text-gray-500">
              {memberCount} member{memberCount !== 1 ? 's' : ''}
            </p>
          </div>
          {isMember && (
            <div className="flex gap-2">
              {isAdmin && (
                <button
                  onClick={() => {
                    setShowSettings(true);
                    setEditingGroupName(group.name);
                    setEditingGroupDescription(group.description || '');
                  }}
                  className="btn btn-secondary"
                >
                  Settings
                </button>
              )}
              <button
                onClick={() => setShowLeaveConfirm(true)}
                className="btn btn-secondary"
              >
                Leave Group
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700 mb-4">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b mb-6">
        <div className="flex gap-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-2 px-4 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary-600 text-primary-600 font-semibold'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="card">
            <h2 className="font-semibold text-lg mb-2">About</h2>
            <p className="text-gray-600">{group.description || 'No description provided.'}</p>
          </div>

          <div className="card">
            <h2 className="font-semibold text-lg mb-4">Members</h2>
            {members.length === 0 ? (
              <p className="text-gray-500">No members yet.</p>
            ) : (
              <div className="space-y-2">
                {members.map((member) => {
                  const isMemberAdmin = group.createdBy === member.userId || member.role === 'admin';
                  // Use firstName and lastName from user profile (saved in profile page)
                  const memberUser = member.user;
                  const isCurrentUser = member.userId === user?.id;
                  const fallbackEmail = isCurrentUser ? user?.email : null;
                  const userName = formatUserName(memberUser, member.userId, fallbackEmail);
                  return (
                    <div key={member.id} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{userName}</span>
                        {isMemberAdmin && (
                          <span className="px-2 py-0.5 bg-primary-100 text-primary-700 rounded text-xs">
                            Admin
                          </span>
                        )}
                      </div>
                      {isAdmin && member.userId !== user?.id && (
                        <button
                          onClick={() => handleRemoveMember(member.id)}
                          disabled={removingMemberId === member.id}
                          className="btn btn-secondary text-sm disabled:opacity-50"
                        >
                          {removingMemberId === member.id ? 'Removing...' : 'Remove'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {isAdmin && pendingMembers.length > 0 && (
            <div className="card">
              <h2 className="font-semibold text-lg mb-4">
                Pending Join Requests ({pendingMembers.length})
              </h2>
              <div className="space-y-2">
                {pendingMembers.map((pending) => {
                  // Use firstName and lastName from user profile (saved in profile page)
                  const pendingUser = pending.user;
                  const userName = formatUserName(pendingUser, pending.userId);
                  return (
                    <div key={pending.id} className="flex items-center justify-between p-2 border rounded">
                      <span>{userName}</span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApproveMembership(pending.id)}
                          className="btn btn-primary text-sm"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleDeclineMembership(pending.id)}
                          className="btn btn-secondary text-sm"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'songs' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Group Song Library</h2>
            {isMember && (
              <button
                onClick={() => setShowShareDialog(true)}
                className="btn btn-primary"
              >
                Share Song with Group
              </button>
            )}
          </div>

          {songs.length === 0 ? (
            <div className="card text-center py-8 text-gray-500">
              <p>No songs shared with this group yet.</p>
              {isMember && (
                <button
                  onClick={() => setShowShareDialog(true)}
                  className="btn btn-primary mt-4"
                >
                  Share Your First Song
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {songs.map((song) => {
                const share = songShares.find(ss => ss.song?.id === song.id);
                return (
                  <div key={song.id} className="card flex items-center justify-between">
                    <div className="flex-1">
                      <a
                        href={`/songs/${song.id}`}
                        className="text-lg font-semibold hover:text-primary-600"
                      >
                        {song.title}
                      </a>
                      {song.artist && (
                        <p className="text-gray-600 text-sm">{song.artist}</p>
                      )}
                      {share && (
                        <p className="text-xs text-gray-500 mt-1">
                          Shared by User {share.sharedBy}
                        </p>
                      )}
                    </div>
                    {isAdmin && share && (
                      <button
                        onClick={() => handleRemoveSong(share.id)}
                        disabled={removingShareId === share.id}
                        className="btn btn-secondary text-sm ml-4 disabled:opacity-50"
                      >
                        {removingShareId === share.id ? 'Removing...' : 'Remove'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Share Song Dialog */}
          {showShareDialog && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
                <h3 className="text-xl font-semibold mb-4">Share Song with Group</h3>
                {availableSongs.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p>No songs available to share.</p>
                    <p className="text-sm mt-2">Create a song first, or all your songs are already shared.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {availableSongs.map((song) => (
                      <div
                        key={song.id}
                        className="flex items-center justify-between p-3 border rounded hover:bg-gray-50"
                      >
                        <div>
                          <div className="font-medium">{song.title}</div>
                          {song.artist && (
                            <div className="text-sm text-gray-600">{song.artist}</div>
                          )}
                        </div>
                        <button
                          onClick={() => handleShareSong(song.id)}
                          disabled={sharingSongId === song.id}
                          className="btn btn-primary text-sm disabled:opacity-50"
                        >
                          {sharingSongId === song.id ? 'Sharing...' : 'Share'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => {
                      setShowShareDialog(false);
                      setError(null);
                    }}
                    className="btn btn-secondary"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'songbooks' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Group Songbooks</h2>
            {isMember && (
              <button
                onClick={() => setShowCreateSongbookModal(true)}
                className="btn btn-primary"
              >
                Create Group Songbook
              </button>
            )}
          </div>

          {songbooks.length === 0 ? (
            <div className="card text-center py-8 text-gray-500">
              <p>No songbooks in this group yet.</p>
              {isMember && (
                <button
                  onClick={() => setShowCreateSongbookModal(true)}
                  className="btn btn-primary mt-4"
                >
                  Create Your First Songbook
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {songbooks.map((songbook) => (
                <div
                  key={songbook.id}
                  className="card hover:shadow-xl transition-shadow cursor-pointer"
                  onClick={() => navigate(`/songbooks/${songbook.id}`)}
                >
                  <h3 className="font-semibold text-lg mb-1">{songbook.title}</h3>
                  {songbook.description && (
                    <p className="text-gray-600 text-sm mb-2">{songbook.description}</p>
                  )}
                  <p className="text-xs text-gray-500">
                    Created by User {songbook.createdBy}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Create Songbook Modal */}
          {showCreateSongbookModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                <h3 className="text-xl font-semibold mb-4">Create Group Songbook</h3>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newSongbookTitle.trim()) {
                      setError('Please enter a songbook title.');
                      return;
                    }
                    setCreatingSongbook(true);
                    setError(null);
                    try {
                      const songbookId = await createGroupSongbook(
                        groupId,
                        newSongbookTitle.trim(),
                        newSongbookDescription.trim() || null,
                        user.id
                      );
                      setShowCreateSongbookModal(false);
                      setNewSongbookTitle('');
                      setNewSongbookDescription('');
                      setShowAddSongsModal(songbookId);
                    } catch (err) {
                      console.error('Error creating songbook:', err);
                      setError(err.message || 'Failed to create songbook.');
                    } finally {
                      setCreatingSongbook(false);
                    }
                  }}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium mb-2">Title *</label>
                    <input
                      type="text"
                      value={newSongbookTitle}
                      onChange={(e) => setNewSongbookTitle(e.target.value)}
                      required
                      className="input w-full"
                      placeholder="Songbook title"
                      disabled={creatingSongbook}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Description</label>
                    <textarea
                      value={newSongbookDescription}
                      onChange={(e) => setNewSongbookDescription(e.target.value)}
                      className="input w-full"
                      rows={3}
                      placeholder="Optional description"
                      disabled={creatingSongbook}
                    />
                  </div>
                  <div className="flex gap-3 justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateSongbookModal(false);
                        setNewSongbookTitle('');
                        setNewSongbookDescription('');
                        setError(null);
                      }}
                      disabled={creatingSongbook}
                      className="btn btn-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={creatingSongbook}
                      className="btn btn-primary"
                    >
                      {creatingSongbook ? 'Creating...' : 'Create'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Add Songs to Songbook Modal */}
          {showAddSongsModal && (
            <AddSongsToGroupSongbookModal
              songbookId={showAddSongsModal}
              groupId={groupId}
              groupSongs={groupSongs}
              myPrivateSongs={myPrivateSongs}
              onClose={() => {
                setShowAddSongsModal(null);
                setSelectedSongsForSongbook(new Set());
              }}
              onSuccess={() => {
                setShowAddSongsModal(null);
                setSelectedSongsForSongbook(new Set());
              }}
            />
          )}
        </div>
      )}

      {activeTab === 'meetings' && (
        <div className="space-y-4">
          {isAdmin && (
            <div className="flex justify-end mb-4">
              <button
                onClick={() => navigate(`/meetings/new?groupId=${groupId}`)}
                className="btn btn-primary"
              >
                Schedule Meeting
              </button>
            </div>
          )}
          {meetings.length === 0 ? (
            <div className="card text-center py-8 text-gray-500">
              <p>No meetings scheduled yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {meetings.map((meeting) => (
                <div key={meeting.id} className="card">
                  <a
                    href={`/meetings/${meeting.id}`}
                    className="text-lg font-semibold hover:text-primary-600"
                  >
                    {meeting.title}
                  </a>
                  <p className="text-gray-600 text-sm">
                    {new Date(meeting.date).toLocaleDateString()} at {meeting.time}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'settings' && isAdmin && (
        <div className="space-y-4">
          <div className="card">
            <h2 className="font-semibold text-lg mb-4">Edit Group</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setSavingGroup(true);
                setError(null);
                try {
                  await updateGroup(groupId, {
                    name: editingGroupName.trim(),
                    description: editingGroupDescription.trim() || null,
                  });
                  setShowSettings(false);
                } catch (err) {
                  console.error('Error updating group:', err);
                  setError(err.message || 'Failed to update group.');
                } finally {
                  setSavingGroup(false);
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium mb-2">Group Name *</label>
                <input
                  type="text"
                  value={editingGroupName}
                  onChange={(e) => setEditingGroupName(e.target.value)}
                  required
                  className="input w-full"
                  disabled={savingGroup}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <textarea
                  value={editingGroupDescription}
                  onChange={(e) => setEditingGroupDescription(e.target.value)}
                  className="input w-full"
                  rows={3}
                  disabled={savingGroup}
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={savingGroup}
                  className="btn btn-primary"
                >
                  {savingGroup ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSettings(false);
                    setEditingGroupName(group.name);
                    setEditingGroupDescription(group.description || '');
                  }}
                  disabled={savingGroup}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>

          <div className="card">
            <h2 className="font-semibold text-lg mb-4">Remove Songs from Group</h2>
            <p className="text-sm text-gray-600 mb-4">
              Songs can be removed from the group library using the Remove button in the Songs tab.
            </p>
          </div>
        </div>
      )}

      {/* Leave Group Confirmation */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">Leave Group</h2>
            <p className="text-gray-700 mb-6">
              Are you sure you want to leave "{group.name}"? You'll lose access to group songs and songbooks.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowLeaveConfirm(false)}
                disabled={leavingGroup}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleLeaveGroup}
                disabled={leavingGroup}
                className="btn btn-danger"
              >
                {leavingGroup ? 'Leaving...' : 'Leave Group'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  async function handleShareSong(songId) {
    if (!user?.id || !groupId) {
      setError('You must be logged in to share songs.');
      return;
    }

    setSharingSongId(songId);
    setError(null);

    try {
      await shareSongWithGroup({
        songId,
        groupId,
        sharedBy: user.id,
      });
      setShowShareDialog(false);
    } catch (err) {
      console.error('Error sharing song:', err);
      setError(err.message || 'Failed to share song. Please try again.');
    } finally {
      setSharingSongId(null);
    }
  }

  async function handleRemoveSong(shareId) {
    if (!isAdmin) {
      setError('Only group admins can remove songs.');
      return;
    }

    setRemovingShareId(shareId);
    setError(null);

    try {
      await removeSongFromGroup(shareId);
    } catch (err) {
      console.error('Error removing song:', err);
      setError(err.message || 'Failed to remove song. Please try again.');
    } finally {
      setRemovingShareId(null);
    }
  }

  async function handleApproveMembership(membershipId) {
    if (!isAdmin) {
      setError('Only group admins can approve memberships.');
      return;
    }

    try {
      await approveMembership(membershipId);
    } catch (err) {
      console.error('Error approving membership:', err);
      setError(err.message || 'Failed to approve membership. Please try again.');
    }
  }

  async function handleDeclineMembership(membershipId) {
    if (!isAdmin) {
      setError('Only group admins can decline memberships.');
      return;
    }

    try {
      await declineMembership(membershipId);
    } catch (err) {
      console.error('Error declining membership:', err);
      setError(err.message || 'Failed to decline membership. Please try again.');
    }
  }

  async function handleRemoveMember(membershipId) {
    if (!isAdmin) {
      setError('Only group admins can remove members.');
      return;
    }

    if (!confirm('Are you sure you want to remove this member from the group?')) {
      return;
    }

    setRemovingMemberId(membershipId);
    setError(null);

    try {
      await deleteGroupMembership(membershipId);
    } catch (err) {
      console.error('Error removing member:', err);
      setError(err.message || 'Failed to remove member. Please try again.');
    } finally {
      setRemovingMemberId(null);
    }
  }

  async function handleLeaveGroup() {
    if (!user?.id || !groupId) {
      setError('You must be logged in to leave a group.');
      return;
    }

    // Check if user is the only admin
    const adminMembers = members.filter(m => 
      group.createdBy === m.userId || m.role === 'admin'
    );
    if (isAdmin && adminMembers.length === 1) {
      setError('You are the only admin. Please promote another member to admin before leaving, or delete the group.');
      setShowLeaveConfirm(false);
      return;
    }

    setLeavingGroup(true);
    setError(null);

    try {
      const membership = userMembership;
      if (membership) {
        await deleteGroupMembership(membership.id);
      }
      setShowLeaveConfirm(false);
      navigate('/groups');
    } catch (err) {
      console.error('Error leaving group:', err);
      setError(err.message || 'Failed to leave group. Please try again.');
    } finally {
      setLeavingGroup(false);
    }
  }
}

// Component for adding songs to a group songbook
function AddSongsToGroupSongbookModal({ songbookId, groupId, groupSongs, myPrivateSongs, onClose, onSuccess }) {
  const { user } = useAuth();
  const [selectedSongs, setSelectedSongs] = useState(new Set());
  const [addingSongs, setAddingSongs] = useState(false);
  const [error, setError] = useState(null);
  
  // Get current songbook songs to determine order
  const { data: songbookSongsData } = db.useQuery({
    songbookSongs: {
      $: {
        where: { songbookId },
        order: { order: 'desc' },
      },
    },
  });
  
  const songbookSongs = songbookSongsData?.songbookSongs || [];
  const maxOrder = songbookSongs.length > 0 ? Math.max(...songbookSongs.map(ss => ss.order || 0)) : -1;

  const handleToggleSong = (songId, isPrivate) => {
    const newSelected = new Set(selectedSongs);
    if (newSelected.has(songId)) {
      newSelected.delete(songId);
    } else {
      newSelected.add(songId);
    }
    setSelectedSongs(newSelected);
  };

  const handleAddSongs = async () => {
    if (selectedSongs.size === 0) {
      setError('Please select at least one song.');
      return;
    }

    setAddingSongs(true);
    setError(null);

    try {
      // First, share any private songs with the group
      const privateSongIds = Array.from(selectedSongs).filter(songId =>
        myPrivateSongs.some(s => s.id === songId)
      );

      if (privateSongIds.length > 0) {
        for (const songId of privateSongIds) {
          await addPrivateSongToGroup(songId, groupId, user.id);
        }
      }

      let currentOrder = maxOrder + 1;

      // Add all selected songs to the songbook
      const transactions = [];
      for (const songId of selectedSongs) {
        transactions.push(
          db.tx.songbookSongs[id()].update({
            songbookId,
            songId,
            order: currentOrder++,
            addedAt: Date.now(),
          })
        );
      }

      await db.transact(...transactions);
      onSuccess();
    } catch (err) {
      console.error('Error adding songs to songbook:', err);
      setError(err.message || 'Failed to add songs. Please try again.');
    } finally {
      setAddingSongs(false);
    }
  };

  const hasPrivateSongsSelected = Array.from(selectedSongs).some(songId =>
    myPrivateSongs.some(s => s.id === songId)
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
        <h3 className="text-xl font-semibold mb-4">Add Songs to Songbook</h3>

        {hasPrivateSongsSelected && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-yellow-800 text-sm">
            <strong>Note:</strong> Adding private songs will share them with the group.
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Group Songs Section */}
        {groupSongs.length > 0 && (
          <div className="mb-6">
            <h4 className="font-semibold mb-2">Group Songs</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {groupSongs.map((song) => (
                <label
                  key={song.id}
                  className="flex items-center gap-2 p-2 border rounded hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedSongs.has(song.id)}
                    onChange={() => handleToggleSong(song.id, false)}
                    className="rounded"
                  />
                  <div className="flex-1">
                    <div className="font-medium">{song.title}</div>
                    {song.artist && (
                      <div className="text-sm text-gray-600">{song.artist}</div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* My Private Songs Section */}
        {myPrivateSongs.length > 0 && (
          <div className="mb-6">
            <h4 className="font-semibold mb-2">My Private Songs</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {myPrivateSongs.map((song) => (
                <label
                  key={song.id}
                  className="flex items-center gap-2 p-2 border rounded hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedSongs.has(song.id)}
                    onChange={() => handleToggleSong(song.id, true)}
                    className="rounded"
                  />
                  <div className="flex-1">
                    <div className="font-medium">{song.title}</div>
                    {song.artist && (
                      <div className="text-sm text-gray-600">{song.artist}</div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {groupSongs.length === 0 && myPrivateSongs.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p>No songs available to add.</p>
          </div>
        )}

        <div className="flex gap-3 justify-end mt-4">
          <button
            onClick={onClose}
            disabled={addingSongs}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          <button
            onClick={handleAddSongs}
            disabled={addingSongs || selectedSongs.size === 0}
            className="btn btn-primary"
          >
            {addingSongs ? 'Adding...' : `Add ${selectedSongs.size} Song${selectedSongs.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
