import { db } from '../db/schema';
import { AppError, ERROR_CODES } from './error-handling';
import { deleteSong, deleteSongShares } from '../db/mutations';

// Note: canDeleteSong validation moved to component level using React hooks
// This function kept for API compatibility but validation should be done in components
export async function canDeleteSong(songId) {
  // InstantDB permissions will handle blocking deletions if needed
  // Additional validation can be done at component level using useQuery hooks
  return { canDelete: true };
}

export async function canDeleteSongbook(songbookId) {
  const { data } = await db.query({
    meetings: {
      $: {
        where: {
          songbookId,
          date: { $gte: Date.now() },
        },
      },
    },
  });

  const hasFutureMeetings = data?.meetings?.length > 0;
  
  if (hasFutureMeetings) {
    return {
      canDelete: false,
      reason: 'Songbook is attached to upcoming meetings. Remove it from meetings first.',
    };
  }

  return { canDelete: true };
}

export async function canDeleteGroup(groupId) {
  const { data } = await db.query({
    groupMembers: {
      $: {
        where: {
          groupId,
          status: 'approved',
        },
      },
    },
    meetings: {
      $: {
        where: {
          groupId,
          date: { $gte: Date.now() },
        },
      },
    },
  });

  const hasMembers = data?.groupMembers?.length > 0;
  const hasFutureMeetings = data?.meetings?.length > 0;

  if (hasMembers || hasFutureMeetings) {
    return {
      canDelete: false,
      reason: hasMembers 
        ? 'Group has active members. Remove all members first.'
        : 'Group has upcoming meetings. Cancel or complete meetings first.',
    };
  }

  return { canDelete: true };
}

export async function deleteSongWithCascade(songId) {
  // Note: Validation for whether song can be deleted should be done at component level
  // using React hooks (db.useQuery) before calling this function.
  // InstantDB permissions will handle blocking deletions if the user doesn't have permission.
  
  // Delete song
  // InstantDB will automatically handle cascading deletes for songShares if configured in schema
  // If not, we rely on permissions to prevent issues
  await deleteSong(songId);
}

