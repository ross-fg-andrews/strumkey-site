import { useEffect, useRef, useState } from 'react';
import { MusicNotes } from '@phosphor-icons/react';

const BOTTOM_OFFSET_PX = 24;

/**
 * Compute FAB bottom offset so it sits above the visible viewport (e.g. above
 * iOS keyboard). Returns null when visualViewport is unavailable (use CSS fallback).
 */
function computeBottomPx() {
  if (typeof window === 'undefined' || !window.visualViewport) return null;
  const vv = window.visualViewport;
  const inner = window.innerHeight;
  // Option B: keyboard closed heuristic to avoid iOS offsetTop-not-resetting bugs
  if (vv.height >= inner * 0.95) {
    return BOTTOM_OFFSET_PX;
  }
  const visibleBottom = vv.offsetTop + vv.height;
  const bottomPx = inner - visibleBottom + BOTTOM_OFFSET_PX;
  return Math.max(BOTTOM_OFFSET_PX, bottomPx);
}

/**
 * Floating Action Button for chord insertion
 * Appears when lyrics field is focused to provide easy mobile/tablet access.
 * Uses Visual Viewport API to stay above the virtual keyboard on iPad/iOS.
 */
export default function ChordInsertionFAB({ onMouseDown, visible }) {
  const [bottomPx, setBottomPx] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    if (!visible) return;
    mountedRef.current = true;
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;

    const update = () => {
      requestAnimationFrame(() => {
        if (!mountedRef.current) return;
        const next = computeBottomPx();
        setBottomPx(next);
      });
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);

    return () => {
      mountedRef.current = false;
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [visible]);

  if (!visible) return null;

  const style = {
    minWidth: '44px',
    minHeight: '44px',
  };
  if (bottomPx !== null) {
    style.bottom = `${bottomPx}px`;
  }

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
