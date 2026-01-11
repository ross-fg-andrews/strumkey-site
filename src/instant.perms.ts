// Docs: https://www.instantdb.com/docs/permissions

import type { InstantRules } from "@instantdb/react";

const rules = {
  meetings: {
    allow: {
      view: "auth.id != null",
      create: "auth.id == data.group.createdBy",
      delete: "auth.id == data.group.createdBy",
      update: "auth.id == data.group.createdBy",
    },
  },
  songbookSongs: {
    allow: {
      view: "auth.id != null",
      create: "auth.id != null",
      delete: "auth.id != null",
      update: "auth.id != null",
    },
  },
  songbooks: {
    allow: {
      view: "auth.id != null && (auth.id == data.createdBy || data.type == 'group')",
      create: "auth.id != null",
      delete: "auth.id == data.createdBy",
      update: "auth.id == data.createdBy",
    },
  },
  meetingRSVPs: {
    allow: {
      view: "auth.id != null",
      create: "auth.id != null",
      delete: "auth.id == data.userId",
      update: "auth.id == data.userId",
    },
  },
  songs: {
    allow: {
      view: "auth.id != null",
      create: "auth.id != null",
      delete: "auth.id == data.createdBy",
      update: "auth.id == data.createdBy",
    },
  },
  chords: {
    allow: {
      view: "auth.id != null",
      create: "auth.id != null && data.libraryType == 'personal' && data.createdBy == auth.id",
      delete: "auth.id != null && data.libraryType == 'personal' && data.createdBy == auth.id",
      update: "auth.id != null && data.libraryType == 'personal' && data.createdBy == auth.id",
    },
  },
  groupMembers: {
    allow: {
      view: "auth.id != null && (auth.id == data.userId || auth.id == data.group.createdBy)",
      create: "auth.id != null",
      delete: "auth.id == data.group.createdBy || auth.id == data.userId",
      update: "auth.id == data.group.createdBy",
    },
  },
  songShares: {
    allow: {
      view: "auth.id != null",
      create: "auth.id != null",
      delete: "auth.id == data.sharedBy || auth.id == data.group.createdBy",
    },
  },
  groups: {
    allow: {
      view: "auth.id != null",
      create: "auth.id != null",
      delete: "auth.id == data.createdBy",
      update: "auth.id == data.createdBy",
    },
  },
  $users: {
    allow: {
      view: "auth.id != null",
      update: "auth.id == data.id",
    },
  },
  waitingList: {
    allow: {
      create: "true", // Anyone can join waiting list
      view: "auth.id != null", // Authenticated users can view (we'll filter by isSiteAdmin in app)
    },
  },
  invites: {
    allow: {
      create: "auth.id != null", // Authenticated users can create (we'll check isSiteAdmin in app)
      view: "true", // Anyone can view invites (needed for invite links to work, token in query filters results)
      update: "auth.id != null", // Authenticated users can update (we'll check isSiteAdmin in app)
    },
  },
} satisfies InstantRules;

export default rules;
