# FAB iOS Keyboard Fix - Implementation Summary

## Problem
On iPad/iOS Safari, when the on-screen keyboard is open, the Chord Insertion FAB (Floating Action Button) and modal don't stay in their correct positions:
- FAB appears behind the keyboard or scrolls with the page content
- Modal doesn't appear centered in the visible viewport when keyboard is open

## Solution Approach
Installed and implemented the `react-ios-keyboard-viewport` package, which uses the Visual Viewport API to detect iOS keyboard and provide style overrides.

## Package Installed
- **Package:** `react-ios-keyboard-viewport`
- **Version:** `latest` (in package.json)
- **Hook used:** `useFixedStyleWithIOsKeyboard()`

## Files Modified

### 1. `package.json`
- Added dependency: `"react-ios-keyboard-viewport": "latest"`

### 2. `src/components/ChordInsertionFAB.jsx`
**Changes:**
- Removed all custom visual viewport positioning logic (~120 lines)
- Removed `computeBottomPx()` function
- Removed state management (`bottomPx`, `mountedRef`, `calculatedRef`)
- Removed all `useEffect` hooks with resize listeners
- Added import: `import { useFixedStyleWithIOsKeyboard } from 'react-ios-keyboard-viewport';`
- Added hook call: `const { fixedBottom } = useFixedStyleWithIOsKeyboard();`
- Applied `fixedBottom` to button's style prop (merged with existing style object)
- Kept Tailwind classes: `fixed bottom-6 right-6` (inline styles from hook override when iOS keyboard detected)

**Current State:**
- Component is simplified (~35 lines vs ~150 lines before)
- Hook is called at top level (before early return)
- Tailwind `bottom-6` class is always present
- Hook's inline styles override Tailwind when iOS keyboard is detected

**Issue:** FAB still appears in wrong position when keyboard opens

### 3. `src/components/ChordInsertionModal.jsx`
**Changes:**
- Added import: `import { useFixedStyleWithIOsKeyboard } from 'react-ios-keyboard-viewport';`
- Added hook call at top of component: `const { fixedCenter } = useFixedStyleWithIOsKeyboard();`
- Applied `fixedCenter` to backdrop div (line 107) via style prop
- Hook is called before early return (follows React Rules of Hooks)

**Current State:**
- Modal works correctly
- Stays centered when iOS keyboard is open

### 4. `src/components/ChordAutocomplete.jsx`
**Changes:**
- Removed entire `useEffect` that set `padding-bottom` on html/body/main elements (~85 lines removed)
- Removed console.log statements related to padding
- `containerRef` was kept (used for wrapper div, not just padding)

### 5. `src/components/StyledChordEditor.jsx`
**Changes:**
- Removed entire `useEffect` that set `padding-bottom` on html/body/main elements (~85 lines removed)
- Removed console.log statements related to padding
- `containerRef` was kept (used for wrapper div, not just padding)

## How the Package Works

The `useFixedStyleWithIOsKeyboard` hook:
- Detects iOS devices using user agent
- Uses Visual Viewport API to detect keyboard height
- Returns style objects (`fixedTop`, `fixedCenter`, `fixedBottom`) that use:
  - `position: absolute` (not `fixed`)
  - `transform: translateY()` to position elements
  - Listens to both `resize` and `scroll` events on visual viewport
- Returns empty objects `{}` when not on iOS or keyboard not detected

**Important:** The hook uses `position: absolute` with transforms, not `position: fixed`. This may conflict with the Tailwind `fixed` class.

## Current Issues

### FAB Positioning Issue
- **Symptom:** FAB appears in wrong position (behind keyboard) when keyboard opens
- **Possible causes:**
  1. Conflict between Tailwind `position: fixed` and hook's `position: absolute`
  2. Hook's transform calculations may not account for initial keyboard appearance timing
  3. The hook listens to scroll events, which may cause position updates during scroll

## Next Steps to Investigate

1. **Check what styles the hook actually returns:**
   - Add console.log to see `fixedBottom` object when keyboard opens
   - Verify if it's returning styles or empty object

2. **Consider CSS specificity:**
   - Hook returns inline styles, which should override Tailwind classes
   - But if hook uses `position: absolute` and we have `position: fixed` in Tailwind, there may be a conflict

3. **Alternative approaches if package doesn't work:**
   - Go back to custom solution that calculates once and never updates
   - Use `position: absolute` instead of `fixed` if that's what the hook expects
   - Check if hook needs a specific parent container setup

## Testing Notes

- Tested on iPad via USB debugging
- Modal works correctly
- FAB positioning still incorrect
- Desktop/Android behavior should be unaffected (hook returns empty objects)
