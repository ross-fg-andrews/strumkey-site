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
    }),
    chords: i.entity({
      frets: i.string(),
      instrument: i.string(),
      name: i.string().indexed(),
      tuning: i.string(),
      variation: i.string(),
      libraryType: i.string().optional(),
      createdBy: i.string().optional(),
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
    users: i.entity({
      createdAt: i.number(),
      email: i.string().optional(),
      name: i.string().optional(),
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
  },
  rooms: {},
});

// This helps Typescript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
