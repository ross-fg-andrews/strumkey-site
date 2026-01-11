/**
 * Centralized database mutations for InstantDB
 * 
 * This module provides standardized functions for all database operations
 * following InstantDB best practices.
 */

import { db } from './schema';
import { id } from '@instantdb/react';

/**
 * Create a new song
 * @param {Object} songData - Song data (title, artist, lyrics, chords, createdBy, parentSongId)
 * @returns {Promise<string>} Promise that resolves with the new song ID
 */
export async function createSong(songData) {
  const { title, artist, lyrics, chords, createdBy, parentSongId, embeddedChords } = songData;
  
  // Generate song ID first so we can return it
  const songId = id();
  
  // Always explicitly set chords - use empty JSON array if not provided
  // InstantDB may require a non-null value, so use "[]" as default
  const chordsValue = (chords && typeof chords === 'string' && chords.trim() !== '') 
    ? chords 
    : '[]';
  
  await db.transact(
    db.tx.songs[songId].update({
      title: title.trim(),
      lyrics: lyrics, // Don't trim - preserve line breaks and formatting
      artist: artist?.trim() || null,
      chords: chordsValue,
      embeddedChords: embeddedChords || null,
      createdBy,
      parentSongId: parentSongId || null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  );
  
  return songId;
}

/**
 * Copy a song (creates a new song owned by the user, based on an original)
 * @param {Object} originalSong - The original song object
 * @param {string} userId - User ID who will own the copy
 * @returns {Promise<string>} Promise that resolves with the new song ID
 */
export async function copySong(originalSong, userId) {
  return createSong({
    title: originalSong.title,
    artist: originalSong.artist || null,
    lyrics: originalSong.lyrics,
    chords: originalSong.chords || '[]',
    createdBy: userId,
    parentSongId: originalSong.id, // Track that this is a copy
  });
}

/**
 * Update an existing song
 * @param {string} songId - Song ID
 * @param {Object} updates - Fields to update
 * @returns {Promise} Transaction promise
 */
export async function updateSong(songId, updates) {
  // Always include chords - use empty JSON array if not provided
  // InstantDB may require a non-null value, so use "[]" as default
  const chordsValue = (updates.chords !== undefined) 
    ? ((updates.chords && typeof updates.chords === 'string' && updates.chords.trim() !== '') 
        ? updates.chords 
        : '[]')
    : '[]';
  
  const updateData = {
    title: updates.title?.trim(),
    lyrics: updates.lyrics, // Don't trim - preserve line breaks and formatting
    artist: updates.artist?.trim() || null,
    chords: chordsValue,
    updatedAt: Date.now(),
  };
  
  // Include embeddedChords if provided
  if (updates.embeddedChords !== undefined) {
    updateData.embeddedChords = updates.embeddedChords || null;
  }
  
  return db.transact(
    db.tx.songs[songId].update(updateData)
  );
}

/**
 * Delete a song
 * @param {string} songId - Song ID
 * @returns {Promise} Transaction promise
 */
export async function deleteSong(songId) {
  return db.transact(
    db.tx.songs[songId].delete()
  );
}

/**
 * Create a new meeting RSVP
 * @param {Object} rsvpData - RSVP data (meetingId, userId, response)
 * @returns {Promise} Transaction promise
 */
export async function createRSVP(rsvpData) {
  const { meetingId, userId, response } = rsvpData;
  
  return db.transact(
    db.tx.meetingRSVPs[id()].update({
      meetingId,
      userId,
      response,
      respondedAt: Date.now(),
    })
  );
}

/**
 * Update an existing RSVP
 * @param {string} rsvpId - RSVP ID
 * @param {string} response - New response ('yes', 'no', 'maybe')
 * @returns {Promise} Transaction promise
 */
export async function updateRSVP(rsvpId, response) {
  return db.transact({
    meetingRSVPs: {
      id: rsvpId,
      response,
      respondedAt: Date.now(),
    },
  });
}

/**
 * Create or update an RSVP (upsert pattern)
 * @param {Object} params - { meetingId, userId, response, existingRsvpId }
 * @returns {Promise} Transaction promise
 */
export async function upsertRSVP({ meetingId, userId, response, existingRsvpId }) {
  if (existingRsvpId) {
    return updateRSVP(existingRsvpId, response);
  } else {
    return createRSVP({ meetingId, userId, response });
  }
}

/**
 * Create a new group
 * Automatically adds the creator as an admin member
 * @param {Object} groupData - Group data (name, description, createdBy, groupId?)
 * @param {string} groupData.groupId - Optional group ID (if not provided, will be generated)
 * @returns {Promise<{groupId: string, membershipId: string}>} Promise that resolves with the group ID and membership ID
 */
export async function createGroup(groupData) {
  const { name, description, createdBy, groupId: providedGroupId } = groupData;
  const groupId = providedGroupId || id();
  const membershipId = id();
  const now = Date.now();
  
  const transactions = [
    db.tx.groups[groupId].update({
      name: name.trim(),
      description: description?.trim() || null,
      createdBy,
      createdAt: now,
    }),
    db.tx.groupMembers[membershipId].update({
      groupId,
      userId: createdBy,
      role: 'admin',
      status: 'approved',
      joinedAt: now,
    }),
  ];
  
  await db.transact(transactions);

  return { groupId, membershipId };
}

/**
 * Create a group with initial admin membership
 * @deprecated This function is deprecated. Use createGroup instead, which now automatically adds the creator as an admin member.
 * @param {Object} groupData - Group data (name, description, createdBy)
 * @returns {Promise<{groupId: string, membershipId: string}>} Promise with group and membership IDs
 */
export async function createGroupWithAdmin(groupData) {
  // createGroup now automatically adds the creator as an admin member
  return createGroup(groupData);
}

/**
 * Create a new songbook
 * @param {Object} songbookData - Songbook data
 * @returns {Promise} Transaction promise
 */
export async function createSongbook(songbookData) {
  const { title, description, type, groupId, createdBy } = songbookData;
  
  // Build the update object
  // Note: groupId is currently required in the database (even though schema says optional)
  // So we always provide it - use empty string for private songbooks as a workaround
  const updateData = {
    title: title.trim(),
    description: description?.trim() || null,
    type: type || 'private',
    groupId: groupId || '', // Workaround: database requires this field
    createdBy,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  
  return db.transact(
    db.tx.songbooks[id()].update(updateData)
  );
}

/**
 * Update an existing songbook
 * @param {string} songbookId - Songbook ID
 * @param {Object} updates - Fields to update (title, description, type, groupId)
 * @returns {Promise} Transaction promise
 */
export async function updateSongbook(songbookId, updates) {
  // Build update object
  const updateData = {
    updatedAt: Date.now(),
  };
  
  if (updates.title !== undefined) {
    updateData.title = updates.title.trim();
  }
  if (updates.description !== undefined) {
    updateData.description = updates.description?.trim() || null;
  }
  if (updates.type !== undefined) {
    updateData.type = updates.type;
  }
  // Note: groupId is currently required in the database (even though schema says optional)
  // So we always provide it - use empty string for private songbooks as a workaround
  if (updates.groupId !== undefined) {
    updateData.groupId = updates.groupId || '';
  }
  
  return db.transact(
    db.tx.songbooks[songbookId].update(updateData)
  );
}

/**
 * Delete a songbook
 * @param {string} songbookId - Songbook ID
 * @returns {Promise} Transaction promise
 */
export async function deleteSongbook(songbookId) {
  return db.transact(
    db.tx.songbooks[songbookId].delete()
  );
}

/**
 * Duplicate a songbook (creates a new songbook with the same songs)
 * @param {Object} originalSongbook - The original songbook object
 * @param {Array} songbookSongs - Array of songbookSong objects from the original songbook
 * @param {string} userId - User ID who will own the copy
 * @returns {Promise<string>} Promise that resolves to the new songbook ID
 */
export async function duplicateSongbook(originalSongbook, songbookSongs, userId) {
  // Create new songbook
  const newSongbookId = id();
  const newSongbook = {
    title: `${originalSongbook.title} (Copy)`,
    description: originalSongbook.description || null,
    type: 'private', // Duplicates are always private
    groupId: '', // Private songbooks use empty string
    createdBy: userId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // Create transactions for songbook and all songbookSongs
  const transactions = [
    db.tx.songbooks[newSongbookId].update(newSongbook),
    ...songbookSongs.map((songbookSong, index) =>
      db.tx.songbookSongs[id()].update({
        songbookId: newSongbookId,
        songId: songbookSong.songId,
        order: songbookSong.order || index,
        addedAt: Date.now(),
      })
    ),
  ];

  await db.transact(transactions);
  return newSongbookId;
}

/**
 * Add a song to a songbook
 * For group songbooks, validates that the song is from that group's library
 * @param {string} songbookId - Songbook ID
 * @param {string} songId - Song ID
 * @param {number} order - Order position in the songbook
 * @param {Object} options - Optional validation options
 * @param {string} options.groupId - Group ID (required for group songbooks)
 * @param {Array} options.groupSongIds - Array of song IDs in the group library (for validation)
 * @returns {Promise} Transaction promise
 * @throws {Error} If validation fails (song not in group library for group songbooks)
 */
export async function addSongToSongbook(songbookId, songId, order, options = {}) {
  // If this is a group songbook, validate the song is in the group library
  if (options.groupId && options.groupSongIds) {
    if (!options.groupSongIds.includes(songId)) {
      throw new Error('Song must be from the group library to add to a group songbook');
    }
  }

  return db.transact(
    db.tx.songbookSongs[id()].update({
      songbookId,
      songId,
      order,
      addedAt: Date.now(),
    })
  );
}

/**
 * Remove a song from a songbook
 * @param {string} songbookSongId - SongbookSong ID
 * @returns {Promise} Transaction promise
 */
export async function removeSongFromSongbook(songbookSongId) {
  return db.transact(
    db.tx.songbookSongs[songbookSongId].delete()
  );
}

/**
 * Update the order of a song in a songbook
 * @param {string} songbookSongId - SongbookSong ID
 * @param {number} newOrder - New order position
 * @returns {Promise} Transaction promise
 */
export async function updateSongbookSongOrder(songbookSongId, newOrder) {
  return db.transact(
    db.tx.songbookSongs[songbookSongId].update({
      order: newOrder,
    })
  );
}

/**
 * Share a song with a group
 * @param {Object} shareData - Share data (songId, groupId, sharedBy)
 * @returns {Promise} Transaction promise
 */
export async function shareSongWithGroup(shareData) {
  const { songId, groupId, sharedBy } = shareData;
  
  return db.transact(
    db.tx.songShares[id()].update({
      songId,
      groupId,
      sharedBy,
      sharedAt: Date.now(),
    })
  );
}

/**
 * Delete a song share
 * @param {string} shareId - Song share ID
 * @returns {Promise} Transaction promise
 */
export async function deleteSongShare(shareId) {
  return db.transact({
    songShares: {
      id: shareId,
      _delete: true,
    },
  });
}

/**
 * Delete multiple song shares (batch operation)
 * @param {string[]} shareIds - Array of song share IDs
 * @returns {Promise} Transaction promise
 */
export async function deleteSongShares(shareIds) {
  if (shareIds.length === 0) return Promise.resolve();
  
  return db.transact(
    shareIds.map(shareId => ({
      songShares: {
        id: shareId,
        _delete: true,
      },
    }))
  );
}

/**
 * Create a new chord (for seeding)
 * @param {Object} chordData - Chord data
 * @returns {Function} Transaction builder function
 */
export function createChordBuilder(chordData) {
  return db.tx.chords[id()].update(chordData);
}

/**
 * Batch create chords (for seeding)
 * @param {Object[]} chords - Array of chord data objects
 * @returns {Promise} Transaction promise
 */
export async function createChords(chords) {
  if (chords.length === 0) return Promise.resolve();
  
  return db.transact(
    chords.map(chord => createChordBuilder(chord))
  );
}

/**
 * Create a personal library chord
 * @param {Object} chordData - Chord data (name, frets, instrument, tuning, variation)
 * @param {string} userId - User ID who owns the chord
 * @returns {Promise} Transaction promise
 */
export async function createPersonalChord(chordData, userId) {
  const { name, frets, instrument, tuning, variation = 'standard' } = chordData;
  
  return db.transact(
    db.tx.chords[id()].update({
      name: name.trim(),
      frets,
      instrument,
      tuning,
      variation,
      libraryType: 'personal',
      createdBy: userId,
    })
  );
}

/**
 * Create a main library chord (user-contributed)
 * @param {Object} chordData - Chord data (name, frets, instrument, tuning, variation)
 * @returns {Promise} Transaction promise
 */
export async function createMainLibraryChord(chordData) {
  const { name, frets, instrument, tuning, variation = 'standard' } = chordData;
  
  return db.transact(
    db.tx.chords[id()].update({
      name: name.trim(),
      frets,
      instrument,
      tuning,
      variation,
      libraryType: 'main',
    })
  );
}

/**
 * Create a new meeting
 * @param {Object} meetingData - Meeting data
 * @returns {Promise} Transaction promise
 */
export async function createMeeting(meetingData) {
  const {
    groupId,
    title,
    description,
    date,
    time,
    location,
    createdBy,
    songbookId,
  } = meetingData;
  
  return db.transact(
    db.tx.meetings[id()].update({
      groupId,
      title: title.trim(),
      description: description?.trim() || null,
      date,
      time: time.trim(),
      location: location?.trim() || null,
      createdBy,
      songbookId: songbookId || null,
      createdAt: Date.now(),
    })
  );
}

/**
 * Create a group membership request
 * @param {Object} membershipData - Membership data (groupId, userId, role)
 * @returns {Promise} Transaction promise
 */
export async function createGroupMembership(membershipData) {
  const { groupId, userId, role } = membershipData;
  
  return db.transact(
    db.tx.groupMembers[id()].update({
      groupId,
      userId,
      role: role || 'member',
      status: 'pending',
      joinedAt: Date.now(),
    })
  );
}

/**
 * Update group membership status
 * @param {string} membershipId - Membership ID
 * @param {string} status - New status ('pending', 'approved', 'rejected')
 * @returns {Promise} Transaction promise
 */
export async function updateGroupMembershipStatus(membershipId, status) {
  return db.transact({
    groupMembers: {
      id: membershipId,
      status,
    },
  });
}

/**
 * Remove a song from a group library (admin only)
 * @param {string} shareId - Song share ID
 * @returns {Promise} Transaction promise
 */
export async function removeSongFromGroup(shareId) {
  return deleteSongShare(shareId);
}

/**
 * Delete a group membership (when user leaves or is removed)
 * @param {string} membershipId - Membership ID
 * @returns {Promise} Transaction promise
 */
export async function deleteGroupMembership(membershipId) {
  return db.transact(
    db.tx.groupMembers[membershipId].delete()
  );
}

/**
 * Update a group
 * @param {string} groupId - Group ID
 * @param {Object} updates - Fields to update (name, description)
 * @returns {Promise} Transaction promise
 */
export async function updateGroup(groupId, updates) {
  const updateData = {};
  
  if (updates.name !== undefined) {
    updateData.name = updates.name.trim();
  }
  if (updates.description !== undefined) {
    updateData.description = updates.description?.trim() || null;
  }
  
  return db.transact(
    db.tx.groups[groupId].update(updateData)
  );
}

/**
 * Approve a pending membership request
 * @param {string} membershipId - Membership ID
 * @returns {Promise} Transaction promise
 */
export async function approveMembership(membershipId) {
  return updateGroupMembershipStatus(membershipId, 'approved');
}

/**
 * Decline a pending membership request (delete it)
 * @param {string} membershipId - Membership ID
 * @returns {Promise} Transaction promise
 */
export async function declineMembership(membershipId) {
  return deleteGroupMembership(membershipId);
}

/**
 * Share songs with groups
 * Shares multiple songs with multiple groups
 * @param {Array<string>} songIds - Array of song IDs to share
 * @param {Array<string>} groupIds - Array of group IDs
 * @param {string} userId - User ID (song creator)
 * @returns {Promise} Transaction promise
 */
export async function shareSongsWithGroups(songIds, groupIds, userId) {
  if (!songIds || songIds.length === 0 || !groupIds || groupIds.length === 0) {
    return Promise.resolve();
  }

  // Create song shares for each song with each group
  // Note: We don't check for existing shares here - InstantDB will handle duplicates
  // or the calling code should check before calling this function
  const transactions = [];
  for (const songId of songIds) {
    for (const groupId of groupIds) {
      transactions.push(
        db.tx.songShares[id()].update({
          songId,
          groupId,
          sharedBy: userId,
          sharedAt: Date.now(),
        })
      );
    }
  }

  if (transactions.length === 0) {
    return Promise.resolve();
  }

  return db.transact(...transactions);
}

/**
 * Create a group songbook
 * @param {string} groupId - Group ID
 * @param {string} title - Songbook title
 * @param {string} description - Songbook description (optional)
 * @param {string} createdBy - User ID who created the songbook
 * @returns {Promise<string>} Promise that resolves to the new songbook ID
 */
export async function createGroupSongbook(groupId, title, description, createdBy) {
  const newSongbookId = id();
  
  await db.transact(
    db.tx.songbooks[newSongbookId].update({
      title: title.trim(),
      description: description?.trim() || null,
      type: 'group',
      groupId,
      createdBy,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  );

  return newSongbookId;
}

/**
 * Add a private song to a group (shares it with the group)
 * @param {string} songId - Song ID
 * @param {string} groupId - Group ID
 * @param {string} userId - User ID (song creator)
 * @returns {Promise} Transaction promise
 */
export async function addPrivateSongToGroup(songId, groupId, userId) {
  // Check if song is already shared with this group
  const { data: existingShares } = await db.query({
    songShares: {
      $: {
        where: {
          songId,
          groupId,
        },
      },
    },
  });

  if (existingShares?.songShares && existingShares.songShares.length > 0) {
    // Already shared, no need to share again
    return Promise.resolve();
  }

  return shareSongWithGroup({
    songId,
    groupId,
    sharedBy: userId,
  });
}

/**
 * Update user profile information
 * @param {string} userId - User ID
 * @param {Object} updates - Fields to update (firstName, lastName)
 * @returns {Promise} Transaction promise
 */
export async function updateUser(userId, updates) {
  const updateData = {};
  
  if (updates.firstName !== undefined) {
    updateData.firstName = updates.firstName?.trim() || null;
  }
  if (updates.lastName !== undefined) {
    updateData.lastName = updates.lastName?.trim() || null;
  }
  
  if (Object.keys(updateData).length === 0) {
    return Promise.resolve();
  }
  
  console.log('Updating user:', userId, 'with data:', updateData);
  
  try {
    const result = await db.transact(
      db.tx.$users[userId].update(updateData)
    );
    console.log('User update transaction completed:', result);
    return result;
  } catch (error) {
    console.error('Error in updateUser mutation:', error);
    throw error;
  }
}


/**
 * Add email to waiting list
 * @param {string} email - Email address to add
 * @returns {Promise} Transaction promise
 */
export async function addToWaitingList(email) {
  return db.transact(
    db.tx.waitingList[id()].update({
      email: email.trim().toLowerCase(),
      createdAt: Date.now(),
      notified: false,
    })
  );
}

/**
 * Create an invite for a specific email address
 * @param {string} email - Email address for the invite
 * @param {string} createdBy - User ID of the admin creating the invite
 * @returns {Promise<{inviteId: string, token: string}>} Promise with invite ID and token
 */
export async function createInvite(email, createdBy) {
  // Generate a secure random token
  const token = crypto.randomUUID();
  const inviteId = id();
  
  await db.transact(
    db.tx.invites[inviteId].update({
      token,
      email: email.trim().toLowerCase(),
      createdBy,
      createdAt: Date.now(),
    })
  );
  
  return { inviteId, token };
}

/**
 * Mark an invite as used
 * @param {string} inviteId - Invite ID
 * @param {string} userId - User ID who used the invite
 * @returns {Promise} Transaction promise
 */
export async function useInvite(inviteId, userId) {
  return db.transact(
    db.tx.invites[inviteId].update({
      usedAt: Date.now(),
      usedBy: userId,
    })
  );
}
