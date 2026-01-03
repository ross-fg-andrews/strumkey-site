import { db } from './schema';

// Get user's own songs
export function useMySongs(userId) {
  if (!userId) {
    return { data: { songs: [] }, error: null };
  }
  
  return db.useQuery({
    songs: {
      $: {
        where: { createdBy: userId },
        order: { createdAt: 'desc' },
      },
    },
  });
}

// Get songs shared with user's groups
export function useSharedSongs(userId) {
  if (!userId) {
    return { data: { songShares: [] } };
  }
  
  // First get user's approved group memberships
  const { data: memberships } = db.useQuery({
    groupMembers: {
      $: {
        where: {
          userId: userId,
          status: 'approved',
        },
      },
      group: {},
    },
  });

  const groupIds = memberships?.groupMembers?.map(m => m.groupId) || [];

  if (groupIds.length === 0) {
    return { data: { songShares: [] } };
  }

  // Then get songs shared with those groups
  return db.useQuery({
    songShares: {
      $: {
        where: {
          groupId: { $in: groupIds },
        },
      },
      song: {},
    },
  });
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
  return db.useQuery({
    songShares: {
      $: {
        where: { groupId: groupId },
      },
      song: {},
    },
  });
}

// Get songbook with songs
export function useSongbook(songbookId) {
  return db.useQuery({
    songbooks: {
      $: {
        where: { id: songbookId },
      },
      songbookSongs: {
        $: {
          order: { order: 'asc' },
        },
        song: {},
      },
    },
  });
}

// Get user's groups
export function useMyGroups(userId) {
  if (!userId) {
    return { data: { groupMembers: [] } };
  }
  
  return db.useQuery({
    groupMembers: {
      $: {
        where: {
          userId: userId,
          status: 'approved',
        },
      },
      group: {},
    },
  });
}

// Get group meetings
export function useGroupMeetings(groupId) {
  return db.useQuery({
    meetings: {
      $: {
        where: { groupId: groupId },
        order: { date: 'asc' },
      },
      songbook: {},
      meetingRSVPs: {},
    },
  });
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
      meetingRSVPs: {},
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

