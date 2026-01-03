// Docs: https://www.instantdb.com/docs/modeling-data

import { i } from "@instantdb/react";

const _schema = i.schema({
  entities: {
    // InstantDB required entities
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
      imageURL: i.string().optional(),
      type: i.string().optional(),
    }),
    
    // Ukelio entities
    // Note: We use $users (InstantDB's built-in user entity) for authentication
    // This users entity is kept for backward compatibility but links have been removed
    users: i.entity({
      email: i.string().optional(),
      name: i.string().optional(),
      createdAt: i.number({ default: () => Date.now() }),
    }),

    groups: i.entity({
      name: i.string(),
      description: i.string({ optional: true }),
      createdBy: i.string(),
      createdAt: i.number({ default: () => Date.now() }),
    }),

    groupMembers: i.entity({
      groupId: i.string(),
      userId: i.string(),
      role: i.string({ default: 'member' }),
      status: i.string({ default: 'pending' }),
      joinedAt: i.number({ default: () => Date.now() }),
    }),

    songs: i.entity({
      title: i.string(),
      artist: i.string({ optional: true }),
      lyrics: i.string(),
      chords: i.string({ optional: true }), // JSON string: array of {lineIndex, position, chord}
      createdBy: i.string().indexed(),
      createdAt: i.number({ default: () => Date.now() }).indexed(),
      updatedAt: i.number({ default: () => Date.now() }),
    }),

    songShares: i.entity({
      songId: i.string(),
      groupId: i.string(),
      sharedBy: i.string(),
      sharedAt: i.number({ default: () => Date.now() }),
    }),

    songbooks: i.entity({
      title: i.string(),
      description: i.string({ optional: true }),
      type: i.string({ default: 'private' }),
      groupId: i.string({ optional: true }),
      createdBy: i.string(),
      createdAt: i.number({ default: () => Date.now() }),
      updatedAt: i.number({ default: () => Date.now() }),
    }),

    songbookSongs: i.entity({
      songbookId: i.string(),
      songId: i.string(),
      order: i.number(),
      addedAt: i.number({ default: () => Date.now() }),
    }),

    meetings: i.entity({
      groupId: i.string(),
      title: i.string(),
      description: i.string({ optional: true }),
      date: i.number(),
      time: i.string(),
      location: i.string({ optional: true }),
      createdBy: i.string(),
      songbookId: i.string({ optional: true }),
      createdAt: i.number({ default: () => Date.now() }),
    }),

    meetingSongs: i.entity({
      meetingId: i.string(),
      songId: i.string(),
      order: i.number(),
    }),

    meetingRSVPs: i.entity({
      meetingId: i.string(),
      userId: i.string(),
      response: i.string({ default: 'maybe' }),
      respondedAt: i.number({ default: () => Date.now() }),
    }),

    chords: i.entity({
      name: i.string().indexed(),
      frets: i.string(),
      instrument: i.string({ default: 'ukulele' }),
      tuning: i.string({ default: 'ukulele_standard' }),
      variation: i.string({ default: 'standard' }),
    }),
  },
  links: {
    // InstantDB required links
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
    
    // Ukelio links
    groupMembersToGroups: {
      forward: {
        on: 'groupMembers',
        has: 'many',
        label: 'group',
      },
      reverse: {
        on: 'groups',
        has: 'many',
        label: 'members',
      },
    },
    // Removed groupMembersToUsers and songsToUsers links - using $users instead
    songSharesToSongs: {
      forward: {
        on: 'songShares',
        has: 'many',
        label: 'song',
      },
      reverse: {
        on: 'songs',
        has: 'many',
        label: 'shares',
      },
    },
    songSharesToGroups: {
      forward: {
        on: 'songShares',
        has: 'many',
        label: 'group',
      },
      reverse: {
        on: 'groups',
        has: 'many',
        label: 'songShares',
      },
    },
    // Removed songbooksToUsers link - using $users instead
    songbooksToGroups: {
      forward: {
        on: 'songbooks',
        has: 'many',
        label: 'group',
      },
      reverse: {
        on: 'groups',
        has: 'many',
        label: 'songbooks',
      },
    },
    songbookSongsToSongbooks: {
      forward: {
        on: 'songbookSongs',
        has: 'many',
        label: 'songbook',
      },
      reverse: {
        on: 'songbooks',
        has: 'many',
        label: 'songbookSongs',
      },
    },
    songbookSongsToSongs: {
      forward: {
        on: 'songbookSongs',
        has: 'many',
        label: 'song',
      },
      reverse: {
        on: 'songs',
        has: 'many',
        label: 'songbookEntries',
      },
    },
    meetingsToGroups: {
      forward: {
        on: 'meetings',
        has: 'many',
        label: 'group',
      },
      reverse: {
        on: 'groups',
        has: 'many',
        label: 'meetings',
      },
    },
    // Removed meetingsToUsers link - using $users instead
    meetingsToSongbooks: {
      forward: {
        on: 'meetings',
        has: 'many',
        label: 'songbook',
      },
      reverse: {
        on: 'songbooks',
        has: 'many',
        label: 'meetings',
      },
    },
    meetingSongsToMeetings: {
      forward: {
        on: 'meetingSongs',
        has: 'many',
        label: 'meeting',
      },
      reverse: {
        on: 'meetings',
        has: 'many',
        label: 'songs',
      },
    },
    meetingSongsToSongs: {
      forward: {
        on: 'meetingSongs',
        has: 'many',
        label: 'song',
      },
      reverse: {
        on: 'songs',
        has: 'many',
        label: 'meetingEntries',
      },
    },
    meetingRSVPsToMeetings: {
      forward: {
        on: 'meetingRSVPs',
        has: 'many',
        label: 'meeting',
      },
      reverse: {
        on: 'meetings',
        has: 'many',
        label: 'rsvps',
      },
    },
    // Removed meetingRSVPsToUsers link - using $users instead
  },
  rooms: {},
});

// This helps Typescript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
