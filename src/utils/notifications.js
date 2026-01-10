/**
 * Notification utilities
 * 
 * Functions for creating and managing user notifications
 */

import { db } from '../db/schema';
import { id } from '@instantdb/react';

/**
 * Create a notification for a user
 * @param {Object} notificationData - { userId, type, message, songbookId?, count? }
 * @returns {Promise} Transaction promise
 */
export async function createNotification(notificationData) {
  const { userId, type, message, songbookId, count } = notificationData;

  return db.transact(
    db.tx.notifications[id()].update({
      userId,
      type,
      message,
      songbookId: songbookId || null,
      count: count || null,
      read: false,
      createdAt: Date.now(),
    })
  );
}

/**
 * Create notifications for copied songs
 * @param {Array} notifications - Array of { userId, songbookId, count }
 * @returns {Promise} Transaction promise
 */
export async function createCopiedSongsNotifications(notifications) {
  if (!notifications || notifications.length === 0) {
    return Promise.resolve();
  }

  const transactions = notifications.map(notif => {
    const message = notif.count === 1
      ? `A song from your private songbook has been saved to your personal library.`
      : `${notif.count} songs from your private songbook have been saved to your personal library.`;

    return db.tx.notifications[id()].update({
      userId: notif.userId,
      type: 'songs_copied',
      message,
      songbookId: notif.songbookId || null,
      count: notif.count || 1,
      read: false,
      createdAt: Date.now(),
    });
  });

  return db.transact(...transactions);
}

/**
 * Mark a notification as read
 * @param {string} notificationId - Notification ID
 * @returns {Promise} Transaction promise
 */
export async function markNotificationRead(notificationId) {
  return db.transact(
    db.tx.notifications[notificationId].update({
      read: true,
    })
  );
}

/**
 * Mark all notifications as read for a user
 * @param {string} userId - User ID
 * @param {Array} notificationIds - Array of notification IDs
 * @returns {Promise} Transaction promise
 */
export async function markAllNotificationsRead(userId, notificationIds) {
  if (!notificationIds || notificationIds.length === 0) {
    return Promise.resolve();
  }

  const transactions = notificationIds.map(notifId =>
    db.tx.notifications[notifId].update({
      read: true,
    })
  );

  return db.transact(...transactions);
}

/**
 * Delete a notification
 * @param {string} notificationId - Notification ID
 * @returns {Promise} Transaction promise
 */
export async function deleteNotification(notificationId) {
  return db.transact(
    db.tx.notifications[notificationId].delete()
  );
}



