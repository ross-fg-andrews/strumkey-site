import { useRef, useEffect, useState, useMemo, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { findChord } from '../utils/chord-library';
import { useChordAutocomplete, splitLibraryForDisplay } from '../hooks/useChordAutocomplete';
import { isFretPatternQuery, isFretPatternOrPrefixQuery, getStringCountForInstrument, normalizeQuery } from '../utils/chord-autocomplete-helpers';
import { getDisplayChordName } from '../utils/enharmonic';
import ChordInsertionModal from './ChordInsertionModal';
import ChordSearchFullResults from './ChordSearchFullResults';
import CustomChordModal from './CustomChordModal';
import { createPersonalChord } from '../db/mutations';
import { formatChordNameForDisplay } from '../utils/chord-formatting';

/**
 * Find the chord pattern at or before the cursor position
 * Returns { start: number, end: number, chord: string } or null
 */
function findChordAtPosition(text, cursorPos) {
  const chordPattern = /\[([^\]]+)\]/g;
  let match;
  
  while ((match = chordPattern.exec(text)) !== null) {
    const start = match.index;
    const end = match.index + match[0].length;
    
    // Check if cursor is within this chord pattern
    if (cursorPos >= start && cursorPos <= end) {
      return { start, end, chord: match[1] };
    }
    
    // Check if cursor is right after this chord (for backspace)
    if (cursorPos === end) {
      return { start, end, chord: match[1] };
    }
  }
  
  return null;
}

const StyledChordEditor = forwardRef(function StyledChordEditor({ 
  value, 
  onChange, 
  placeholder, 
  className, 
  rows, 
  required,
  instrument = 'ukulele',
  tuning = 'ukulele_standard',
  userId = null
}, ref) {
  const editorRef = useRef(null);
  const containerRef = useRef(null);
  const modalRef = useRef(null);
  const searchInputRef = useRef(null);
  const skipSyncRef = useRef(false);
  const suppressSyncCursorRef = useRef(false); // set by insertElement so any pending sync setCursorPosition is skipped
  const setCursorCallerRef = useRef(''); // for debug: who called setCursorPosition
  const pendingSectionCursorRef = useRef(null); // when set, effect will place cursor after commit
  const insertPositionRef = useRef(0);
  const lastCursorPositionInEditorRef = useRef(0); // last position while selection was in editor (for Section mousedown)
  const inputDebounceTimerRef = useRef(null);
  const justHandledEnterRef = useRef(false);

  // Use shared autocomplete hook
  const {
    showDropdown,
    setShowDropdown,
    query,
    setQuery,
    selectedIndex,
    setSelectedIndex,
    showCustomChordModal,
    setShowCustomChordModal,
    selectedPositions,
    setSelectedPositions,
    dbChords,
    personalChordNames,
    allChordVariations,
    usedChordNames,
    getChordData,
    filteredElements,
    usedFiltered,
    libraryFiltered,
    libraryFilteredCommon,
    libraryFilteredAllForDisplay,
    handleChordPositionSelect,
  } = useChordAutocomplete({ value, instrument, tuning, userId });

  const [fullSearchResults, setFullSearchResults] = useState(null);
  const stringCount = getStringCountForInstrument(instrument, tuning);
  const trimmedQuery = (query ?? '').trim();
  const isFretPrefixOnly = trimmedQuery.length > 0 && isFretPatternOrPrefixQuery(trimmedQuery, stringCount) && !isFretPatternQuery(trimmedQuery, stringCount);
  useEffect(() => {
    const trimmed = query?.trim() ?? '';
    const isFretSearch = trimmed.length > 0 && isFretPatternQuery(trimmed, stringCount);
    if (!showDropdown || !trimmed || isFretSearch || isFretPrefixOnly) setFullSearchResults(null);
  }, [showDropdown, query, stringCount, isFretPrefixOnly]);

  const effectiveLibrary = useMemo(() => {
    if (fullSearchResults != null) return splitLibraryForDisplay(fullSearchResults);
    return {
      libraryFiltered,
      libraryFilteredCommon,
      libraryFilteredAllForDisplay,
    };
  }, [fullSearchResults, libraryFiltered, libraryFilteredCommon, libraryFilteredAllForDisplay]);

  // Expose openChordModal, captureCursorPosition, insertSection for parent (e.g. edit banner)
  useImperativeHandle(ref, () => ({
    openChordModal() {
      editorRef.current?.focus();
      setTimeout(() => {
        insertPositionRef.current = getCursorPosition();
        setQuery('');
        setSelectedIndex(0);
        setShowDropdown(true);
      }, 0);
    },
    captureCursorPosition() {
      if (!editorRef.current) return;
      // Always use last known position when opening Section menu: at mousedown the selection
      // may already be wrong or getCursorPosition() may return end (fallback). Use the position
      // we last saw while the selection was in the editor.
      insertPositionRef.current = lastCursorPositionInEditorRef.current;
    },
    insertSection(type, onDone) {
      if (type === 'heading' || type === 'instruction') {
        insertElement(type, onDone);
        // Do not schedule extra focus() here: insertElement already focuses and places cursor
        // (inline and in a deferred callback). An extra focus() can run after our place-cursor
        // and on Safari/iOS can reset the selection to the end of the contenteditable.
      }
    },
  }), [setQuery, setSelectedIndex, setShowDropdown]);

  // Handle modal close
  const handleModalClose = () => {
    setShowDropdown(false);
    setQuery('');
    // Restore focus to editor
    setTimeout(() => {
      editorRef.current?.focus();
    }, 0);
  };

  // Handle insert action from modal
  const handleModalInsert = () => {
    const createCustomIndex = filteredElements.length + usedFiltered.length + libraryFiltered.length;
    
    if (selectedIndex === createCustomIndex) {
      // "Create custom chord" is selected
      setShowCustomChordModal(true);
      setShowDropdown(false);
    } else {
      // Chord selected - use display name (e.g. F#m7) not DB name (e.g. Gbm7) when user searched sharp
      const chordIndex = selectedIndex - filteredElements.length;
      const allFiltered = [...usedFiltered, ...libraryFiltered];
      if (allFiltered[chordIndex]) {
        const selectedChord = allFiltered[chordIndex];
        const dbName = selectedChord.name || selectedChord;
        const displayName = selectedChord.displayName ?? getDisplayChordName(dbName, query, normalizeQuery);
        const chordPosition = selectedChord.position;
        const chordId = selectedChord.id || null;
        // Pass position and ID directly to insertChord to avoid state timing issues
        insertChord(displayName, chordPosition || null, chordId);
      }
    }
  };

  // Helper function to get chord marker text length from a chord span
  // Must use stored format (data-chord-name) to match getTextFromEditor and newCursorPos;
  // display format (e.g. "Bm") can differ from stored (e.g. "Bminor"), causing cursor drift.
  const getChordMarkerLength = (chordSpan) => {
    const dataName = chordSpan.getAttribute('data-chord-name');
    const chordId = chordSpan.getAttribute('data-chord-id');
    if (dataName) {
      const childSpans = chordSpan.querySelectorAll('span');
      let chordPosition = null;
      if (childSpans.length > 1) {
        const positionNum = parseInt(childSpans[1].textContent.trim(), 10);
        if (!isNaN(positionNum) && positionNum > 1) chordPosition = positionNum;
      }
      // Calculate length including ID if present: [C:2:abc123] or [C::abc123] or [C:2] or [C]
      if (chordId) {
        return chordPosition
          ? `[${dataName}:${chordPosition}:${chordId}]`.length
          : `[${dataName}::${chordId}]`.length;
      } else {
        return chordPosition ? `[${dataName}:${chordPosition}]`.length : `[${dataName}]`.length;
      }
    }
    const childSpans = chordSpan.querySelectorAll('span');
    let chordName = '';
    let chordPosition = null;
    if (childSpans.length > 0) {
      chordName = childSpans[0].textContent.trim();
      if (childSpans.length > 1) {
        const positionNum = parseInt(childSpans[1].textContent.trim(), 10);
        if (!isNaN(positionNum) && positionNum > 1) chordPosition = positionNum;
      }
    } else {
      chordName = chordSpan.textContent.trim();
    }
    return chordPosition
      ? chordName.length + 1 + chordPosition.toString().length + 2
      : chordName.length + 2;
  };

  // Helper function to get heading/instruction marker length
  const getElementMarkerLength = (element) => {
    if (element.hasAttribute('data-heading')) {
      const headingText = element.getAttribute('data-heading-text') || '';
      return `{heading:${headingText}}`.length;
    } else if (element.hasAttribute('data-instruction')) {
      const instructionText = element.getAttribute('data-instruction-text') || '';
      return `{instruction:${instructionText}}`.length;
    }
    return 0;
  };

  // Length of one direct child of the editor in the flat text (for getCursorPosition when container is editor)
  const getLengthOfEditorChild = (child, editor, childIndex) => {
    const nextSibling = editor.childNodes[childIndex + 1];
    const nextIsBR = nextSibling?.tagName === 'BR';
    const hasNext = childIndex < editor.childNodes.length - 1;
    const newlineAfter = nextIsBR || hasNext;
    if (child.nodeType === Node.TEXT_NODE) {
      return (child.textContent || '').replace(/\u200B/g, '').length;
    }
    if (child.tagName === 'BR') return 1;
    if (child.hasAttribute('data-heading') || child.hasAttribute('data-instruction')) {
      return getElementMarkerLength(child) + (newlineAfter ? 1 : 0);
    }
    if (child.hasAttribute('data-chord')) {
      return getChordMarkerLength(child);
    }
    if (child.tagName === 'DIV' || child.tagName === 'P') {
      const blockText = child.textContent.replace(/\u200B/g, '').trim();
      const isEmpty = blockText === '' && child.children.length === 0;
      if (isEmpty) return 1;
      let len = 0;
      if (hasNext) len += 1;
      const innerText = Array.from(child.childNodes).reduce((acc, n) => {
        if (n.nodeType === Node.TEXT_NODE) return acc + (n.textContent || '').replace(/\u200B/g, '');
        return acc;
      }, '');
      len += innerText.length;
      if (childIndex > 0) len += 1;
      return len;
    }
    return 0;
  };

  // Get cursor position in contenteditable (accounting for <br> tags, chord spans, and heading/instruction elements)
  // Simplified approach: traverse DOM in same order as getTextFromEditor() and count characters until cursor
  const getCursorPosition = () => {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) {
      const fullText = getTextFromEditor();
      return fullText.length;
    }
    
    const range = selection.getRangeAt(0);
    const isCollapsed = range.collapsed;
    const containerNode = isCollapsed ? range.endContainer : range.startContainer;
    const offset = isCollapsed ? range.endOffset : range.startOffset;
    
    // When cursor is at the editor level (container is the editor div), offset may be child index
    // (0 = before first child) or 1-based in some browsers. Use anchorNode when it's a direct child
    // to get the true position; otherwise sum lengths of the first N children.
    if (containerNode === editorRef.current) {
      const children = editorRef.current.childNodes;
      const anchorNode = selection.anchorNode;
      // If cursor is inside a direct child (anchorNode is that child), use its index + offset within it
      const directIndex = Array.from(children).indexOf(anchorNode);
      if (directIndex >= 0) {
        let pos = 0;
        for (let i = 0; i < directIndex; i++) {
          pos += getLengthOfEditorChild(children[i], editorRef.current, i);
        }
        if (anchorNode.nodeType === Node.TEXT_NODE) {
          const beforeCursor = (anchorNode.textContent || '').substring(0, offset).replace(/\u200B/g, '');
          pos += beforeCursor.length;
        }
        return pos;
      }
      // Cursor between children: offset can be 1-based (offset 1 = before first child, 2 = before second).
      // Use (offset - 2) so cursor "on empty line" (offset 2) inserts at 0; avoids empty line above heading.
      const numChildrenToSum = Math.max(0, offset - 2);
      let pos = 0;
      for (let i = 0; i < numChildrenToSum && i < children.length; i++) {
        pos += getLengthOfEditorChild(children[i], editorRef.current, i);
      }
      return pos;
    }
    if (containerNode === editorRef.current.parentNode) {
      const fullText = getTextFromEditor();
      return fullText.length;
    }
    
    // Traverse nodes in the same order as getTextFromEditor()
    // This ensures positions always match
    let position = 0;
    const traverse = (node, targetNode, targetOffset) => {
      for (let i = 0; i < node.childNodes.length; i++) {
        const child = node.childNodes[i];
        
        if (child.nodeType === Node.TEXT_NODE) {
          // Get effective content (excluding zero-width spaces used for iOS cursor positioning)
          const rawContent = child.textContent;
          const effectiveContent = rawContent.replace(/\u200B/g, '');
          
          // Check if this is the target text node
          if (child === targetNode) {
            // Calculate effective offset (accounting for zero-width spaces before cursor position)
            const beforeCursor = rawContent.substring(0, targetOffset);
            const effectiveOffset = beforeCursor.replace(/\u200B/g, '').length;
            position += effectiveOffset;
            return true; // Found it, stop traversing
          }
          // Not the target, add its effective length and continue
          position += effectiveContent.length;
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          if (child.hasAttribute('data-heading')) {
            // Heading element - counts as {heading:text}
            // Check if cursor is within this heading (in a text node inside it)
            if (child.contains(targetNode)) {
              // Cursor is in a text node within this heading
              // Add the marker prefix "{heading:" then recursively search for the text node
              position += '{heading:'.length;
              // Recursively search within the heading for the target text node
              if (traverse(child, targetNode, targetOffset)) {
                // Found it - add the closing "}" and newline if needed
                position += '}'.length;
                const nextSibling = child.nextSibling;
                if (nextSibling && nextSibling.tagName === 'BR') {
                  position += 1;
                } else if (i < node.childNodes.length - 1) {
                  position += 1;
                }
                return true;
              }
            }
            // Not in this heading, add full marker length
            const headingText = child.getAttribute('data-heading-text') || child.textContent.trim();
            const headingMarker = `{heading:${headingText}}`;
            position += headingMarker.length;
            // Check if next sibling is a BR and skip it (we'll add newline here)
            const nextSibling = child.nextSibling;
            if (nextSibling && nextSibling.tagName === 'BR') {
              position += 1;
              i++; // Skip the BR element
            } else if (i < node.childNodes.length - 1) {
              // Add newline if not last child and no BR follows
              position += 1;
            }
          } else if (child.hasAttribute('data-instruction')) {
            // Instruction element - counts as {instruction:text}
            // Check if cursor is within this instruction (in a text node inside it)
            if (child.contains(targetNode)) {
              // Cursor is in a text node within this instruction
              position += '{instruction:'.length;
              // Recursively search within the instruction for the target text node
              if (traverse(child, targetNode, targetOffset)) {
                // Found it - add the closing "}" and newline if needed
                position += '}'.length;
                const nextSibling = child.nextSibling;
                if (nextSibling && nextSibling.tagName === 'BR') {
                  position += 1;
                } else if (i < node.childNodes.length - 1) {
                  position += 1;
                }
                return true;
              }
            }
            // Not in this instruction, add full marker length
            const instructionText = child.getAttribute('data-instruction-text') || child.textContent.trim();
            const instructionMarker = `{instruction:${instructionText}}`;
            position += instructionMarker.length;
            const nextSibling = child.nextSibling;
            if (nextSibling && nextSibling.tagName === 'BR') {
              position += 1;
              i++; // Skip the BR element
            } else if (i < node.childNodes.length - 1) {
              position += 1;
            }
          } else if (child.tagName === 'BR') {
            // Line break - counts as \n
            // Check if cursor is at this BR
            if (child === targetNode) {
              position += 1;
              return true;
            }
            position += 1;
          } else if (child.hasAttribute('data-chord')) {
            // Chord span - counts as [ChordName] or [ChordName:Position] or [ChordName::id] or [ChordName:Position:id]
            // Must match the logic in getTextFromEditor to ensure consistent position calculations
            const childSpans = child.querySelectorAll('span');
            let chordName = child.getAttribute('data-chord-name') || '';
            const chordId = child.getAttribute('data-chord-id'); // Get chord ID if present
            
            if (!chordName) {
              if (childSpans.length > 0) {
                chordName = childSpans[0].textContent.trim();
              } else {
                chordName = child.textContent.trim();
              }
            }
            
            let chordPosition = null;
            if (childSpans.length > 1) {
              const positionText = childSpans[1].textContent.trim();
              const positionNum = parseInt(positionText, 10);
              if (!isNaN(positionNum) && positionNum > 1) {
                chordPosition = positionNum;
              }
            }
            
            // Reconstruct chord marker with position and ID if present (matching getTextFromEditor logic)
            // Format: [C:2:abc123] or [C::abc123] or [C:2] or [C]
            let chordMarker;
            if (chordId) {
              chordMarker = chordPosition
                ? `[${chordName}:${chordPosition}:${chordId}]`
                : `[${chordName}::${chordId}]`;
            } else {
              chordMarker = chordPosition 
                ? `[${chordName}:${chordPosition}]` 
                : `[${chordName}]`;
            }
            
            // Check if cursor is within or after this chord
            if (child.contains(targetNode) || child === targetNode) {
              // Cursor is in this chord element - typically at the end
              position += chordMarker.length;
              return true;
            }
            
            position += chordMarker.length;
          } else if (child.tagName === 'DIV' || child.tagName === 'P') {
            // Block elements represent line breaks in contenteditable
            // Add newline before this block element (if there's already content)
            if (position > 0 && !getTextFromEditor().substring(position - 1, position).endsWith('\n')) {
              position += 1;
            }
            // Recursively traverse element children
            if (traverse(child, targetNode, targetOffset)) {
              return true;
            }
            // Add newline after this block element (if not the last child)
            if (i < node.childNodes.length - 1) {
              position += 1;
            }
          } else {
            // Recursively traverse other elements
            if (traverse(child, targetNode, targetOffset)) {
              return true;
            }
          }
        }
      }
      return false; // Not found in this subtree
    };
    
    // Start traversal from the editor root
    if (traverse(editorRef.current, containerNode, offset)) {
      return position;
    }
    
    // Fallback: if we didn't find it, return text length (cursor at end)
    const fullText = getTextFromEditor();
    return fullText.length;
  };
  
  // Set cursor position in contenteditable (accounting for <br> tags, chord spans, and heading/instruction elements)
  const setCursorPosition = (pos) => {
    const fromInsertChord = setCursorCallerRef.current?.startsWith?.('insertChord');
    const selection = window.getSelection();
    const range = document.createRange();
    
    // Collect all nodes in order: text nodes, <br> elements, chord spans, and heading/instruction elements
    const allNodes = [];
    const collectNodes = (node) => {
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === Node.TEXT_NODE) {
          allNodes.push({ type: 'text', node: child });
        } else if (child.tagName === 'BR') {
          allNodes.push({ type: 'br', node: child });
        } else if (child.nodeType === Node.ELEMENT_NODE && child.hasAttribute('data-chord')) {
          allNodes.push({ type: 'chord', node: child });
        } else if (child.nodeType === Node.ELEMENT_NODE && (child.hasAttribute('data-heading') || child.hasAttribute('data-instruction'))) {
          allNodes.push({ type: 'element', node: child });
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          collectNodes(child);
        }
      }
    };
    collectNodes(editorRef.current);
    
    let currentPos = 0;
    for (let i = 0; i < allNodes.length; i++) {
      const item = allNodes[i];
      if (item.type === 'text') {
        // Get effective length (excluding zero-width spaces which are only for cursor positioning)
        const rawContent = item.node.textContent;
        const effectiveContent = rawContent.replace(/\u200B/g, '');
        const effectiveLength = effectiveContent.length;
        
        // Skip zero-width-space-only nodes for position counting, but remember them
        if (effectiveLength === 0) {
          // This is a zero-width space node (for cursor positioning after chords)
          // Don't add to currentPos, but this is a valid place to position cursor
          continue;
        }
        
        if (currentPos + effectiveLength >= pos) {
            const offset = pos - currentPos;
            range.setStart(item.node, offset);
            range.setEnd(item.node, offset);
            selection.removeAllRanges();
            selection.addRange(range);
          return;
        }
        currentPos += effectiveLength;
      } else if (item.type === 'br') {
        if (currentPos === pos) {
          range.setStartBefore(item.node);
          range.setEndBefore(item.node);
          selection.removeAllRanges();
          selection.addRange(range);
          return;
        } else if (currentPos + 1 === pos) {
          range.setStartAfter(item.node);
          range.setEndAfter(item.node);
          selection.removeAllRanges();
          selection.addRange(range);
          return;
        }
        currentPos += 1;
      } else if (item.type === 'chord') {
        // Calculate chord marker length (accounts for position format)
        const chordLength = getChordMarkerLength(item.node);
        if (currentPos + chordLength >= pos) {
          // Position is within or right after the chord
          if (fromInsertChord) {
            let targetNode = null;
            let targetOffset = 0;
            for (let j = i + 1; j < allNodes.length; j++) {
              const n = allNodes[j];
              if (n.type === 'text') {
                const len = (n.node.textContent || '').replace(/\u200B/g, '').length;
                if (len > 0) {
                  targetNode = n.node;
                  targetOffset = 0;
                  break;
                }
              } else if (n.type === 'br') {
                range.setStartBefore(n.node);
                range.setEndBefore(n.node);
                selection.removeAllRanges();
                selection.addRange(range);
                return;
              }
            }
            if (targetNode) {
              selection.removeAllRanges();
              selection.collapse(targetNode, targetOffset);
            } else {
              range.setStartAfter(item.node);
              range.setEndAfter(item.node);
              selection.removeAllRanges();
              selection.addRange(range);
            }
          } else {
            range.setStartAfter(item.node);
            range.setEndAfter(item.node);
            selection.removeAllRanges();
            selection.addRange(range);
          }
          return;
        }
        currentPos += chordLength;
      } else if (item.type === 'element') {
        // Calculate heading/instruction marker length
        const elementLength = getElementMarkerLength(item.node);
        if (currentPos + elementLength >= pos) {
          // Position is within the heading/instruction element: place cursor inside it
          // so the user types in the styled block (not after it)
          if (item.node.childNodes.length === 0) {
            range.setStart(item.node, 0);
            range.setEnd(item.node, 0);
          } else {
            const firstChild = item.node.firstChild;
            if (firstChild.nodeType === Node.TEXT_NODE) {
              const offsetInElement = Math.min(pos - currentPos, firstChild.textContent.length);
              range.setStart(firstChild, offsetInElement);
              range.setEnd(firstChild, offsetInElement);
            } else {
              range.setStart(item.node, 0);
              range.setEnd(item.node, 0);
            }
          }
          selection.removeAllRanges();
          selection.addRange(range);
          return;
        }
        currentPos += elementLength;
      }
    }
    
    // If we get here, position is at the end - place cursor at end of last node
    if (allNodes.length === 0) {
      // No nodes to position cursor in - just return without modifying selection
      return;
    }
    
    const lastItem = allNodes[allNodes.length - 1];
    if (lastItem.type === 'text') {
      range.setStart(lastItem.node, lastItem.node.textContent.length);
      range.setEnd(lastItem.node, lastItem.node.textContent.length);
    } else if (lastItem.type === 'br') {
      range.setStartAfter(lastItem.node);
      range.setEndAfter(lastItem.node);
    } else if (lastItem.type === 'chord') {
      range.setStartAfter(lastItem.node);
      range.setEndAfter(lastItem.node);
    } else if (lastItem.type === 'element') {
      range.setStartAfter(lastItem.node);
      range.setEndAfter(lastItem.node);
    }
    
    selection.removeAllRanges();
    selection.addRange(range);
  };

  // Get plain text from contenteditable (reconstructing [Chord] format)
  const getTextFromEditor = () => {
    if (!editorRef.current) return '';
    
    // Traverse child nodes and reconstruct text with brackets, handling line breaks
    let text = '';
    const traverse = (node) => {
      for (let i = 0; i < node.childNodes.length; i++) {
        const child = node.childNodes[i];
        
        if (child.nodeType === Node.TEXT_NODE) {
          // Strip zero-width spaces (used for iOS cursor positioning)
          text += child.textContent.replace(/\u200B/g, '');
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          if (child.hasAttribute('data-heading')) {
            // This is a styled heading element (strip placeholder \u200B so we don't save it)
            const headingText = (child.getAttribute('data-heading-text') || child.textContent.trim()).replace(/\u200B/g, '');
            text += `{heading:${headingText}}`;
            // Check if next sibling is a BR and skip it (we'll add newline here)
            const nextSibling = child.nextSibling;
            if (nextSibling && nextSibling.tagName === 'BR') {
              text += '\n';
              i++; // Skip the BR element
            } else if (i < node.childNodes.length - 1) {
              // Add newline if not last child and no BR follows
              text += '\n';
            }
          } else if (child.hasAttribute('data-instruction')) {
            // This is a styled instruction element (strip placeholder \u200B so we don't save it)
            const instructionText = (child.getAttribute('data-instruction-text') || child.textContent.trim()).replace(/\u200B/g, '');
            text += `{instruction:${instructionText}}`;
            // Check if next sibling is a BR and skip it (we'll add newline here)
            const nextSibling = child.nextSibling;
            if (nextSibling && nextSibling.tagName === 'BR') {
              text += '\n';
              i++; // Skip the BR element
            } else if (i < node.childNodes.length - 1) {
              // Add newline if not last child and no BR follows
              text += '\n';
            }
          } else if (child.tagName === 'BR') {
            // Line break
            text += '\n';
          } else if (child.hasAttribute('data-chord')) {
            // This is a styled chord span
            // Extract original chord name from data attribute (preserves stored value)
            // Extract position from child spans
            // Extract chordId from data attribute if present
            // Structure: span[data-chord] > span (chord name) + span (position indicator, optional)
            let chordName = child.getAttribute('data-chord-name') || ''; // Use stored original name
            let chordPosition = null;
            const chordId = child.getAttribute('data-chord-id'); // Get chord ID if present
            
            // Use children instead of querySelectorAll for better performance
            const childSpans = child.children;
            
            // If data attribute is missing, fall back to reading from display (for backward compatibility)
            if (!chordName) {
              if (childSpans.length > 0) {
                // First span is the formatted chord name (display)
                chordName = childSpans[0].textContent.trim();
              } else {
                // Fallback: use textContent if structure is unexpected
                chordName = child.textContent.trim();
              }
            }
            
            // Extract position from child spans (always check, as position isn't stored in data attribute)
            if (childSpans.length > 1) {
              const positionText = childSpans[1].textContent.trim();
              const positionNum = parseInt(positionText, 10);
              if (!isNaN(positionNum) && positionNum > 1) {
                chordPosition = positionNum;
              }
            }
            
            // Reconstruct chord marker with position and ID if present
            // Format: [C:2:abc123] or [C::abc123] or [C:2] or [C]
            let chordMarker;
            if (chordId) {
              chordMarker = chordPosition
                ? `[${chordName}:${chordPosition}:${chordId}]`
                : `[${chordName}::${chordId}]`;
            } else {
              chordMarker = chordPosition 
                ? `[${chordName}:${chordPosition}]` 
                : `[${chordName}]`;
            }
            text += chordMarker;
          } else if (child.tagName === 'DIV' || child.tagName === 'P') {
            // Block elements represent line breaks in contenteditable
            // Check if this is an empty block element (only whitespace/zero-width spaces)
            const blockText = child.textContent.replace(/\u200B/g, '').trim();
            const isEmpty = blockText === '' && child.children.length === 0;
            
            if (isEmpty) {
              // Empty DIV/P = one line break; always add newline so consecutive empty lines are preserved
              text += '\n';
            } else {
              // Block element with content - add newline before (if there's already content)
              if (text.length > 0 && !text.endsWith('\n')) {
                text += '\n';
              }
              // Recursively traverse element children
              traverse(child);
              // Add newline after this block element (if not the last child)
              if (i < node.childNodes.length - 1) {
                text += '\n';
              }
            }
          } else {
            // Recursively traverse element children
            traverse(child);
          }
        }
      }
    };
    
    traverse(editorRef.current);
    return text;
  };

  // Update contenteditable with styled content
  const updateEditorContent = (text) => {
    if (!editorRef.current) return;
    
    // Parse text and create styled HTML, handling line breaks, headings, and instructions
    const lines = text.split('\n');
    const fragment = document.createDocumentFragment();

    lines.forEach((line, lineIndex) => {
      // Check if this line is a heading (allow empty so {heading:} renders as styled block)
      const headingMatch = line.match(/^\{heading:(.*)\}$/);
      if (headingMatch) {
        const headingText = headingMatch[1].trim();
        const p = document.createElement('p');
        p.className = 'text-lg font-bold text-gray-800 mt-4 mb-0 first:mt-0';
        p.setAttribute('data-heading', 'true');
        p.setAttribute('data-heading-text', headingText);
        p.setAttribute('contenteditable', 'true');
        // Use zero-width space when empty so cursor can be placed inside (empty elements can misbehave)
        p.textContent = headingText || '\u200B';
        fragment.appendChild(p);
        // No <br> after heading: the block <p> already forces the next content onto the next line
        return;
      }
      
      // Check if this line is an instruction (allow empty so {instruction:} renders as styled block)
      const instructionMatch = line.match(/^\{instruction:(.*)\}$/);
      if (instructionMatch) {
        const instructionText = instructionMatch[1].trim();
        const p = document.createElement('p');
        p.className = 'text-sm italic text-gray-600 mt-2 mb-0 border-l-2 border-gray-300 pl-3';
        p.setAttribute('data-instruction', 'true');
        p.setAttribute('data-instruction-text', instructionText);
        p.setAttribute('contenteditable', 'true');
        p.textContent = instructionText || '\u200B';
        fragment.appendChild(p);
        // No <br> after instruction: the block <p> already forces the next content onto the next line
        return;
      }
      
      // Regular line - parse for chords
      // Regex matches chord markers: [C], [C:2], [C::id], [C:2:id]
      // The pattern [^\]]+ matches one or more characters that are not ], which correctly handles IDs
      const parts = line.split(/(\[[^\]]+\])/);
      
      parts.forEach((part) => {
        if (part.match(/^\[([^\]]+)\]$/)) {
          // This is a chord marker - extract and parse it
          const chordText = part.slice(1, -1); // Remove brackets
          
          // Parse chord format: "C:2:abc123" or "C::abc123" or "C:2" or "C"
          // Defensive parsing ensures IDs are extracted but never displayed
          let chordName = chordText;
          let chordPosition = 1;
          let chordId = null;
          
          // Try to match format with ID: "C:2:abc123" or "C::abc123"
          const idMatch = chordText.match(/^(.+?):(\d*):(.+)$/);
          if (idMatch) {
            chordName = idMatch[1].trim();
            const positionStr = idMatch[2];
            chordId = idMatch[3].trim();
            chordPosition = positionStr ? parseInt(positionStr, 10) || 1 : 1;
          } else {
            // Try to match format without ID: "C:2" or "C"
            const positionMatch = chordText.match(/^(.+):(\d+)$/);
            if (positionMatch) {
              chordName = positionMatch[1].trim();
              chordPosition = parseInt(positionMatch[2], 10) || 1;
            }
          }
          
          const span = document.createElement('span');
          span.className = 'inline-flex items-center gap-1.5 px-2 py-1 bg-primary-100 text-primary-700 rounded text-sm font-medium';
          span.setAttribute('data-chord', 'true');
          span.setAttribute('data-chord-name', chordName); // Store original chord name for reconstruction
          if (chordId) {
            span.setAttribute('data-chord-id', chordId); // Store chord ID for reconstruction
          }
          span.setAttribute('contenteditable', 'false'); // Prevent editing within chord spans
          
          // Add chord name text (formatted for display) - DO NOT include ID in display
          const chordNameSpan = document.createElement('span');
          chordNameSpan.textContent = formatChordNameForDisplay(chordName);
          span.appendChild(chordNameSpan);
          
          // Add position indicator if position > 1
          if (chordPosition > 1) {
            const positionSpan = document.createElement('span');
            positionSpan.className = 'inline-flex items-center justify-center rounded-full bg-primary-700 text-white text-xs font-medium leading-[1em] min-w-[1em] px-1';
            positionSpan.textContent = chordPosition.toString();
            span.appendChild(positionSpan);
          }
          
          fragment.appendChild(span);
          // Add zero-width space after chord for iOS Safari cursor positioning
          // iOS can only position cursor inside text nodes, not after non-editable elements
          fragment.appendChild(document.createTextNode('\u200B'));
        } else if (part) {
          // Regular text
          const textNode = document.createTextNode(part);
          fragment.appendChild(textNode);
        }
      });
      
      // Add line break (except after last line)
      if (lineIndex < lines.length - 1) {
        fragment.appendChild(document.createElement('br'));
      }
    });

    editorRef.current.innerHTML = '';
    editorRef.current.appendChild(fragment);
  };

  // Sync editor content with value prop (only if different and not skipping sync)
  const lastValueRef = useRef(value);
  useEffect(() => {
    if (!editorRef.current) return;
    if (skipSyncRef.current) {
      skipSyncRef.current = false;
      lastValueRef.current = value;
      return;
    }
    if (value === lastValueRef.current) return;
    const currentText = getTextFromEditor();
    if (currentText !== value) {
      const cursorPos = getCursorPosition();
      lastValueRef.current = value;
      updateEditorContent(value || '');
      // Restore cursor after a brief delay; skip if insertElement ran in between (it sets suppressSyncCursorRef)
      setTimeout(() => {
        if (suppressSyncCursorRef.current) return;
        try {
          setCursorCallerRef.current = 'sync-effect';
          setCursorPosition(Math.min(cursorPos, (value || '').length));
        } catch (e) {
          const range = document.createRange();
          const selection = window.getSelection();
          range.selectNodeContents(editorRef.current);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }, 0);
    } else {
      lastValueRef.current = value;
    }
  }, [value]);

  // Place cursor after insert-section: runs after commit so sync effect and re-render have run
  useEffect(() => {
    const pos = pendingSectionCursorRef.current;
    if (pos === null || !editorRef.current) return;
    pendingSectionCursorRef.current = null;
    requestAnimationFrame(() => {
      if (!editorRef.current) return;
      setCursorCallerRef.current = 'insertElement-effect';
      setCursorPosition(pos);
    });
  }, [value]);

  // Keep last known cursor position when selection is in editor (for Section mousedown capture)
  useEffect(() => {
    const onSelectionChange = () => {
      if (!editorRef.current) return;
      const sel = window.getSelection();
      if (sel?.anchorNode && editorRef.current.contains(sel.anchorNode)) {
        try {
          lastCursorPositionInEditorRef.current = getCursorPosition();
        } catch (_) {}
      }
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, []);

  const handleKeyDown = (e) => {
    if (showDropdown) {
      // Modal is open - keyboard navigation is handled by the modal component
      // We don't need to handle anything here
    } else {
      // Handle chord deletion with single keypress
      if (e.key === 'Backspace' || e.key === 'Delete') {
        const currentText = getTextFromEditor();
        const cursorPos = getCursorPosition();
        
        if (e.key === 'Backspace') {
          const chordInfo = findChordAtPosition(currentText, cursorPos);
          if (chordInfo) {
            e.preventDefault();
            const newText = currentText.slice(0, chordInfo.start) + currentText.slice(chordInfo.end);
            // Update DOM directly and skip sync to prevent re-render interference
            skipSyncRef.current = true;
            updateEditorContent(newText);
            lastValueRef.current = newText;
            onChange({ target: { value: newText } });
            setTimeout(() => {
              setCursorCallerRef.current = 'backspace-chord';
              setCursorPosition(chordInfo.start);
              editorRef.current?.focus();
            }, 0);
            return;
          }
        } else if (e.key === 'Delete') {
          const chordInfo = findChordAtPosition(currentText, cursorPos);
          if (chordInfo && cursorPos < chordInfo.end) {
            e.preventDefault();
            const newText = currentText.slice(0, chordInfo.start) + currentText.slice(chordInfo.end);
            // Update DOM directly and skip sync to prevent re-render interference
            skipSyncRef.current = true;
            updateEditorContent(newText);
            lastValueRef.current = newText;
            onChange({ target: { value: newText } });
            setTimeout(() => {
              setCursorCallerRef.current = 'delete-chord';
              setCursorPosition(chordInfo.start);
              editorRef.current?.focus();
            }, 0);
            return;
          }
        }
      } else if (e.key === 'Enter') {
        const selection = window.getSelection();
        if (selection.rangeCount === 0 || !editorRef.current) {
          // Fall through to normal Enter if needed
        } else {
          const anchorNode = selection.anchorNode;
          const el = anchorNode && (anchorNode.nodeType === Node.ELEMENT_NODE ? anchorNode : anchorNode.parentElement);
          const sectionEl = el && el.closest && el.closest('[data-heading], [data-instruction]');
          if (sectionEl && editorRef.current.contains(sectionEl)) {
            // Cursor is inside a heading or instruction: close section, newline, return to lyrics
            e.preventDefault();
            e.stopPropagation();
            justHandledEnterRef.current = true;
            skipSyncRef.current = true;

            const currentText = getTextFromEditor();
            const cursorPos = getCursorPosition();
            let lineStart = 0;
            for (let i = cursorPos - 1; i >= 0; i--) {
              if (currentText[i] === '\n') {
                lineStart = i + 1;
                break;
              }
            }
            let lineEnd = currentText.length;
            for (let i = cursorPos; i < currentText.length; i++) {
              if (currentText[i] === '\n') {
                lineEnd = i;
                break;
              }
            }
            const line = currentText.substring(lineStart, lineEnd);
            if (/^\{heading:.*\}$/.test(line) || /^\{instruction:.*\}$/.test(line)) {
              const before = currentText.substring(0, lineEnd);
              const after = currentText.substring(lineEnd);
              const newText = before + '\n' + after;
              const newCursorPos = lineEnd + 1;

              skipSyncRef.current = true;
              updateEditorContent(newText);
              lastValueRef.current = newText;
              onChange({ target: { value: newText } });
              setTimeout(() => {
                setCursorCallerRef.current = 'enter-section';
                setCursorPosition(newCursorPos);
                editorRef.current?.focus();
              }, 0);
              setTimeout(() => {
                justHandledEnterRef.current = false;
                skipSyncRef.current = false;
              }, 100);
              return;
            }
            justHandledEnterRef.current = false;
            skipSyncRef.current = false;
          }
        }

        // Default: intercept Enter to prevent browser from creating DIV/P elements, insert <br>
        e.preventDefault();
        e.stopPropagation();
        if (editorRef.current) {
          justHandledEnterRef.current = true;
          skipSyncRef.current = true;

          const selection = window.getSelection();
          if (selection.rangeCount === 0) {
            justHandledEnterRef.current = false;
            skipSyncRef.current = false;
            return;
          }

          const range = selection.getRangeAt(0);
          const br = document.createElement('br');
          range.deleteContents();
          range.insertNode(br);
          range.setStartAfter(br);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);

          const text = getTextFromEditor();
          lastValueRef.current = text;
          onChange({ target: { value: text } });
          setTimeout(() => {
            justHandledEnterRef.current = false;
            skipSyncRef.current = false;
          }, 100);
        }
      } else if (e.key === '/' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        if (editorRef.current) {
          // CRITICAL: Read cursor position IMMEDIATELY, before any state updates or focus changes
          // The simplified getCursorPosition() returns an absolute character offset (like selectionStart)
          const cursorPos = getCursorPosition();
          
          // Store immediately - this must happen synchronously
          insertPositionRef.current = cursorPos;
          
          // Debug logging
          const currentText = getTextFromEditor();
          console.log('[StyledChordEditor] / pressed - captured position:', cursorPos, 'text length:', currentText.length,
            'text around pos:', JSON.stringify(currentText.substring(Math.max(0, cursorPos - 3), Math.min(currentText.length, cursorPos + 3))));
          
          // Now update UI state (this is async but position is already captured in ref)
          setQuery('');
          setSelectedIndex(0);
          setShowDropdown(true);
        }
      }
    }
  };

  const handleInput = (e) => {
    // Skip processing entirely if we just handled Enter programmatically
    // The Enter handler already updated the DOM and called onChange
    if (justHandledEnterRef.current) {
      return;
    }
    
    // Update data attributes for headings and instructions when their content changes
    // If user deleted all content from a heading/instruction, replace with BR so following lyrics aren't styled as heading
    if (editorRef.current) {
      const specialElements = editorRef.current.querySelectorAll('[data-heading], [data-instruction]');
      if (specialElements.length > 0) {
        Array.from(specialElements).forEach((el) => {
          const text = (el.textContent || '').replace(/\u200B/g, '').trim();
          if (text === '') {
            // Empty heading/instruction: remove the block so cursor and following content are normal lyrics
            const br = document.createElement('br');
            el.parentNode?.replaceChild(br, el);
            return;
          }
          if (el.hasAttribute('data-heading')) {
            el.setAttribute('data-heading-text', text);
          } else if (el.hasAttribute('data-instruction')) {
            el.setAttribute('data-instruction-text', text);
          }
        });
      }
      
      // Normalize DIV/P elements only when they exist (most of the time they won't)
      // Use a single efficient query
      const blockElements = editorRef.current.querySelectorAll('div:not([data-heading]):not([data-instruction]), p:not([data-heading]):not([data-instruction])');
      
      if (blockElements.length > 0) {
        // Convert to array once and process
        Array.from(blockElements).forEach((el) => {
          // Skip if element is no longer in the DOM (might have been removed by previous normalization)
          if (!el.parentNode) {
            return;
          }
          
          // Check if the block element is empty (only whitespace/zero-width spaces)
          const blockText = el.textContent.replace(/\u200B/g, '').trim();
          const isEmpty = blockText === '' && el.children.length === 0;
          
          if (isEmpty) {
            // Replace empty DIV/P with BR tag
            const br = document.createElement('br');
            el.parentNode?.replaceChild(br, el);
          } else {
            // For DIV/P with content, move content out and replace with BR
            // This handles cases where content was pasted into a DIV/P
            const fragment = document.createDocumentFragment();
            while (el.firstChild) {
              fragment.appendChild(el.firstChild);
            }
            const br = document.createElement('br');
            const parent = el.parentNode;
            const nextSibling = el.nextSibling;
            parent?.replaceChild(br, el);
            if (fragment.hasChildNodes()) {
              // Insert fragment after BR, or append if BR is last
              if (nextSibling) {
                parent?.insertBefore(fragment, nextSibling);
              } else {
                parent?.appendChild(fragment);
              }
            }
          }
        });
      }
    }
    
    // Always process input events for normal typing
    // The skipSyncRef is only for the sync effect, not for blocking input handling
    // We always need to capture user typing, but we can optimize the DOM read
    
    // Clear any existing timer
    if (inputDebounceTimerRef.current) {
      clearTimeout(inputDebounceTimerRef.current);
    }
    
    // Use a very short debounce (0ms) to batch rapid keystrokes
    // This ensures we read the DOM after all synchronous DOM modifications (like normalization) are complete
    inputDebounceTimerRef.current = setTimeout(() => {
      const text = getTextFromEditor();
      // Keep last known cursor position for Section menu (captureCursorPosition uses it)
      try {
        if (editorRef.current?.contains(document.activeElement)) {
          lastCursorPositionInEditorRef.current = getCursorPosition();
        }
      } catch (_) {}
      // Only call onChange if text actually changed (avoid unnecessary re-renders)
      if (text !== lastValueRef.current) {
        lastValueRef.current = text;
        onChange({ target: { value: text } });
      }
      inputDebounceTimerRef.current = null;
    }, 0);
  };

  const insertChord = (chordName, explicitPosition = null, explicitChordId = null) => {
    if (!editorRef.current) return;
    
    // Get text directly from editor to ensure we have the most current value
    const currentText = getTextFromEditor();
    let insertPos = insertPositionRef.current;
    
    // Validate and clamp insert position to valid range
    // The simplified getCursorPosition() always returns a valid position, but we still clamp for safety
    if (insertPos < 0) {
      insertPos = 0;
    }
    if (insertPos > currentText.length) {
      insertPos = currentText.length;
    }
    
    // Debug logging
    // Split text at insertion point (like textarea: text.substring(0, selectionStart) + chord + text.substring(selectionStart))
    let before = currentText.substring(0, insertPos);
    let after = currentText.substring(insertPos);

    const charBefore = before.length > 0 ? before[before.length - 1] : null;
    const charAfter = after.length > 0 ? after[0] : null;
    
    const isAlphanumeric = (char) => char && /[a-zA-Z0-9]/.test(char);
    const isWithinWord = isAlphanumeric(charBefore) && isAlphanumeric(charAfter);
    
    let spaceBefore = '';
    let spaceAfter = '';
    
    if (!isWithinWord) {
      if (isAlphanumeric(charBefore)) {
        spaceBefore = ' ';
      }
      // Don't add space after when at start of line - chord goes directly before word, cursor right after chord
      if (isAlphanumeric(charAfter) && charBefore !== '\n') {
        spaceAfter = ' ';
      }
    }

    // Get the selected position for this chord
    // Priority: explicitPosition (passed directly) > storedPosition > chordData position > default 1
    const storedPosition = selectedPositions.get(chordName);
    const chordData = getChordData(chordName);
    let chordPosition = explicitPosition !== null ? explicitPosition : (storedPosition || chordData?.position || 1);
    
    // Get chordId: explicitChordId > chordData.id > null
    const chordId = explicitChordId || chordData?.id || null;
    
    // Ensure position is stored
    if (chordPosition && chordPosition > 1) {
      handleChordPositionSelect(chordName, chordPosition);
    }

    // Format chord with position suffix if position > 1: [C:2], otherwise just [C]
    // Include chordId in format if available: [C:2:abc123] or [C::abc123]
    // This allows the ID to be parsed and stored when saving, but we keep text readable
    let chordText = chordPosition > 1 ? `${chordName}:${chordPosition}` : chordName;
    if (chordId) {
      // Include ID in format: [C:2:abc123] or [C::abc123] (if position is 1)
      chordText = chordPosition > 1 ? `${chordName}:${chordPosition}:${chordId}` : `${chordName}::${chordId}`;
    }
    const newText = before + spaceBefore + `[${chordText}]` + spaceAfter + after;
    
    // Update DOM directly and skip sync to prevent re-render interference
    skipSyncRef.current = true;
    updateEditorContent(newText);
    lastValueRef.current = newText;
    onChange({ target: { value: newText } });

    // Calculate cursor position for directly after the chord (before any trailing space).
    // Two spaces can appear after chords: (1) U+0020 regular space for readability when spaceAfter;
    // (2) U+200B zero-width space in the DOM only (after each chord span for iOS cursor positioning,
    // stripped in getTextFromEditor). Cursor math differs by context: use -1 for mid-word and
    // start-of-line to land correctly after the chord.
    const atStartOfLine = !before.length || before.endsWith('\n');
    const bracketLen = (isWithinWord || atStartOfLine) ? -1 : 0;
    const newCursorPos = insertPos + spaceBefore.length + chordText.length + bracketLen;
    
    // Use double requestAnimationFrame for iOS Safari compatibility
    // iOS needs the first frame for DOM update, second frame for cursor rendering
    requestAnimationFrame(() => {
      editorRef.current?.focus({ preventScroll: true });
      setCursorCallerRef.current = 'insertChord';
      setCursorPosition(newCursorPos);
      
      // Second RAF specifically for iOS Safari cursor rendering
      requestAnimationFrame(() => {
        if (editorRef.current && document.activeElement === editorRef.current) {
          setCursorCallerRef.current = 'insertChord-raf2';
          setCursorPosition(newCursorPos);
        }
      });
    });

    setShowDropdown(false);
    setQuery('');
  };

  const handleChordClick = (chordName, chordPosition = null, chordId = null) => {
    if (!chordName) return;
    // If position is provided, use it; otherwise get from chord data
    if (chordPosition !== null && chordPosition !== undefined) {
      // Store the position for this chord
      handleChordPositionSelect(chordName, chordPosition);
      // Pass position and ID directly to insertChord to avoid state timing issues
      insertChord(chordName, chordPosition, chordId);
    } else {
      insertChord(chordName, null, chordId);
    }
  };

  const insertElement = (elementType, onSectionInsertDone) => {
    if (!editorRef.current) return;
    
    // Get text directly from editor to ensure we have the most current value
    const currentText = getTextFromEditor();
    let insertPos = insertPositionRef.current;
    
    // If captured position is "end" (common when Section mousedown loses selection), use last known
    if (insertPos === currentText.length && currentText.length > 0 && lastCursorPositionInEditorRef.current < currentText.length) {
      insertPos = lastCursorPositionInEditorRef.current;
    }
    // Clamp insert position to valid range
    if (insertPos < 0) insertPos = 0;
    if (insertPos > currentText.length) insertPos = currentText.length;
    
    
    const before = currentText.substring(0, insertPos);
    const originalAfter = currentText.substring(insertPos);
    // Honour one blank line if the user added it (e.g. Return twice before typing heading), but strip excess
    const hadBlankLineAbove = /^[\n\r]/.test(originalAfter);
    let after = originalAfter.replace(/^[\n\r]+/, '');
    
    // Check if we're at the start of a line (or empty line)
    const isAtLineStart = before === '' || before.endsWith('\n');
    const nextCharIsNewline = after.length > 0 && (after[0] === '\n' || after[0] === '\r');
    const isAtLineEnd = after === '' || nextCharIsNewline;
    
    // Determine what to insert
    let marker = '';
    if (elementType === 'heading') {
      marker = '{heading:}';
    } else if (elementType === 'instruction') {
      marker = '{instruction:}';
    }
    
    // Add newline before if not at start and not already on new line
    let newlineBefore = '';
    if (!isAtLineStart && !before.endsWith('\n')) {
      newlineBefore = '\n';
    }
    
    // If user had created a blank line above (e.g. Return twice), keep exactly one blank line before the heading
    const blankLineBeforeMarker = hadBlankLineAbove ? '\n' : '';
    
    // Add exactly one newline after marker when there is following content (so no extra empty lines)
    let newlineAfter = '';
    if (after.length > 0 && !nextCharIsNewline) {
      newlineAfter = '\n';
    }
    
    const newText = before + newlineBefore + blankLineBeforeMarker + marker + newlineAfter + after;
    // Position at start of marker so setCursorPosition places cursor *inside* the heading (not after it)
    const targetPos = insertPos + newlineBefore.length + blankLineBeforeMarker.length;

    // Update DOM and set cursor in same tick so nothing can overwrite the selection.
    updateEditorContent(newText);
    lastValueRef.current = newText;
    skipSyncRef.current = true;
    suppressSyncCursorRef.current = true; // any pending sync-effect setCursorPosition will skip
    // Notify parent synchronously; effect will place cursor after commit
    onChange({ target: { value: newText } });
    pendingSectionCursorRef.current = targetPos;

    const placeCursorInElement = (element) => {
      if (!element || !editorRef.current) return;
      if (!editorRef.current.contains(element)) return;
      const selection = window.getSelection();
      const range = document.createRange();
      const cursorNode = element.firstChild && element.firstChild.nodeType === Node.TEXT_NODE
        ? element.firstChild
        : element;
      range.setStart(cursorNode, 0);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    };

    editorRef.current?.focus({ preventScroll: true });

    // Parent already updated (onChange above). Close dropdown; cursor is placed in useEffect after commit.
    setTimeout(() => {
      setShowDropdown(false);
      setQuery('');
      setTimeout(() => {
        setTimeout(() => {
          suppressSyncCursorRef.current = false;
        }, 50);
        onSectionInsertDone?.();
      }, 0);
    }, 0);
  };

  // Find the heading or instruction element at the given character position (used after insertElement)
  const findElementAtPosition = (editor, pos) => {
    if (!editor) return null;
    const allNodes = [];
    const collectNodes = (node) => {
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === Node.TEXT_NODE) {
          allNodes.push({ type: 'text', node: child });
        } else if (child.tagName === 'BR') {
          allNodes.push({ type: 'br', node: child });
        } else if (child.nodeType === Node.ELEMENT_NODE && child.hasAttribute('data-chord')) {
          allNodes.push({ type: 'chord', node: child });
        } else if (child.nodeType === Node.ELEMENT_NODE && (child.hasAttribute('data-heading') || child.hasAttribute('data-instruction'))) {
          allNodes.push({ type: 'element', node: child });
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          collectNodes(child);
        }
      }
    };
    collectNodes(editor);
    let currentPos = 0;
    for (let i = 0; i < allNodes.length; i++) {
      const item = allNodes[i];
      if (item.type === 'text') {
        const effectiveLength = (item.node.textContent.replace(/\u200B/g, '') || '').length;
        if (effectiveLength === 0) continue;
        if (currentPos <= pos && pos < currentPos + effectiveLength) return null;
        currentPos += effectiveLength;
      } else if (item.type === 'br') {
        if (currentPos <= pos && pos < currentPos + 1) return null;
        currentPos += 1;
      } else if (item.type === 'chord') {
        const chordLength = getChordMarkerLength(item.node);
        if (currentPos <= pos && pos < currentPos + chordLength) return null;
        currentPos += chordLength;
      } else if (item.type === 'element') {
        const elementLength = getElementMarkerLength(item.node);
        if (currentPos <= pos && pos < currentPos + elementLength) return item.node;
        currentPos += elementLength;
      }
    }
    return null;
  };

  // Handle custom chord save
  const handleCustomChordSave = async (chordData) => {
    try {
      // Always save to personal library - requires userId
      if (!userId) {
        alert('You must be logged in to save custom chords.');
        return;
      }
      await createPersonalChord(chordData, userId);
      
      // Insert chord name into song
      insertChord(chordData.name);
      setShowCustomChordModal(false);
    } catch (error) {
      console.error('Error saving custom chord:', error);
      console.error('Error details:', {
        message: error?.message,
        name: error?.name,
        stack: error?.stack,
      });
      alert(`Error saving chord: ${error?.message || 'Unknown error'}. Please try again.`);
    }
  };


  // Initialize content on mount
  useEffect(() => {
    if (editorRef.current && value) {
      updateEditorContent(value);
    }
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        className={className}
        data-placeholder={placeholder}
        style={{
          minHeight: `${(rows || 20) * 1.5}rem`,
        }}
      />
      <style>{`
        [contenteditable][data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }
      `}</style>
      
      {/* Full-library search: only mounts when modal open and user has typed (deferred load) */}
      {showDropdown && query?.trim() && !isFretPatternQuery(trimmedQuery, stringCount) && !isFretPrefixOnly && (
        <ChordSearchFullResults
          query={query}
          userId={userId}
          instrument={instrument}
          tuning={tuning}
          usedChordNames={usedChordNames}
          onResults={setFullSearchResults}
        />
      )}
      {/* Chord Insertion Modal - portaled to body so it works correctly inside scroll containers */}
      {showDropdown && createPortal(
        <ChordInsertionModal
          isOpen={showDropdown}
          query={query}
          setQuery={setQuery}
          selectedIndex={selectedIndex}
          setSelectedIndex={setSelectedIndex}
          filteredElements={filteredElements}
          usedFiltered={usedFiltered}
          libraryFiltered={effectiveLibrary.libraryFiltered}
          libraryFilteredCommon={effectiveLibrary.libraryFilteredCommon}
          libraryFilteredAllForDisplay={effectiveLibrary.libraryFilteredAllForDisplay}
          personalChordNames={personalChordNames}
          instrument={instrument}
          tuning={tuning}
          onSelectElement={insertElement}
          onSelectChord={handleChordClick}
          onCreateCustom={() => {
            setShowCustomChordModal(true);
            setShowDropdown(false);
          }}
          onClose={handleModalClose}
          onInsert={handleModalInsert}
          modalRef={modalRef}
          searchInputRef={searchInputRef}
        />,
        document.body
      )}
      
      {/* Custom Chord Modal */}
      <CustomChordModal
        isOpen={showCustomChordModal}
        onClose={() => setShowCustomChordModal(false)}
        onSave={handleCustomChordSave}
        instrument={instrument}
        tuning={tuning}
        userId={userId}
        databaseChords={dbChords}
      />
    </div>
  );
});

export default StyledChordEditor;
