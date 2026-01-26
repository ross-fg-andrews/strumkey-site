# FAB Scrolling Issue - Debugging Summary

## Problem
On iPad, when editing a song with the keyboard visible, the FAB (Floating Action Button) scrolls with the page content instead of remaining fixed. The FAB scrolls partway up, then snaps back into position above the keyboard. This doesn't happen on desktop.

## Root Cause
On iOS Safari, when the keyboard is visible, `position: fixed` elements are positioned relative to the **visual viewport**, not the window. When the page scrolls, the visual viewport's `offsetTop` changes, causing the FAB to move with the scroll.

## What We Tried

### 1. **Removed scroll event listener**
- **Hypothesis**: Visual viewport `scroll` events were firing during page scroll, causing position recalculation
- **Result**: FAB still scrolled - the issue persisted

### 2. **Stored keyboard height once, ignored resize events during scroll**
- **Hypothesis**: Resize events were firing during scroll, recalculating keyboard height
- **Result**: FAB still scrolled - resize events were being ignored but FAB still moved

### 3. **Used React Portal to render at document.body**
- **Hypothesis**: Parent containers might be affecting fixed positioning
- **Result**: No change - FAB still scrolled

### 4. **Switched from `bottom` to `top` positioning**
- **Hypothesis**: `bottom` positioning might be more affected by visual viewport
- **Result**: FAB still scrolled - same issue

### 5. **Added CSS transform to compensate for `vv.offsetTop`**
- **Hypothesis**: Use transform to counteract visual viewport movement
- **Result**: Made it worse - FAB scrolled to the top

### 6. **Switched to `position: absolute` with manual scroll tracking**
- **Hypothesis**: `position: absolute` positions relative to document, not visual viewport
- **Result**: Better - FAB moved less, but flickered/vibrated during scroll

## Key Findings

1. **Visual viewport `scroll` events fire during page scroll** - This is expected iOS behavior
2. **Visual viewport `resize` events also fire during scroll** - `window.innerHeight` and `vv.height` change during scroll on iOS
3. **`position: fixed` on iOS with keyboard visible is fundamentally broken** - Elements are positioned relative to visual viewport, not window
4. **`position: absolute` with scroll tracking causes flicker** - Frequent state updates during scroll cause visual jitter

## Current State
Code has been reverted to original implementation. The FAB uses:
- `position: fixed` with `bottom` positioning
- Visual Viewport API to calculate position above keyboard
- Listens to both `resize` and `scroll` events on visual viewport

## Potential Solutions to Try

1. **CSS-only solution**: Use `position: sticky` with appropriate container
2. **Intersection Observer**: Track when FAB enters/leaves viewport and adjust
3. **Throttle/debounce scroll updates**: Reduce flicker in absolute positioning approach
4. **CSS `env()` variables**: Use safe-area-inset-bottom if available
5. **Different positioning strategy**: Position relative to a fixed container element instead of viewport
6. **Accept the limitation**: Document that FAB may move slightly during scroll on iOS
