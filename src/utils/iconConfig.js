/**
 * Icon Configuration
 * 
 * Centralized registry of icons used across the application.
 * This provides a single source of truth for icon mappings and makes it easy
 * to swap icons or add new ones consistently across the site.
 * 
 * Usage:
 *   import { icons } from '../utils/iconConfig';
 *   const HomeIcon = icons.home;
 * 
 * Or with the helper:
 *   import { getIcon } from '../utils/iconConfig';
 *   const HomeIcon = getIcon('home');
 */

import {
  List,
  X,
  House,
  MusicNotes,
  BookOpen,
  Users,
  User,
  Gear,
  SignOut,
  ShieldCheck,
} from '@phosphor-icons/react';

/**
 * Icon registry mapping semantic names to Phosphor icon components
 */
export const icons = {
  // Navigation icons
  menu: List,
  close: X,
  home: House,
  music: MusicNotes,
  book: BookOpen,
  users: Users,
  
  // User/profile icons
  user: User,
  settings: Gear,
  signOut: SignOut,
  admin: ShieldCheck,
  
  // Add more icons here as you design the site
  // Example:
  // edit: PencilSimple,
  // delete: Trash,
  // add: Plus,
  // search: MagnifyingGlass,
  // etc.
};

/**
 * Helper function to get an icon by name
 * @param {string} name - The semantic name of the icon
 * @returns {React.Component|null} The icon component or null if not found
 */
export function getIcon(name) {
  return icons[name] || null;
}

/**
 * Default icon styling values
 * These can be used with IconContext or passed as default props
 */
export const iconDefaults = {
  size: 24,
  weight: 'regular', // 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone'
  color: 'currentColor', // Inherits text color
};
