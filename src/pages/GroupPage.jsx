import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getChordNames, searchChordNames } from '../utils/chord-library';
import { formatChordNameForDisplay } from '../utils/chord-formatting';
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

// Helper function to extract unique chords from song chords data
function getUniqueChords(song) {
  try {
    if (!song.chords) return [];
    const chordsArray = JSON.parse(song.chords);
    const uniqueChords = [...new Set(chordsArray.map(c => c.chord))];
    return uniqueChords;
  } catch {
    return [];
  }
}

// Component to render chords as labels
function ChordLabels({ chords }) {
  if (chords.length === 0) {
    return <span className="text-gray-400">No chords</span>;
  }

  const displayChords = chords.slice(0, 3);
  const remainingCount = chords.length - 3;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {displayChords.map((chord, index) => (
        <span
          key={index}
          className="inline-block px-2 py-1 bg-primary-100 text-primary-700 rounded text-sm font-medium"
        >
          {formatChordNameForDisplay(chord)}
        </span>
      ))}
      {remainingCount > 0 && (
        <span className="text-gray-500 text-sm">
          and {remainingCount} more
        </span>
      )}
    </div>
  );
}

// Compact chord filter component
function ChordFilter({ selectedChords, onChordsChange }) {
  const [chordQuery, setChordQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const allChords = useMemo(() => getChordNames(), []);
  const filteredChords = useMemo(() => {
    if (!chordQuery) return allChords.slice(0, 15);
    return searchChordNames(chordQuery, 'ukulele', 'ukulele_standard', 15);
  }, [chordQuery, allChords]);

  const handleAddChord = (chord) => {
    if (!selectedChords.includes(chord)) {
      onChordsChange([...selectedChords, chord]);
    }
    setChordQuery('');
    setShowDropdown(false);
  };

  const handleRemoveChord = (chord) => {
    onChordsChange(selectedChords.filter(c => c !== chord));
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {selectedChords.length > 0 && (
        <>
          {selectedChords.map((chord) => (
            <span
              key={chord}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-600 text-white rounded text-xs font-medium"
            >
              {chord}
              <button
                type="button"
                onClick={() => handleRemoveChord(chord)}
                className="hover:text-primary-200 focus:outline-none text-sm leading-none"
                aria-label={`Remove ${chord}`}
              >
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => onChordsChange([])}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            Clear
          </button>
        </>
      )}
      <div className="relative flex-1 min-w-[200px]">
        <input
          type="text"
          value={chordQuery}
          onChange={(e) => {
            setChordQuery(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => {
            // Delay to allow click on dropdown item
            setTimeout(() => setShowDropdown(false), 200);
          }}
          placeholder={selectedChords.length === 0 ? "Filter by chords..." : "Add chord..."}
          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
        />
        {showDropdown && filteredChords.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
            {filteredChords
              .filter(chord => !selectedChords.includes(chord))
              .map((chord) => (
                <button
                  key={chord}
                  type="button"
                  onClick={() => handleAddChord(chord)}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 transition-colors"
                >
                  {chord}
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

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
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  
  // Get initial tab from URL query parameter, default to 'overview'
  const tabFromUrl = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(tabFromUrl || 'overview');
  
  // Update tab when URL parameter changes
  useEffect(() => {
    const tabFromUrl = searchParams.get('tab');
    if (tabFromUrl && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [searchParams, activeTab]);
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
  
  // Search, sort, and filter state for songs tab
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChords, setSelectedChords] = useState([]);
  const [sortField, setSortField] = useState('title'); // 'title', 'artist', 'createdAt'
  const [sortDirection, setSortDirection] = useState('asc'); // 'asc', 'desc'

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

  // Get song IDs from songShares for fallback query
  const songShares = songsData?.songShares || [];
  const songIds = songShares.map(ss => ss.songId).filter(Boolean);
  
  // Fallback query: get songs directly if relation isn't populated
  const { data: directSongsData } = db.useQuery({
    songs: {
      $: {
        where: songIds.length > 0 ? { id: { $in: songIds } } : { id: '' },
      },
    },
  });

  // Get songs from songShares, ensuring uniqueness and valid IDs
  // Use a Map to ensure uniqueness by song ID (in case of duplicates)
  const songsMap = new Map();
  
  // First, try to get songs from the relation
  songShares.forEach(ss => {
    if (ss.song && ss.song.id) {
      songsMap.set(ss.song.id, ss.song);
    }
  });
  
  // Also add songs from direct query (in case relation isn't populated)
  if (directSongsData?.songs) {
    directSongsData.songs.forEach(song => {
      if (song && song.id) {
        // Only add if not already in map (relation takes precedence)
        if (!songsMap.has(song.id)) {
          songsMap.set(song.id, song);
        }
      }
    });
  }
  
  const allSongs = Array.from(songsMap.values());
  
  // Filter and sort songs
  const filteredAndSortedSongs = useMemo(() => {
    let filtered = [...allSongs];

    // Filter by search query (title or artist)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(song => {
        const title = (song.title || '').toLowerCase();
        const artist = (song.artist || '').toLowerCase();
        return title.includes(query) || artist.includes(query);
      });
    }

    // Filter by chords - only show songs that use ONLY the selected chords
    if (selectedChords.length > 0) {
      filtered = filtered.filter(song => {
        const songChords = getUniqueChords(song);
        const selectedChordsSet = new Set(selectedChords);
        
        // Song must use only the selected chords (no other chords)
        // This means: every chord in the song must be in selectedChords
        // AND the song must have at least one chord
        if (songChords.length === 0) return false;
        
        // Check if all song chords are in the selected chords
        return songChords.every(chord => selectedChordsSet.has(chord));
      });
    }

    // Sort songs
    filtered.sort((a, b) => {
      let aValue, bValue;
      
      switch (sortField) {
        case 'title':
          aValue = (a.title || '').toLowerCase();
          bValue = (b.title || '').toLowerCase();
          break;
        case 'artist':
          aValue = (a.artist || '').toLowerCase();
          bValue = (b.artist || '').toLowerCase();
          break;
        case 'createdAt':
          aValue = a.createdAt || 0;
          bValue = b.createdAt || 0;
          break;
        default:
          aValue = (a.title || '').toLowerCase();
          bValue = (b.title || '').toLowerCase();
      }
      
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [allSongs, searchQuery, selectedChords, sortField, sortDirection]);
  
  // Debug logging (only when there's an issue)
  if (allSongs.length === 0 && songShares.length > 0) {
    console.log('GroupPage - songsData:', songsData);
    console.log('GroupPage - songShares:', songShares);
    console.log('GroupPage - songShares with songs:', songShares.map(ss => ({ songId: ss.songId, hasSong: !!ss.song, song: ss.song })));
    console.log('GroupPage - directSongsData:', directSongsData);
    console.log('GroupPage - final songs:', allSongs);
  }
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
  const groupSongs = allSongs;

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
              onClick={() => {
                setActiveTab(tab.id);
                // Update URL to reflect current tab
                const newSearchParams = new URLSearchParams(searchParams);
                if (tab.id === 'overview') {
                  newSearchParams.delete('tab');
                } else {
                  newSearchParams.set('tab', tab.id);
                }
                setSearchParams(newSearchParams, { replace: true });
              }}
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

          {/* Search field - above table */}
          {allSongs.length > 0 && (
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <input
                  id="search-songs"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by title or artist..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              {(searchQuery || selectedChords.length > 0) && (
                <div className="text-sm text-gray-600 whitespace-nowrap">
                  {filteredAndSortedSongs.length} of {allSongs.length} songs
                </div>
              )}
            </div>
          )}

          {/* Compact chord filter - above table */}
          {allSongs.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 whitespace-nowrap">Filter by chords:</span>
              <ChordFilter
                selectedChords={selectedChords}
                onChordsChange={setSelectedChords}
              />
              {selectedChords.length > 0 && (
                <span className="text-xs text-gray-500">
                  (only songs using exactly these chords)
                </span>
              )}
            </div>
          )}

          {allSongs.length === 0 ? (
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
          ) : filteredAndSortedSongs.length === 0 ? (
            <div className="card text-center py-12 text-gray-500">
              <p className="text-lg mb-2">No songs match your filters.</p>
              {(searchQuery || selectedChords.length > 0) && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedChords([]);
                  }}
                  className="text-primary-600 hover:underline"
                >
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <div className="card overflow-hidden p-0">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <button
                        onClick={() => {
                          if (sortField === 'title') {
                            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                          } else {
                            setSortField('title');
                            setSortDirection('asc');
                          }
                        }}
                        className="flex items-center gap-1 hover:text-gray-700"
                      >
                        Title
                        {sortField === 'title' && (
                          <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <button
                        onClick={() => {
                          if (sortField === 'artist') {
                            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                          } else {
                            setSortField('artist');
                            setSortDirection('asc');
                          }
                        }}
                        className="flex items-center gap-1 hover:text-gray-700"
                      >
                        Artist
                        {sortField === 'artist' && (
                          <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Chords
                    </th>
                    {isAdmin && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredAndSortedSongs.map((song) => {
                    const uniqueChords = getUniqueChords(song);
                    const share = songShares.find(ss => ss.song?.id === song.id);
                    return (
                      <tr
                        key={song.id}
                        onClick={(e) => {
                          // Don't navigate if clicking the remove button
                          if (e.target.closest('button')) return;
                          navigate(`/songs/${song.id}?group=${groupId}`);
                        }}
                        className="hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-gray-900 font-medium">
                            {song.title}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                          {song.artist || <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-6 py-4">
                          <ChordLabels chords={uniqueChords} />
                        </td>
                        {isAdmin && (
                          <td className="px-6 py-4 whitespace-nowrap">
                            {share && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveSong(share.id);
                                }}
                                disabled={removingShareId === share.id}
                                className="btn btn-secondary text-sm disabled:opacity-50"
                              >
                                {removingShareId === share.id ? 'Removing...' : 'Remove'}
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
