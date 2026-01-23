import { MusicNotes } from '@phosphor-icons/react';

/**
 * Floating Action Button for chord insertion
 * Appears when lyrics field is focused to provide easy mobile/tablet access
 */
export default function ChordInsertionFAB({ onMouseDown, visible }) {
  if (!visible) return null;

  return (
    <button
      type="button"
      onMouseDown={onMouseDown}
      className="fixed bottom-6 right-6 w-14 h-14 bg-primary-600 text-white rounded-full shadow-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 flex items-center justify-center z-40 transition-all"
      aria-label="Insert chord"
      style={{
        minWidth: '44px',
        minHeight: '44px',
      }}
    >
      <MusicNotes size={24} weight="bold" />
    </button>
  );
}
