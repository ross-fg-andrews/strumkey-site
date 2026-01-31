/**
 * Icon Utilities
 * 
 * Centralized exports of Phosphor icons with consistent naming conventions
 * that match the app's existing icon component names.
 * 
 * Usage:
 *   import { HomeIcon, MusicIcon } from '../utils/icons';
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
  MicrophoneStage,
  DiceFour,
  Plus,
  ArrowLineRight,
  ArrowLineLeft,
  ArrowLineUp,
  ArrowLineDown,
  FileArrowUp,
  Textbox,
} from '@phosphor-icons/react';

// Export with app's naming convention for consistency
export const MenuIcon = List;
export const XIcon = X;
export const PlusIcon = Plus;
export const HomeIcon = House;
export const MusicIcon = MusicNotes;
export const BookIcon = BookOpen;
export const UsersIcon = Users;
export const UserIcon = User;
export const GearIcon = Gear;
export const LogOutIcon = SignOut;
export const AdminIcon = ShieldCheck;
export const MicrophoneStageIcon = MicrophoneStage;
export const ChordIcon = DiceFour;
export const ArrowLineRightIcon = ArrowLineRight;
export const ArrowLineLeftIcon = ArrowLineLeft;
export const ArrowLineUpIcon = ArrowLineUp;
export const ArrowLineDownIcon = ArrowLineDown;
export const ImportIcon = FileArrowUp;
export const TextboxIcon = Textbox;

// Re-export commonly used Phosphor icon props/types for convenience
export { IconContext } from '@phosphor-icons/react';