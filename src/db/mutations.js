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
 * @param {Object} songData - Song data (title, artist, lyrics, chords, createdBy)
 * @returns {Promise} Transaction promise
 */
export async function createSong(songData) {
  const { title, artist, lyrics, chords, createdBy } = songData;
  
  // Always explicitly set chords - use empty JSON array if not provided
  // InstantDB may require a non-null value, so use "[]" as default
  const chordsValue = (chords && typeof chords === 'string' && chords.trim() !== '') 
    ? chords 
    : '[]';
  
  return db.transact(
    db.tx.songs[id()].update({
      title: title.trim(),
      lyrics: lyrics.trim(),
      artist: artist?.trim() || null,
      chords: chordsValue,
      createdBy,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  );
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
  
  return db.transact(
    db.tx.songs[songId].update({
      title: updates.title?.trim(),
      lyrics: updates.lyrics?.trim(),
      artist: updates.artist?.trim() || null,
      chords: chordsValue,
      updatedAt: Date.now(),
    })
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
 * @param {Object} groupData - Group data (name, description, createdBy)
 * @returns {Promise} Transaction promise
 */
export async function createGroup(groupData) {
  const { name, description, createdBy } = groupData;
  
  return db.transact(
    db.tx.groups[id()].update({
      name: name.trim(),
      description: description?.trim() || null,
      createdBy,
      createdAt: Date.now(),
    })
  );
}

/**
 * Create a new songbook
 * @param {Object} songbookData - Songbook data
 * @returns {Promise} Transaction promise
 */
export async function createSongbook(songbookData) {
  const { title, description, type, groupId, createdBy } = songbookData;
  
  return db.transact(
    db.tx.songbooks[id()].update({
      title: title.trim(),
      description: description?.trim() || null,
      type: type || 'private',
      groupId: groupId || null,
      createdBy,
      createdAt: Date.now(),
      updatedAt: Date.now(),
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

