import { useEffect, useRef } from 'react';

const DEBOUNCE_MS = 150;
const OFF_SCREEN_THRESHOLD = -1;

/**
 * Keeps the edit banner visible when the iOS software keyboard opens, using the
 * "sticky wrapper + margin compensation" approach: a sticky wrapper can drift
 * off-screen when the keyboard opens; we detect that and apply margin-top to the
 * inner banner so it stays in view. No Visual Viewport API, minimal flicker.
 *
 * @param {React.RefObject<HTMLElement | null>} wrapRef - Ref to the sticky wrapper element.
 * @param {React.RefObject<HTMLElement | null>} innerRef - Ref to the inner (absolute) banner element.
 * @param {boolean} isActive - When true, subscribe to scroll and apply the fix.
 */
export function useEditBannerKeyboardFix(wrapRef, innerRef, isActive) {
  const debounceTimerRef = useRef(null);

  useEffect(() => {
    if (!isActive || !wrapRef || !innerRef) return;

    const setMargin = () => {
      if (!wrapRef.current || !innerRef.current) return;
      const top = wrapRef.current.getBoundingClientRect().top;
      if (top < OFF_SCREEN_THRESHOLD) {
        const marginPx = Math.abs(top);
        innerRef.current.style.marginTop = `${marginPx}px`;
      } else {
        innerRef.current.style.marginTop = '0px';
      }
    };

    const debouncedSetMargin = () => {
      if (debounceTimerRef.current != null) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        setMargin();
      }, DEBOUNCE_MS);
    };

    const onScrollOrResize = () => {
      if (innerRef.current) innerRef.current.style.marginTop = '0px';
      debouncedSetMargin();
    };

    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize);

    return () => {
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
      if (debounceTimerRef.current != null) clearTimeout(debounceTimerRef.current);
      if (innerRef.current) innerRef.current.style.marginTop = '0px';
    };
  }, [isActive, wrapRef, innerRef]);
}
