// Docs: https://www.instantdb.com/docs/modeling-data

import { i } from "@instantdb/react";

const _schema = i.schema({
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
      imageURL: i.string().optional(),
      type: i.string().optional(),
      firstName: i.string().optional(),
      lastName: i.string().optional(),
      isSiteAdmin: i.boolean().optional(),
      hasCompletedOnboarding: i.boolean().optional(),
      locationCity: i.string().optional(),
      locationCountry: i.string().optional(),
      locationLat: i.number().optional(),
      locationLng: i.number().optional(),
    }),
    chords: i.entity({
      name: i.string().indexed(),          // Display name: "C", "Cmaj7", "Bm7b5"
      key: i.string(),                     // Root note: "C", "D", "E", etc.
      suffix: i.string(),                 // Chord type: "major", "m7", "dim", "sus2"
      frets: i.json(),                     // Array: [0,0,0,3]
      fingers: i.json(),                   // Array: [0,0,0,3] - which fingers
      baseFret: i.number(),                // Number: 1, 5, 7 (where on neck)
      barres: i.json(),                    // Array: [3] or [] - frets to barre
      position: i.number(),                // Number: 1, 2, 3 (which voicing, 1 = most common)
      instrument: i.string(),              // "ukulele"
      tuning: i.string(),                  // "standard" (GCEA)
      libraryType: i.string().optional(),  // "main" or "personal"
      createdBy: i.string().optional(),    // userId for personal chords only
    }),
    groupMembers: i.entity({
      groupId: i.string(),
      joinedAt: i.number(),
      role: i.string(),
      status: i.string(),
      userId: i.string(),
    }),
    groups: i.entity({
      createdAt: i.number(),
      createdBy: i.string(),
      description: i.string().optional(),
      name: i.string(),
    }),
    meetingRSVPs: i.entity({
      meetingId: i.string(),
      respondedAt: i.number(),
      response: i.string(),
      userId: i.string(),
    }),
    meetings: i.entity({
      createdAt: i.number(),
      createdBy: i.string(),
      date: i.number(),
      description: i.string(),
      groupId: i.string(),
      location: i.string(),
      songbookId: i.string(),
      time: i.string(),
      title: i.string(),
    }),
    meetingSongs: i.entity({
      meetingId: i.string(),
      order: i.number(),
      songId: i.string(),
    }),
    notifications: i.entity({
      userId: i.string(),
      type: i.string(),
      message: i.string(),
      read: i.boolean(),
      createdAt: i.number(),
      songbookId: i.string().optional(),
      count: i.number().optional(),
    }),
    songbooks: i.entity({
      createdAt: i.number(),
      createdBy: i.string(),
      description: i.string().optional(),
      groupId: i.string(),
      title: i.string(),
      type: i.string(),
      updatedAt: i.number(),
    }),
    songbookSongs: i.entity({
      addedAt: i.number(),
      order: i.number().indexed(),
      songbookId: i.string(),
      songId: i.string(),
    }),
    songs: i.entity({
      artist: i.string(),
      chords: i.string(),
      createdAt: i.number().indexed(),
      createdBy: i.string().indexed(),
      lyrics: i.string(),
      parentSongId: i.string().optional(),
      title: i.string(),
      updatedAt: i.number(),
      embeddedChords: i.string().optional(),
    }),
    songShares: i.entity({
      groupId: i.string(),
      sharedAt: i.number(),
      sharedBy: i.string(),
      songId: i.string(),
    }),
    songPlays: i.entity({
      songId: i.string().indexed(),
      userId: i.string().indexed(),
      playedAt: i.number().indexed(),
    }),
    users: i.entity({
      createdAt: i.number(),
      email: i.string().optional(),
      name: i.string().optional(),
    }),
    waitingList: i.entity({
      email: i.string().unique().indexed(),
      createdAt: i.number().indexed(),
      notified: i.boolean(),
    }),
    invites: i.entity({
      token: i.string().unique().indexed(),
      email: i.string().indexed(),
      createdBy: i.string(),
      createdAt: i.number().indexed(),
      usedAt: i.number().optional(),
      usedBy: i.string().optional(),
    }),
  },
  links: {
    $usersLinkedPrimaryUser: {
      forward: {
        on: "$users",
        has: "one",
        label: "linkedPrimaryUser",
        onDelete: "cascade",
      },
      reverse: {
        on: "$users",
        has: "many",
        label: "linkedGuestUsers",
      },
    },
    groupMembersGroup: {
      forward: {
        on: "groupMembers",
        has: "many",
        label: "group",
      },
      reverse: {
        on: "groups",
        has: "many",
        label: "members",
      },
    },
    groupMembersUser: {
      forward: {
        on: "groupMembers",
        has: "many",
        label: "user",
      },
      reverse: {
        on: "$users",
        has: "many",
        label: "groupMemberships",
      },
    },
    meetingRSVPsMeeting: {
      forward: {
        on: "meetingRSVPs",
        has: "many",
        label: "meeting",
      },
      reverse: {
        on: "meetings",
        has: "many",
        label: "rsvps",
      },
    },
    meetingsGroup: {
      forward: {
        on: "meetings",
        has: "many",
        label: "group",
      },
      reverse: {
        on: "groups",
        has: "many",
        label: "meetings",
      },
    },
    meetingsSongbook: {
      forward: {
        on: "meetings",
        has: "many",
        label: "songbook",
      },
      reverse: {
        on: "songbooks",
        has: "many",
        label: "meetings",
      },
    },
    meetingSongsMeeting: {
      forward: {
        on: "meetingSongs",
        has: "many",
        label: "meeting",
      },
      reverse: {
        on: "meetings",
        has: "many",
        label: "songs",
      },
    },
    meetingSongsSong: {
      forward: {
        on: "meetingSongs",
        has: "many",
        label: "song",
      },
      reverse: {
        on: "songs",
        has: "many",
        label: "meetingEntries",
      },
    },
    songbooksGroup: {
      forward: {
        on: "songbooks",
        has: "many",
        label: "group",
      },
      reverse: {
        on: "groups",
        has: "many",
        label: "songbooks",
      },
    },
    songbookSongsSong: {
      forward: {
        on: "songbookSongs",
        has: "many",
        label: "song",
      },
      reverse: {
        on: "songs",
        has: "many",
        label: "songbookEntries",
      },
    },
    songbookSongsSongbook: {
      forward: {
        on: "songbookSongs",
        has: "many",
        label: "songbook",
      },
      reverse: {
        on: "songbooks",
        has: "many",
        label: "songbookSongs",
      },
    },
    songSharesGroup: {
      forward: {
        on: "songShares",
        has: "many",
        label: "group",
      },
      reverse: {
        on: "groups",
        has: "many",
        label: "songShares",
      },
    },
    songSharesSong: {
      forward: {
        on: "songShares",
        has: "many",
        label: "song",
      },
      reverse: {
        on: "songs",
        has: "many",
        label: "shares",
      },
    },
    songPlaysSong: {
      forward: {
        on: "songPlays",
        has: "many",
        label: "song",
      },
      reverse: {
        on: "songs",
        has: "many",
        label: "plays",
      },
    },
    songPlaysUser: {
      forward: {
        on: "songPlays",
        has: "many",
        label: "user",
      },
      reverse: {
        on: "$users",
        has: "many",
        label: "songPlays",
      },
    },
  },
  rooms: {},
});

// This helps Typescript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
