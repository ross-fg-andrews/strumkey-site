import { db } from './schema';

// Get user's own songs
export function useMySongs(userId) {
  // Always call hooks unconditionally to satisfy React's rules of hooks
  // Use an impossible condition when userId is null
  const { data, error } = db.useQuery({
    songs: {
      $: {
        where: userId
          ? { createdBy: userId }
          : { createdBy: '' }, // Impossible condition when no userId
        order: { createdAt: 'desc' },
      },
    },
  });

  if (!userId) {
    return { data: { songs: [] }, error: null };
  }

  return { data, error };
}

// Get songs shared with user's groups
export function useSharedSongs(userId) {
  // Always call hooks unconditionally to satisfy React's rules of hooks
  // Use a query with an impossible condition when userId is null
  const { data: memberships, error: membershipsError } = db.useQuery({
    groupMembers: {
      $: {
        where: userId
          ? {
              userId: userId,
              status: 'approved',
            }
          : {
              // Impossible condition - userId cannot be empty string
              userId: '',
              status: 'approved',
            },
      },
      group: {},
    },
  });

  if (!userId) {
    // Still call second hook to maintain hook order
    const { data: songSharesData } = db.useQuery({
      songShares: {
        $: {
          where: {
            // Impossible condition
            songId: '',
          },
        },
      },
    });
    return { data: { songShares: [] }, error: null };
  }

  const groupIds = memberships?.groupMembers?.map(m => m.groupId).filter(Boolean) || [];

  // Always call the second hook
  const { data: songSharesData, error: songSharesError } = db.useQuery({
    songShares: {
      $: {
        where:
          groupIds.length > 0
            ? {
                groupId: { $in: groupIds },
              }
            : {
                // Impossible condition when no groups
                songId: '',
              },
      },
      song: {},
    },
  });

  if (groupIds.length === 0) {
    return { data: { songShares: [] }, error: membershipsError || songSharesError };
  }

  return { data: songSharesData, error: songSharesError || membershipsError };
}

// Get all accessible songs (own + shared)
export function useAccessibleSongs(userId) {
  const mySongs = useMySongs(userId);
  const sharedSongs = useSharedSongs(userId);

  // Combine and deduplicate
  const allSongs = [
    ...(mySongs.data?.songs || []),
    ...(sharedSongs.data?.songShares?.map(ss => ss.song).filter(Boolean) || []),
  ];

  const uniqueSongs = Array.from(
    new Map(allSongs.map(song => [song.id, song])).values()
  );

  return { data: { songs: uniqueSongs } };
}

// Get group's songs
export function useGroupSongs(groupId) {
  // Always call hooks unconditionally to satisfy React's rules of hooks
  // Use an impossible condition when groupId is null
  const { data, error } = db.useQuery({
    songShares: {
      $: {
        where: groupId
          ? { groupId: groupId }
          : { songId: '' }, // Impossible condition when no groupId
      },
      song: {},
    },
  });

  if (!groupId) {
    return { data: { songShares: [] }, error: null };
  }

  return { data, error };
}

// Get songbook with songs (filtered to only show songs user has access to)
export function useSongbook(songbookId, userId) {
  // Always call hooks unconditionally to satisfy React's rules of hooks
  // Use an impossible condition when songbookId is null
  const { data, error } = db.useQuery({
    songbooks: {
      $: {
        where: songbookId
          ? { id: songbookId }
          : { id: '' }, // Impossible condition when no songbookId
      },
      songbookSongs: {
        $: {
          order: { order: 'asc' },
        },
        song: {},
      },
    },
  });

  // Always call useAccessibleSongs to satisfy React's rules of hooks
  const accessibleSongs = useAccessibleSongs(userId || null);
  const accessibleSongIds = new Set(
    (accessibleSongs.data?.songs || []).map(s => s.id)
  );

  if (!songbookId) {
    return { data: { songbooks: [] }, error: null };
  }

  // Filter out songs user doesn't have access to
  if (data?.songbooks?.[0] && userId) {
    const songbook = data.songbooks[0];
    
    // Filter songbookSongs to only include accessible songs
    const filteredSongbookSongs = (songbook.songbookSongs || []).filter(
      ss => ss.song && accessibleSongIds.has(ss.song.id)
    );

    return {
      data: {
        songbooks: [{
          ...songbook,
          songbookSongs: filteredSongbookSongs,
        }],
      },
      error,
    };
  }

  return { data, error };
}

// Get user's songbooks (own + group songbooks for groups user belongs to)
export function useMySongbooks(userId) {
  // Get user's own songbooks
  const { data: ownSongbooks, error: ownError } = db.useQuery({
    songbooks: {
      $: {
        where: userId
          ? { createdBy: userId }
          : { createdBy: '' }, // Impossible condition when no userId
      },
    },
  });

  // Get user's group memberships
  const { data: membershipsData } = useMyGroups(userId);
  const groupIds = membershipsData?.groupMembers?.map(m => m.groupId).filter(Boolean) || [];

  // Get group songbooks for groups user belongs to
  const { data: groupSongbooksData, error: groupError } = db.useQuery({
    songbooks: {
      $: {
        where: userId && groupIds.length > 0
          ? {
              type: 'group',
              groupId: { $in: groupIds },
            }
          : { id: '' }, // Impossible condition when no groups
      },
    },
  });

  if (!userId) {
    return { data: { songbooks: [] }, error: null };
  }

  // Combine own and group songbooks
  const ownSongbooksList = ownSongbooks?.songbooks || [];
  const groupSongbooksList = groupSongbooksData?.songbooks || [];
  const allSongbooks = [...ownSongbooksList, ...groupSongbooksList];

  // Deduplicate and sort by createdAt (descending - newest first)
  const uniqueSongbooks = Array.from(
    new Map(allSongbooks.map(sb => [sb.id, sb])).values()
  ).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  return {
    data: { songbooks: uniqueSongbooks },
    error: ownError || groupError,
  };
}

// Get user's groups
export function useMyGroups(userId) {
  // Always call hooks unconditionally to satisfy React's rules of hooks
  // Use an impossible condition when userId is null
  const { data, error } = db.useQuery({
    groupMembers: {
      $: {
        where: userId
          ? {
              userId: userId,
              status: 'approved',
            }
          : {
              userId: '', // Impossible condition when no userId
              status: 'approved',
            },
      },
      group: {},
    },
  });

  if (!userId) {
    return { data: { groupMembers: [] }, error: null };
  }

  return { data, error };
}

// Get group meetings
export function useGroupMeetings(groupId) {
  const { data, error } = db.useQuery({
    meetings: {
      $: {
        where: { groupId: groupId },
      },
      songbook: {},
      rsvps: {},
    },
  });

  // Sort by date in JavaScript since date is not indexed
  if (data?.meetings) {
    return {
      data: {
        ...data,
        meetings: [...data.meetings].sort((a, b) => (a.date || 0) - (b.date || 0)),
      },
      error,
    };
  }

  return { data, error };
}

// Get meeting with details
export function useMeeting(meetingId) {
  return db.useQuery({
    meetings: {
      $: {
        where: { id: meetingId },
      },
      songbook: {
        songbookSongs: {
          $: {
            order: { order: 'asc' },
          },
          song: {},
        },
      },
      meetingSongs: {
        $: {
          order: { order: 'asc' },
        },
        song: {},
      },
      rsvps: {},
    },
  });
}

// Search chords
export function useChordSearch(query) {
  if (!query || query.length < 1) {
    return { data: { chords: [] } };
  }

  return db.useQuery({
    chords: {
      $: {
        where: {
          name: { $like: `%${query}%` },
        },
        limit: 20,
      },
    },
  });
}

// Get all chords (for autocomplete)
export function useAllChords() {
  const result = db.useQuery({
    chords: {},
  });
  
  // Sort in JavaScript since name field may not be indexed yet
  if (result.data?.chords) {
    return {
      ...result,
      data: {
        ...result.data,
        chords: [...result.data.chords].sort((a, b) => {
          return (a.name || '').localeCompare(b.name || '');
        }),
      },
    };
  }
  
  return result;
}

// Get a single song by ID
export function useSong(songId) {
  if (!songId) {
    return { data: { songs: [] }, error: null };
  }
  
  return db.useQuery({
    songs: {
      $: {
        where: { id: songId },
      },
    },
  });
}

// Check if a song is in any songbooks
export function useSongInSongbooks(songId) {
  if (!songId) {
    return { data: { songbookSongs: [] } };
  }
  
  return db.useQuery({
    songbookSongs: {
      $: {
        where: { songId },
      },
      songbook: {},
    },
  });
}

// Get songs available for a group songbook (only songs from that group's library)
export function useSongsForGroupSongbook(groupId, userId) {
  if (!groupId || !userId) {
    return { data: { songs: [] } };
  }

  // Get songs shared with this group
  const { data, error } = db.useQuery({
    songShares: {
      $: {
        where: { groupId },
      },
      song: {},
    },
  });

  const songs = (data?.songShares || [])
    .map(ss => ss.song)
    .filter(Boolean);

  return { data: { songs }, error };
}

// Get user's notifications
export function useNotifications(userId) {
  // Always call hooks unconditionally to satisfy React's rules of hooks
  const { data, error } = db.useQuery({
    notifications: {
      $: {
        where: userId
          ? { userId, read: false }
          : { userId: '' }, // Impossible condition when no userId
        order: { createdAt: 'desc' },
      },
    },
  });

  if (!userId) {
    return { data: { notifications: [] }, error: null };
  }

  return { data, error };
}

// Get a single group with members
export function useGroup(groupId) {
  if (!groupId) {
    return { data: { groups: [] }, error: null };
  }

  const { data, error } = db.useQuery({
    groups: {
      $: {
        where: { id: groupId },
      },
      members: {},
    },
  });

  // Sort members by joinedAt in JavaScript since it's not indexed
  if (data?.groups?.[0]?.members) {
    return {
      data: {
        ...data,
        groups: [{
          ...data.groups[0],
          members: [...data.groups[0].members].sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0)),
        }],
      },
      error,
    };
  }

  return { data, error };
}

// Get all members of a group (approved + pending) with user data
export function useGroupMembers(groupId) {
  if (!groupId) {
    return { data: { groupMembers: [] }, error: null };
  }

  const { data, error } = db.useQuery({
    groupMembers: {
      $: {
        where: { groupId },
      },
      user: {},
    },
  });

  // Sort by joinedAt in JavaScript since it's not indexed
  if (data?.groupMembers) {
    return {
      data: {
        ...data,
        groupMembers: [...data.groupMembers].sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0)),
      },
      error,
    };
  }

  return { data, error };
}

// Get pending membership requests for a group (admin only)
export function usePendingMemberships(groupId) {
  if (!groupId) {
    return { data: { groupMembers: [] }, error: null };
  }

  const { data, error } = db.useQuery({
    groupMembers: {
      $: {
        where: {
          groupId,
          status: 'pending',
        },
      },
      user: {},
    },
  });

  // Sort by joinedAt in JavaScript since it's not indexed
  if (data?.groupMembers) {
    return {
      data: {
        ...data,
        groupMembers: [...data.groupMembers].sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0)),
      },
      error,
    };
  }

  return { data, error };
}

// Get all songbooks for a group (group songbooks + shared songbooks)
export function useGroupSongbooks(groupId) {
  if (!groupId) {
    return { data: { songbooks: [] }, error: null };
  }

  // Get group songbooks (type='group', groupId matches)
  const { data: groupSongbooksData, error: groupError } = db.useQuery({
    songbooks: {
      $: {
        where: {
          type: 'group',
          groupId,
        },
      },
    },
  });

  // Sort by createdAt in JavaScript since it's not indexed
  if (groupSongbooksData?.songbooks) {
    return {
      data: {
        ...groupSongbooksData,
        songbooks: [...groupSongbooksData.songbooks].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
      },
      error: groupError,
    };
  }

  // Note: Shared songbooks are private songbooks that have been shared
  // We'll need to track this separately or check if all songs are shared
  // For now, we'll just return group songbooks
  // TODO: Add logic to detect shared songbooks

  return { data: groupSongbooksData, error: groupError };
}

// Get all groups for discovery (with member count)
export function useAllGroups() {
  const { data: groupsData, error: groupsError } = db.useQuery({
    groups: {
      $: {},
    },
  });

  // Query all approved group members to calculate counts
  const { data: membersData } = db.useQuery({
    groupMembers: {
      $: {
        where: { status: 'approved' },
      },
    },
  });

  // Calculate member count for each group
  const memberCountsByGroup = new Map();
  if (membersData?.groupMembers) {
    membersData.groupMembers.forEach(member => {
      const count = memberCountsByGroup.get(member.groupId) || 0;
      memberCountsByGroup.set(member.groupId, count + 1);
    });
  }

  // Add memberCount to each group and sort by createdAt
  if (groupsData?.groups) {
    const groupsWithCount = groupsData.groups
      .map(group => ({
        ...group,
        memberCount: memberCountsByGroup.get(group.id) || 0,
      }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return {
      data: { groups: groupsWithCount },
      error: groupsError,
    };
  }

  return { data: { groups: [] }, error: groupsError };
}

// Check user's membership status in a group
export function useUserMembershipStatus(groupId, userId) {
  if (!groupId || !userId) {
    return { data: { groupMembers: [] }, error: null };
  }

  return db.useQuery({
    groupMembers: {
      $: {
        where: {
          groupId,
          userId,
        },
      },
      group: {},
    },
  });
}

