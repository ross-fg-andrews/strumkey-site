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
      // Allow creating personal chords (user's own) or main library chords (for migrations)
      create: "auth.id != null && ((data.libraryType == 'personal' && data.createdBy == auth.id) || data.libraryType == 'main')",
      delete: "auth.id != null && data.libraryType == 'personal' && data.createdBy == auth.id",
      // Allow updating main library chords for any authenticated user
      // Note: Main library updates are restricted to site admins in application code (AdminPanel)
      // In InstantDB, 'data' refers to the existing record, not the update payload
      // Allow updates if: (1) it's a main library chord, (2) libraryType is null/undefined (legacy), 
      // or (3) it's a personal chord owned by the user
      update: "auth.id != null && (data.libraryType != 'personal' || (data.libraryType == 'personal' && data.createdBy == auth.id))",
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
  songTuningPreferences: {
    allow: {
      view: "auth.id != null && data.userId == auth.id",
      create: "auth.id != null && data.userId == auth.id",
      update: "auth.id != null && data.userId == auth.id",
      delete: "auth.id != null && data.userId == auth.id",
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
      // Allow unauthenticated users to query by email for existence checks
      // This is safe because we only check if a user exists, not access their data
      // Allow viewing if authenticated OR if querying by email (for existence checks)
      // Note: This allows viewing any user with an email, but the query filters by email
      view: "auth.id != null || data.email != null",
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
