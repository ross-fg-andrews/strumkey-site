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

  // Always call the second hook unconditionally to maintain hook order
  // Safely extract groupIds with proper null checking - ensure it's always an array
  // Handle case where memberships or memberships.data might be undefined initially
  const groupMembers = (() => {
    try {
      if (!memberships || !memberships.data) {
        return [];
      }
      const gm = memberships.data.groupMembers;
      return Array.isArray(gm) ? gm : [];
    } catch (e) {
      console.error('Error extracting groupMembers:', e);
      return [];
    }
  })();
  
  // Safely extract groupIds - always ensure it's an array
  // groupMembers is now guaranteed to be an array (never undefined)
  // Use const with IIFE to ensure it's always initialized as an array
  const groupIds = (() => {
    try {
      // Extra defensive check - ensure groupMembers exists and is an array
      if (!groupMembers || !Array.isArray(groupMembers) || groupMembers.length === 0) {
        return [];
      }
      const ids = groupMembers.map(m => m?.groupId).filter(Boolean);
      // Final check - ensure result is an array
      return Array.isArray(ids) ? ids : [];
    } catch (e) {
      console.error('Error extracting groupIds:', e);
      return [];
    }
  })();
  
  // Verify groupIds is always an array (should never fail, but defensive)
  if (!Array.isArray(groupIds)) {
    console.error('groupIds is not an array:', groupIds);
    // This should never happen, but if it does, return empty array
    return { data: { songShares: [] }, error: membershipsError };
  }
  
  // Build the where clause safely - ensure groupIds is valid before using in query
  const whereClause = (() => {
    if (!userId) {
      return { songId: '' }; // Impossible condition
    }
    // Triple-check groupIds is a valid array with length
    // Use typeof and instanceof checks to be absolutely sure
    if (!groupIds || typeof groupIds !== 'object' || !Array.isArray(groupIds)) {
      return { songId: '' }; // Impossible condition
    }
    // Now safe to check length
    if (groupIds.length === 0) {
      return { songId: '' }; // Impossible condition
    }
    // Ensure all values in groupIds are valid
    const validGroupIds = groupIds.filter(id => id != null && id !== '');
    if (!Array.isArray(validGroupIds) || validGroupIds.length === 0) {
      return { songId: '' }; // Impossible condition
    }
    return { groupId: { $in: validGroupIds } };
  })();
  
  // Always call the query hook unconditionally to maintain hook order
  const { data: songSharesData, error: songSharesError } = db.useQuery({
    songShares: {
      $: {
        where: whereClause,
      },
      song: {},
    },
  });

  // Safe check - ensure we have valid groupIds (defensive check before accessing length)
  if (!userId || !groupIds || typeof groupIds !== 'object' || !Array.isArray(groupIds) || groupIds.length === 0) {
    return { data: { songShares: [] }, error: membershipsError || songSharesError };
  }

  // Ensure we always return a consistent structure with a valid array
  const songShares = (songSharesData?.songShares && Array.isArray(songSharesData.songShares))
    ? songSharesData.songShares
    : [];
  
  return { 
    data: { songShares }, 
    error: songSharesError || membershipsError 
  };
}

// Get all accessible songs (own + shared)
export function useAccessibleSongs(userId) {
  const mySongs = useMySongs(userId);
  const sharedSongs = useSharedSongs(userId);

  // Combine and deduplicate with safe array handling
  const mySongsArray = Array.isArray(mySongs.data?.songs) ? mySongs.data.songs : [];
  const sharedSongsArray = (() => {
    try {
      const songShares = sharedSongs.data?.songShares;
      if (!Array.isArray(songShares)) {
        return [];
      }
      return songShares.map(ss => ss?.song).filter(Boolean);
    } catch (e) {
      console.error('Error processing shared songs:', e);
      return [];
    }
  })();

  const allSongs = [...mySongsArray, ...sharedSongsArray];

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
  const groupMembers = membershipsData?.data?.groupMembers || [];
  const groupIds = Array.isArray(groupMembers)
    ? groupMembers.map(m => m?.groupId).filter(Boolean)
    : [];

  // Get group songbooks for groups user belongs to
  const { data: groupSongbooksData, error: groupError } = db.useQuery({
    songbooks: {
      $: {
        where: userId && Array.isArray(groupIds) && groupIds.length > 0
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

// Get personal library chords for a user
export function usePersonalChords(userId, instrument = 'ukulele', tuning = 'ukulele_standard') {
  // Always call hooks unconditionally to satisfy React's rules of hooks
  const { data, error } = db.useQuery({
    chords: {
      $: {
        where: userId
          ? {
              libraryType: 'personal',
              createdBy: userId,
              instrument,
              tuning,
            }
          : {
              // Impossible condition when no userId
              libraryType: 'personal',
              createdBy: '',
              instrument,
              tuning,
            },
        order: { name: 'asc' },
      },
    },
  });

  if (!userId) {
    return { data: { chords: [] }, error: null };
  }

  return { data, error };
}

// Get main library chords from database (user-contributed)
export function useMainLibraryChords(instrument = 'ukulele', tuning = 'ukulele_standard') {
  const { data, error } = db.useQuery({
    chords: {
      $: {
        where: {
          libraryType: 'main',
          instrument,
          tuning,
        },
        order: { name: 'asc' },
      },
    },
  });

  return { data, error };
}

// Get all database chords (main + personal) for a user
export function useAllDatabaseChords(userId, instrument = 'ukulele', tuning = 'ukulele_standard') {
  const mainChords = useMainLibraryChords(instrument, tuning);
  const personalChords = usePersonalChords(userId, instrument, tuning);

  const allChords = [
    ...(mainChords.data?.chords || []),
    ...(personalChords.data?.chords || []),
  ];

  // Sort by name
  const sortedChords = allChords.sort((a, b) => {
    return (a.name || '').localeCompare(b.name || '');
  });

  return {
    data: { chords: sortedChords },
    error: mainChords.error || personalChords.error,
  };
}

// Get a single song by ID
export function useSong(songId) {
  // Always call hooks unconditionally to satisfy React's rules of hooks
  const { data, error } = db.useQuery({
    songs: {
      $: {
        where: songId
          ? { id: songId }
          : { id: '' }, // Impossible condition when no songId
      },
    },
  });

  if (!songId) {
    return { data: { songs: [] }, error: null };
  }

  return { data, error };
}

// Check if a song is in any songbooks
export function useSongInSongbooks(songId) {
  // Always call hooks unconditionally to satisfy React's rules of hooks
  const { data, error } = db.useQuery({
    songbookSongs: {
      $: {
        where: songId
          ? { songId }
          : { songId: '' }, // Impossible condition when no songId
      },
      songbook: {},
    },
  });

  if (!songId) {
    return { data: { songbookSongs: [] }, error: null };
  }

  return { data, error };
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

// Get all waiting list entries (admin only - filter in component)
export function useWaitingList() {
  const { data, error } = db.useQuery({
    waitingList: {
      $: {
        order: { createdAt: 'desc' },
      },
    },
  });

  return { data, error };
}

// Get all invites (admin only - filter in component)
export function useInvites() {
  const { data, error } = db.useQuery({
    invites: {
      $: {
        order: { createdAt: 'desc' },
      },
    },
  });

  return { data, error };
}

// Get invite by token
export function useInviteByToken(token) {
  if (!token) {
    return { data: { invites: [] }, error: null };
  }

  const { data, error } = db.useQuery({
    invites: {
      $: {
        where: { token },
      },
    },
  });

  return { data, error };
}
