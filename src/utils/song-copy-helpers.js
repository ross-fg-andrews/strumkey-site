/**
 * Helper functions for copying songs when users lose access
 * 
 * When a user loses access to a song (e.g., leaves a group or admin removes song),
 * any private songbooks containing that song will have the song automatically copied
 * to the user's personal library.
 * 
 * Note: These helpers work with data that has already been queried using hooks.
 * The calling code should query the necessary data first, then pass it to these functions.
 */

import { createSong } from '../db/mutations';

/**
 * Find all private songbooks for a user that contain songs they're losing access to
 * @param {Array} privateSongbooks - Array of songbook objects with songbookSongs already loaded
 * @param {string[]} songIds - Array of song IDs user is losing access to
 * @returns {Array} Array of { songbookId, songId, songbookSongId } pairs that need copying
 */
export function findSongsToCopyForPrivateSongbooks(privateSongbooks, songIds) {
  if (!privateSongbooks || !songIds || songIds.length === 0) {
    return [];
  }

  const songsToCopy = [];
  const songIdSet = new Set(songIds);

  for (const songbook of privateSongbooks) {
    const songbookSongs = songbook.songbookSongs || [];
    for (const songbookSong of songbookSongs) {
      if (songbookSong.song && songIdSet.has(songbookSong.songId)) {
        songsToCopy.push({
          songbookId: songbook.id,
          songId: songbookSong.songId,
          songbookSongId: songbookSong.id,
          originalSong: songbookSong.song,
        });
      }
    }
  }

  return songsToCopy;
}

/**
 * Copy a song for a user (creates a new song owned by the user)
 * @param {Object} originalSong - The original song object
 * @param {string} userId - User ID who will own the copy
 * @returns {Promise<string>} Promise that resolves with the new song ID
 */
export async function copySongForUser(originalSong, userId) {
  if (!originalSong || !userId) {
    throw new Error('Original song and userId are required');
  }

  // Create a copy of the song
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
 * Copy songs from private songbooks when user loses access
 * This function works with data that has already been queried.
 * 
 * @param {string} userId - User ID
 * @param {Array} privateSongbooks - Array of private songbook objects with songbookSongs loaded
 * @param {Array} originalSongs - Array of song objects user is losing access to
 * @param {Array} existingCopies - Array of songs user already has copies of (with parentSongId set)
 * @returns {Promise<Object>} { copiedSongs: Array, notifications: Array, transactions: Array }
 */
export async function copySongsForPrivateSongbooks(userId, privateSongbooks, originalSongs, existingCopies = []) {
  if (!userId || !privateSongbooks || !originalSongs || originalSongs.length === 0) {
    return { copiedSongs: [], notifications: [], transactions: [] };
  }

  const songIds = originalSongs.map(s => s.id);
  const songMap = new Map(originalSongs.map(s => [s.id, s]));
  const existingCopyMap = new Map(
    existingCopies.map(c => [c.parentSongId, c])
  );

  // Find which songs need to be copied
  const songsToCopy = findSongsToCopyForPrivateSongbooks(privateSongbooks, songIds);
  
  if (songsToCopy.length === 0) {
    return { copiedSongs: [], notifications: [], transactions: [] };
  }

  // Copy each song and track which songbooks were affected
  const copiedSongs = [];
  const songbookAffectedCount = new Map(); // songbookId -> count
  const transactions = [];

  for (const { songbookId, songId, originalSong } of songsToCopy) {
    if (!originalSong) continue;

    // Check if user already has a copy
    const existingCopy = existingCopyMap.get(songId);
    
    if (existingCopy) {
      // User already has a copy, use that one
      copiedSongs.push({
        originalSongId: songId,
        copySongId: existingCopy.id,
        songbookId,
        alreadyExisted: true,
      });
    } else {
      // Create a new copy
      const copyTransaction = copySongForUser(originalSong, userId);
      transactions.push(copyTransaction);
      
      // We'll need to query for the new copy ID after transactions complete
      // For now, mark it as needing ID lookup
      copiedSongs.push({
        originalSongId: songId,
        copySongId: null, // Will be set after transaction
        songbookId,
        alreadyExisted: false,
        transaction: copyTransaction,
      });
    }

    // Track affected songbooks
    const currentCount = songbookAffectedCount.get(songbookId) || 0;
    songbookAffectedCount.set(songbookId, currentCount + 1);
  }

  // Generate notifications
  const notifications = Array.from(songbookAffectedCount.entries()).map(
    ([songbookId, count]) => ({
      type: 'songs_copied',
      songbookId,
      count,
      userId,
    })
  );

  return { copiedSongs, notifications, transactions };
}

/**
 * Prepare transactions to update songbook entries to use copied songs instead of original songs
 * @param {Object} db - InstantDB db instance
 * @param {Array} songbookSongs - Array of songbookSong objects that need updating
 * @param {Map} copyMap - Map from originalSongId to copySongId
 * @returns {Array} Array of transaction builders
 */
export function prepareSongbookEntryUpdates(db, songbookSongs, copyMap) {
  if (!songbookSongs || songbookSongs.length === 0) {
    return [];
  }
  
  return songbookSongs
    .map(ss => {
      const newSongId = copyMap.get(ss.songId);
      if (newSongId && ss.id) {
        return db.tx.songbookSongs[ss.id].update({
          songId: newSongId,
        });
      }
      return null;
    })
    .filter(Boolean);
}

