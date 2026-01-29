# iOS Edit Banner Keyboard Fix – Summary

## Context

On iPad (and iPhone), when a user focuses the lyrics field in song edit mode, the **software keyboard** opens. The edit banner at the top of the page (Insert chord, Save, Cancel) must stay visible so the user can save or insert chords.

On iOS Safari, the **layout viewport** does not resize when the keyboard appears; the **visual viewport** shrinks instead. Fixed and sticky elements are tied to the layout viewport, so a fixed banner can end up **off-screen above the visible area**. This is a known WebKit/iOS limitation.

## Solution: Scroll Container + Sticky Banner

We avoid the broken fixed/sticky behaviour by making the **entire edit view** a fixed-height scroll container that matches the visual viewport. The banner is **sticky inside** that container, so it always stays at the top of what’s visible.

1. **Fixed scroll container** – When edit mode is active, the song content (title, artist, lyrics, chord charts) is wrapped in a container with:
   - `position: fixed; top: 0; left: 0; right: 0`
   - `height: window.visualViewport.height` (updated only on **resize** events, not scroll)
   - `overflow-y: auto; overflow-x: hidden` so the song scrolls vertically inside it
   - `-webkit-overflow-scrolling: touch` for smoother iOS scrolling

2. **Sticky banner** – The edit banner uses `position: sticky; top: 0` **inside** this container (not fixed). As the user scrolls the song, the banner stays at the top of the scrollable area. When the keyboard opens, the container height shrinks with the visual viewport, so the banner remains in view.

3. **Hide nav when editing** – The main app **Navigation** is hidden while the user is editing a song (`EditingSongContext`). The edit banner effectively replaces the nav for that screen, so there’s no z-index or overlap issue.

4. **Same margins as rest of app** – The scroll container’s inner content is wrapped in a div with the same classes as Layout’s main content (`w-full px-4 pb-8 pt-4 xl:container xl:mx-auto`) so horizontal padding and max-width match view mode.

5. **Chord insertion modal** – `ChordInsertionModal` is rendered with `createPortal(..., document.body)` from `StyledChordEditor` so it lives at the document root. That avoids clipping, stacking, or focus issues when the modal opens from inside the scroll container.

6. **Empty lines on save** – In `StyledChordEditor`, when converting the contenteditable DOM to text, each empty block (DIV/P) now adds one newline. Consecutive empty lines are preserved when saving.

## Files

- **`src/contexts/EditingSongContext.jsx`** – Provides `isEditingSong` and `setEditingSong`. SongSheet sets this when entering/leaving edit mode; Layout hides the nav when `isEditingSong` is true.
- **`src/App.jsx`** – Wraps routes in `EditingSongProvider`.
- **`src/components/Layout.jsx`** – Uses `useEditingSong()` and renders `<Navigation />` only when `!isEditingSong`.
- **`src/pages/SongSheet.jsx`** – Uses `EditModeScrollWrapper`: when `isEditing`, wraps content in the fixed scroll container (height from `editViewportHeight` state, updated in a `useEffect` on `visualViewport.resize`), sticky banner via `renderBanner`, and inner wrapper with main-content classes. Calls `setEditingSong(isEditing)` in `useEffect`.
- **`src/components/StyledChordEditor.jsx`** – Renders `ChordInsertionModal` via `createPortal(..., document.body)`. Empty-block-to-text conversion adds one `\n` per empty block so empty lines are preserved.

When the keyboard is closed or on desktop, the container height matches the full viewport and behaviour is unchanged.
