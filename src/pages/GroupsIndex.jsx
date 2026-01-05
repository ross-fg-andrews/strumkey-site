import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useMyGroups, useAllGroups } from '../db/queries';
import { createGroupWithAdmin, createGroupMembership } from '../db/mutations';
import { db } from '../db/schema';

export default function GroupsIndex() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const myGroupsQuery = useMyGroups(user?.id);
  const allGroupsQuery = useAllGroups();
  
  // Query all pending memberships for the current user (once, at top level)
  const { data: pendingMembershipsData } = db.useQuery({
    groupMembers: {
      $: {
        where: user?.id
          ? {
              userId: user.id,
              status: 'pending',
            }
          : {
              userId: '', // Impossible condition when no userId
              status: 'pending',
            },
      },
    },
  });
  
  const pendingMemberships = pendingMembershipsData?.groupMembers || [];
  const pendingGroupIds = useMemo(
    () => new Set(pendingMemberships.map(pm => pm.groupId)),
    [pendingMemberships]
  );

  if (myGroupsQuery.error) {
    console.error('useMyGroups error:', myGroupsQuery.error);
  }

  // Get group IDs where user is a member (from memberships query)
  const myMembershipGroupIds = new Set(
    myGroupsQuery.data?.groupMembers
      ?.map(gm => gm.groupId)
      .filter(Boolean) || []
  );
  
  // Get all groups from allGroupsQuery (these have memberCount calculated)
  const allGroups = allGroupsQuery.data?.groups || [];
  
  // Filter to get "My Groups" - groups user is a member of OR created
  // Use groups from allGroupsQuery so we get memberCount
  const myGroups = allGroups.filter(group => 
    group && group.id && (
      myMembershipGroupIds.has(group.id) || 
      group.createdBy === user?.id
    )
  );
  const myGroupIds = new Set(myGroups.map(g => g.id));

  // Filter and search groups - exclude groups user is already a member of or created
  const filteredGroups = allGroups
    .filter(group => group && group.id) // Ensure all groups have IDs
    .filter(group => !myGroupIds.has(group.id) && group.createdBy !== user?.id) // Exclude groups user is member of or created
    .filter(group => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const nameMatch = group.name?.toLowerCase().includes(query);
        const descMatch = group.description?.toLowerCase().includes(query);
        return nameMatch || descMatch;
      }
      return true;
    });

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    setError(null);

    if (!user?.id) {
      setError('You must be logged in to create a group.');
      return;
    }

    if (!groupName.trim()) {
      setError('Please enter a group name.');
      return;
    }

    setCreating(true);

    try {
      const { groupId } = await createGroupWithAdmin({
        name: groupName.trim(),
        description: groupDescription.trim() || null,
        createdBy: user.id,
      });

      setShowCreateModal(false);
      setGroupName('');
      setGroupDescription('');
      
      // Navigate to the new group
      navigate(`/groups/${groupId}`);
    } catch (err) {
      console.error('Error creating group:', err);
      setError(err.message || 'Failed to create group. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleRequestJoin = async (groupId) => {
    if (!user?.id) {
      setError('You must be logged in to join a group.');
      return;
    }

    try {
      await createGroupMembership({
        groupId,
        userId: user.id,
        role: 'member',
      });
      // Show success message
      setError(null);
    } catch (err) {
      console.error('Error requesting to join group:', err);
      setError(err.message || 'Failed to request to join group. Please try again.');
    }
  };

  const getMembershipStatus = (groupId) => {
    if (myGroupIds.has(groupId)) {
      const membership = myGroupsQuery.data?.groupMembers?.find(gm => gm.groupId === groupId);
      if (membership?.role === 'admin' || membership?.group?.createdBy === user?.id) {
        return 'admin';
      }
      return 'member';
    }

    // Check if there's a pending request using the data we queried upfront
    if (pendingGroupIds.has(groupId)) {
      return 'pending';
    }

    return 'none';
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Groups</h1>
        {user && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary"
          >
            + New Group
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700">
          {error}
        </div>
      )}

      {/* Search */}
      <div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search groups..."
          className="input w-full max-w-md"
        />
      </div>

      {/* My Groups Section */}
      {myGroups.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">My Groups</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {myGroups.map((group) => {
              const status = getMembershipStatus(group.id);
              return (
                <Link
                  key={group.id}
                  to={`/groups/${group.id}`}
                  className="card hover:shadow-xl transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg mb-1">{group.name}</h3>
                      {group.description && (
                        <p className="text-gray-600 text-sm mb-2">{group.description}</p>
                      )}
                      <p className="text-xs text-gray-500">
                        {group.memberCount || 0} member{(group.memberCount || 0) !== 1 ? 's' : ''}
                      </p>
                    </div>
                    {status === 'admin' && (
                      <span className="px-2 py-1 bg-primary-100 text-primary-700 rounded text-xs font-medium">
                        Admin
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* All Groups Section */}
      <div>
        <h2 className="text-xl font-semibold mb-4">
          {myGroups.length > 0 ? 'Discover Groups' : 'All Groups'}
        </h2>
        {filteredGroups.length === 0 ? (
          <div className="card text-center py-12 text-gray-500">
            <p className="text-lg mb-2">
              {searchQuery ? 'No groups match your search.' : 'No groups found.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredGroups.map((group) => {
              const status = getMembershipStatus(group.id);
              const isMyGroup = myGroupIds.has(group.id);

              return (
                <div
                  key={group.id}
                  className="card hover:shadow-xl transition-shadow"
                >
                  {isMyGroup ? (
                    <Link to={`/groups/${group.id}`} className="block">
                      <h3 className="font-semibold text-lg mb-1">{group.name}</h3>
                      {group.description && (
                        <p className="text-gray-600 text-sm mb-2">{group.description}</p>
                      )}
                      <p className="text-xs text-gray-500">
                        {group.memberCount || 0} member{(group.memberCount || 0) !== 1 ? 's' : ''}
                      </p>
                    </Link>
                  ) : (
                    <div>
                      <h3 className="font-semibold text-lg mb-1">{group.name}</h3>
                      {group.description && (
                        <p className="text-gray-600 text-sm mb-2">{group.description}</p>
                      )}
                      <p className="text-xs text-gray-500 mb-3">
                        {group.memberCount || 0} member{(group.memberCount || 0) !== 1 ? 's' : ''}
                      </p>
                      {status === 'pending' ? (
                        <div className="text-sm text-gray-500 italic">
                          Request Pending
                        </div>
                      ) : (
                        <button
                          onClick={() => handleRequestJoin(group.id)}
                          className="btn btn-primary text-sm w-full"
                        >
                          Request to Join
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Group Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">Create New Group</h2>
            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Group Name *</label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  required
                  className="input w-full"
                  placeholder="Enter group name"
                  disabled={creating}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <textarea
                  value={groupDescription}
                  onChange={(e) => setGroupDescription(e.target.value)}
                  className="input w-full"
                  rows={3}
                  placeholder="Optional description"
                  disabled={creating}
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setGroupName('');
                    setGroupDescription('');
                    setError(null);
                  }}
                  disabled={creating}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="btn btn-primary"
                >
                  {creating ? 'Creating...' : 'Create Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


