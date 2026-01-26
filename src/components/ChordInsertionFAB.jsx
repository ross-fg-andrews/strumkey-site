import { MusicNotes } from '@phosphor-icons/react';
import { useFixedStyleWithIOsKeyboard } from 'react-ios-keyboard-viewport';

/**
 * Floating Action Button for chord insertion
 * Appears when lyrics field is focused to provide easy mobile/tablet access.
 * Uses react-ios-keyboard-viewport to stay above the virtual keyboard on iPad/iOS.
 */
export default function ChordInsertionFAB({ onMouseDown, visible }) {
  const { fixedBottom } = useFixedStyleWithIOsKeyboard();

  if (!visible) return null;

  const style = {
    minWidth: '44px',
    minHeight: '44px',
    ...fixedBottom, // Override positioning when iOS keyboard is open (inline styles override Tailwind classes)
  };

  return (
    <button
      type="button"
      onMouseDown={onMouseDown}
      className="fixed bottom-6 right-6 w-14 h-14 bg-primary-600 text-white rounded-full shadow-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 flex items-center justify-center z-40 transition-all"
      aria-label="Insert chord"
      style={style}
    >
      <MusicNotes size={24} weight="bold" />
    </button>
  );
}
