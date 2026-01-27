import { createPortal } from 'react-dom';
import { MusicNotes } from '@phosphor-icons/react';

/**
 * Floating Action Button for chord insertion
 * Appears when lyrics field is focused to provide easy mobile/tablet access.
 * Fixed to top of viewport to avoid iOS keyboard positioning issues.
 * Rendered via portal directly to document.body to ensure it stays fixed during scroll.
 */
export default function ChordInsertionFAB({ onMouseDown, visible }) {
  if (!visible) return null;

  const style = {
    position: 'fixed',
    top: '5rem', // top-20 equivalent (80px)
    right: '1.5rem', // right-6 equivalent (24px)
    minWidth: '44px',
    minHeight: '44px',
    zIndex: 40,
  };

  const button = (
    <button
      type="button"
      onMouseDown={onMouseDown}
      className="w-14 h-14 bg-primary-600 text-white rounded-full shadow-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 flex items-center justify-center transition-all"
      aria-label="Insert chord"
      style={style}
    >
      <MusicNotes size={24} weight="bold" />
    </button>
  );

  return createPortal(button, document.body);
}
