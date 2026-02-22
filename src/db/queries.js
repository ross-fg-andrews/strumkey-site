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

// Search chords by name (optional limit and instrument/tuning filter)
// Must always call db.useQuery (rules of hooks); use impossible condition when query is empty.
export function useChordSearch(query, options = {}) {
  const { limit = 20, instrument, tuning } = options;
  const hasQuery = query && query.trim().length > 0;

  const tuningFilter = tuning === 'ukulele_standard'
    ? { $in: ['ukulele_standard', 'standard'] }
    : tuning;

  const where = hasQuery
    ? { name: { $like: `%${query.trim()}%` } }
    : { name: '' };
  if (instrument != null) where.instrument = instrument;
  if (tuning != null) where.tuning = tuningFilter;

  const result = db.useQuery({
    chords: {
      $: {
        where,
        limit: Math.min(Math.max(limit, 1), 100),
        order: { name: 'asc' },
      },
    },
  });

  if (!hasQuery) {
    return { data: { chords: [] }, error: result.error };
  }
  return result;
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
  // Handle both 'standard' and 'ukulele_standard' for backward compatibility
  const tuningFilter = tuning === 'ukulele_standard' 
    ? { $in: ['ukulele_standard', 'standard'] }
    : tuning;
    
  const { data, error } = db.useQuery({
    chords: {
      $: {
        where: userId
          ? {
              libraryType: 'personal',
              createdBy: userId,
              instrument,
              tuning: tuningFilter,
            }
          : {
              // Impossible condition when no userId
              libraryType: 'personal',
              createdBy: '',
              instrument,
              tuning: tuningFilter,
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
  // Handle both 'standard' and 'ukulele_standard' for backward compatibility
  // During migration, some chords may have 'standard' instead of 'ukulele_standard'
  const { data, error } = db.useQuery({
    chords: {
      $: {
        where: {
          libraryType: 'main',
          instrument,
          // Accept both tuning values during migration period
          tuning: tuning === 'ukulele_standard' 
            ? { $in: ['ukulele_standard', 'standard'] }
            : tuning,
        },
        order: { name: 'asc' },
      },
    },
  });

  return { data, error };
}

// Get common chords only (position 1, main library, major/minor/7) for fast modal initial load
export function useCommonChords(instrument = 'ukulele', tuning = 'ukulele_standard') {
  const tuningFilter = tuning === 'ukulele_standard'
    ? { $in: ['ukulele_standard', 'standard'] }
    : tuning;

  const { data, error } = db.useQuery({
    chords: {
      $: {
        where: {
          libraryType: 'main',
          instrument,
          tuning: tuningFilter,
          position: 1,
          suffix: { $in: ['', 'major', 'm', 'minor', '7'] },
        },
        order: { name: 'asc' },
      },
    },
  });

  return { data, error };
}

// Get chords by name list (for "used in song" expansion without loading full library)
export function useChordsByNames(names, instrument = 'ukulele', tuning = 'ukulele_standard') {
  const tuningFilter = tuning === 'ukulele_standard'
    ? { $in: ['ukulele_standard', 'standard'] }
    : tuning;

  const cappedNames = Array.isArray(names) ? names.slice(0, 100) : [];
  const hasNames = cappedNames.length > 0;

  const { data, error } = db.useQuery({
    chords: {
      $: {
        where: hasNames
          ? {
              name: { $in: cappedNames },
              instrument,
              tuning: tuningFilter,
            }
          : { name: '' },
        order: { name: 'asc' },
        limit: 200,
      },
    },
  });

  if (!hasNames) {
    return { data: { chords: [] }, error: null };
  }

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

// Get user's tuning preference for a song
export function useSongTuningPreference(userId, songId) {
  const { data, error } = db.useQuery({
    songTuningPreferences: {
      $: {
        where: userId && songId
          ? { userId, songId }
          : { userId: '', songId: '' },
      },
    },
  });

  if (!userId || !songId) {
    return { data: { preference: null }, error: null };
  }

  const prefs = data?.songTuningPreferences || [];
  const preference = prefs.length > 0 ? prefs[0] : null;
  return { data: { preference }, error };
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

// Get user by email (for checking if account exists)
export function useUserByEmail(email) {
  // Always call hooks unconditionally to satisfy React's rules of hooks
  // Use an impossible condition when email is null/empty
  const normalizedEmail = email ? email.trim().toLowerCase() : '';
  const { data, error } = db.useQuery({
    $users: {
      $: {
        where: normalizedEmail
          ? { email: normalizedEmail }
          : { email: '' }, // Impossible condition when no email
      },
    },
  });

  // Log errors for debugging
  if (error && email) {
    console.error('useUserByEmail error:', error);
  }

  if (!email) {
    return { data: { $users: [] }, error: null };
  }

  return { data, error };
}

// Get recently played songs for a user
// Returns the 15 most recently played songs, deduplicated by song ID
// (each song appears once at its most recent play position)
export function useRecentlyPlayedSongs(userId) {
  // Always call hooks unconditionally to satisfy React's rules of hooks
  // Use an impossible condition when userId is null
  const { data, error } = db.useQuery({
    songPlays: {
      $: {
        where: userId
          ? { userId }
          : { userId: '' }, // Impossible condition when no userId
        order: { playedAt: 'desc' },
      },
      song: {},
    },
  });

  if (!userId) {
    return { data: { songs: [] }, error: null };
  }

  // Get song IDs from songPlays for fallback query
  const songPlays = data?.songPlays || [];
  const songIds = songPlays.map(play => play.songId).filter(Boolean);

  // Fallback query: get songs directly if relation isn't populated
  const { data: directSongsData } = db.useQuery({
    songs: {
      $: {
        where: songIds.length > 0 ? { id: { $in: songIds } } : { id: '' },
      },
    },
  });

  // Build a map of song IDs to songs for easy lookup
  const songsMap = new Map();

  // First, try to get songs from the relation
  for (const play of songPlays) {
    // Handle both single song object and array of songs (depending on relation type)
    let song = null;
    if (play.song) {
      // If song is an array, take the first one
      song = Array.isArray(play.song) ? play.song[0] : play.song;
    }
    
    if (song && song.id && play.songId) {
      songsMap.set(play.songId, song);
    }
  }

  // Also add songs from direct query (in case relation isn't populated)
  if (directSongsData?.songs) {
    for (const song of directSongsData.songs) {
      if (song && song.id && !songsMap.has(song.id)) {
        songsMap.set(song.id, song);
      }
    }
  }

  // Convert map to array, maintaining order from songPlays (most recent first)
  const seenSongIds = new Set();
  const uniqueSongs = [];
  
  for (const play of songPlays) {
    if (play.songId && songsMap.has(play.songId) && !seenSongIds.has(play.songId)) {
      const song = songsMap.get(play.songId);
      if (song && song.id) {
        seenSongIds.add(play.songId);
        uniqueSongs.push(song);
        // Stop once we have 15 unique songs
        if (uniqueSongs.length >= 15) {
          break;
        }
      }
    }
  }

  return {
    data: { songs: uniqueSongs },
    error,
  };
}

// Get chord voicings for a specific key + suffix from main library
export function useChordVoicings(key, suffix, instrument = 'ukulele', tuning = 'ukulele_standard') {
  // Always call hooks unconditionally to satisfy React's rules of hooks
  // Only query if we have both key and suffix (suffix can be empty string for major chords)
  const hasValidParams = key && key.trim() !== '' && suffix !== undefined && suffix !== null;
  
  // Build where clause - query all chords for the key, filter suffix in JavaScript
  let whereClause;
  
  if (!hasValidParams) {
    // Use an impossible condition - query for a key that will never exist
    // Use "ZZ" which is not a valid musical key (keys are A-G with optional #/b)
    whereClause = { 
      key: 'ZZ',
      instrument: 'ukulele',
      libraryType: 'main'
    };
  } else {
    whereClause = {
      key: key.trim(),
      instrument,
      tuning: tuning === 'ukulele_standard' 
        ? { $in: ['ukulele_standard', 'standard'] }
        : tuning,
      libraryType: 'main',
    };
    // Don't filter by suffix in query - we'll filter in JavaScript to handle empty/major
  }
  
  const { data, error } = db.useQuery({
    chords: {
      $: {
        where: whereClause,
        order: { position: 'asc' },
      },
    },
  });

  if (!hasValidParams) {
    return { data: { chords: [] }, error: null };
  }

  // Filter by suffix in JavaScript to handle empty string and 'major' equivalence
  const chords = data?.chords || [];
  const filteredChords = chords.filter(chord => {
    const chordSuffix = chord.suffix || '';
    // Normalize: treat empty string and 'major' as the same
    const normalizedChordSuffix = chordSuffix === 'major' ? '' : chordSuffix;
    const normalizedQuerySuffix = suffix === 'major' ? '' : (suffix || '');
    return normalizedChordSuffix === normalizedQuerySuffix;
  });

  return { 
    data: { chords: filteredChords }, 
    error 
  };
}

// Get unique suffixes for a given key from main library
export function useUniqueSuffixes(key, instrument = 'ukulele', tuning = 'ukulele_standard') {
  // Always call hooks unconditionally to satisfy React's rules of hooks
  const hasValidKey = key && key.trim() !== '';
  
  const { data, error } = db.useQuery({
    chords: {
      $: {
        where: hasValidKey
          ? {
              key: key.trim(),
              instrument,
              tuning: tuning === 'ukulele_standard' 
                ? { $in: ['ukulele_standard', 'standard'] }
                : tuning,
              libraryType: 'main',
            }
          : { 
              key: 'ZZ',
              instrument: 'ukulele',
              libraryType: 'main'
            }, // Impossible condition when no key (ZZ is not a valid musical key)
      },
    },
  });

  if (!hasValidKey) {
    return { data: { suffixes: [] }, error: null };
  }

  // Extract unique suffixes from chords
  const chords = data?.chords || [];
  const suffixSet = new Set();
  chords.forEach(chord => {
    // Normalize: treat empty string and 'major' as the same
    const suffix = chord.suffix || '';
    if (suffix === 'major') {
      suffixSet.add(''); // Use empty string for major chords
    } else if (suffix) {
      suffixSet.add(suffix);
    } else {
      suffixSet.add(''); // Empty suffix
    }
  });

  // Convert to sorted array
  const suffixes = Array.from(suffixSet).sort((a, b) => {
    // Sort empty/major first, then alphabetically
    if (!a || a === '') return -1;
    if (!b || b === '') return 1;
    return a.localeCompare(b);
  });

  return { data: { suffixes }, error };
}
