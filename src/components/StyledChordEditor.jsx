import { useRef, useEffect, useState } from 'react';
import { findChord } from '../utils/chord-library';
import { useChordAutocomplete } from '../hooks/useChordAutocomplete';
import ChordInsertionModal from './ChordInsertionModal';
import ChordInsertionFAB from './ChordInsertionFAB';
import CustomChordModal from './CustomChordModal';
import ChordVariationsModal from './ChordVariationsModal';
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

export default function StyledChordEditor({ 
  value, 
  onChange, 
  placeholder, 
  className, 
  rows, 
  required,
  instrument = 'ukulele',
  tuning = 'ukulele_standard',
  userId = null
}) {
  const editorRef = useRef(null);
  const containerRef = useRef(null);
  const modalRef = useRef(null);
  const searchInputRef = useRef(null);
  const skipSyncRef = useRef(false);
  const insertPositionRef = useRef(0);
  const [isFocused, setIsFocused] = useState(false);

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
    showVariationsModal,
    setShowVariationsModal,
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
    handleChordPositionSelect,
  } = useChordAutocomplete({ value, instrument, tuning, userId });

  // Handle focus/blur for FAB visibility
  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleBlur = () => {
    // Delay to check if focus moved to modal
    setTimeout(() => {
      if (document.activeElement !== searchInputRef.current && 
          !modalRef.current?.contains(document.activeElement)) {
        setIsFocused(false);
      }
    }, 100);
  };

  // Handle FAB mousedown to capture cursor position before blur
  const handleFABMouseDown = (e) => {
    // Prevent default to avoid immediate focus change
    e.preventDefault();
    if (editorRef.current) {
      // CRITICAL: Capture cursor position BEFORE any focus changes
      // Read position synchronously while editor still has focus
      // The simplified getCursorPosition() returns an absolute character offset (like selectionStart)
      const cursorPos = getCursorPosition();
      
      // Store the position - getCursorPosition() always returns a valid number
      insertPositionRef.current = cursorPos;
      
      // Debug logging
      const currentText = getTextFromEditor();
      console.log('[StyledChordEditor] FAB clicked - captured position:', cursorPos, 'text length:', currentText.length,
        'text around pos:', JSON.stringify(currentText.substring(Math.max(0, cursorPos - 3), Math.min(currentText.length, cursorPos + 3))));
      
      // Now open the modal
      setQuery('');
      setSelectedIndex(0);
      setShowDropdown(true);
    }
  };

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
    const showMoreIndex = filteredElements.length + usedFiltered.length + libraryFiltered.length;
    const createCustomIndex = showMoreIndex + 1;
    
    // Check if "Show more variations" is selected
    if (selectedIndex === showMoreIndex) {
      setShowVariationsModal(true);
      setShowDropdown(false);
    } else if (selectedIndex === createCustomIndex) {
      // "Create custom chord" is selected
      setShowCustomChordModal(true);
      setShowDropdown(false);
    } else if (selectedIndex < filteredElements.length) {
      // Element selected
      const element = filteredElements[selectedIndex];
      insertElement(element.type);
    } else {
      // Chord selected
      const chordIndex = selectedIndex - filteredElements.length;
      const allFiltered = [...usedFiltered, ...libraryFiltered];
      if (allFiltered[chordIndex]) {
        const selectedChord = allFiltered[chordIndex];
        const chordName = selectedChord.name || selectedChord;
        const chordPosition = selectedChord.position;
        const chordId = selectedChord.id || null;
        // Pass position and ID directly to insertChord to avoid state timing issues
        insertChord(chordName, chordPosition || null, chordId);
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
    
    // If cursor is at the editor level (empty or end), return text length
    if (containerNode === editorRef.current || containerNode === editorRef.current.parentNode) {
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
            // Chord span - counts as [ChordName] or [ChordName:Position]
            const childSpans = child.querySelectorAll('span');
            let chordName = child.getAttribute('data-chord-name') || '';
            
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
            
            const chordMarker = chordPosition 
              ? `[${chordName}:${chordPosition}]` 
              : `[${chordName}]`;
            
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
          // There should be a zero-width space text node after each chord for iOS cursor positioning
          const nextItem = allNodes[i + 1];
          if (nextItem && nextItem.type === 'text') {
            // Position at start of next text node (zero-width space or regular text)
            selection.removeAllRanges();
            selection.collapse(nextItem.node, 0);
          } else {
            // Fallback if no text node (shouldn't happen with zero-width spaces)
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
          // Position is within or right after the element
          // Place cursor right after the element
          range.setStartAfter(item.node);
          range.setEndAfter(item.node);
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
            // This is a styled heading element
            const headingText = child.getAttribute('data-heading-text') || child.textContent.trim();
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
            // This is a styled instruction element
            const instructionText = child.getAttribute('data-instruction-text') || child.textContent.trim();
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
            const childSpans = child.querySelectorAll('span');
            let chordName = child.getAttribute('data-chord-name') || ''; // Use stored original name
            let chordPosition = null;
            const chordId = child.getAttribute('data-chord-id'); // Get chord ID if present
            
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
            
            // Extract position from child spans
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
            // Add newline before this block element (if there's already content)
            if (text.length > 0 && !text.endsWith('\n')) {
              text += '\n';
            }
            // Recursively traverse element children
            traverse(child);
            // Add newline after this block element (if not the last child)
            if (i < node.childNodes.length - 1) {
              text += '\n';
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
      // Check if this line is a heading
      const headingMatch = line.match(/^\{heading:([^}]+)\}$/);
      if (headingMatch) {
        const headingText = headingMatch[1].trim();
        const p = document.createElement('p');
        p.className = 'text-lg font-bold text-gray-800 mt-4 mb-2 first:mt-0';
        p.setAttribute('data-heading', 'true');
        p.setAttribute('data-heading-text', headingText);
        p.setAttribute('contenteditable', 'true');
        p.textContent = headingText;
        fragment.appendChild(p);
        // Add line break after heading (except after last line)
        if (lineIndex < lines.length - 1) {
          fragment.appendChild(document.createElement('br'));
        }
        return;
      }
      
      // Check if this line is an instruction
      const instructionMatch = line.match(/^\{instruction:([^}]+)\}$/);
      if (instructionMatch) {
        const instructionText = instructionMatch[1].trim();
        const p = document.createElement('p');
        p.className = 'text-sm italic text-gray-600 my-2 border-l-2 border-gray-300 pl-3';
        p.setAttribute('data-instruction', 'true');
        p.setAttribute('data-instruction-text', instructionText);
        p.setAttribute('contenteditable', 'true');
        p.textContent = instructionText;
        fragment.appendChild(p);
        // Add line break after instruction (except after last line)
        if (lineIndex < lines.length - 1) {
          fragment.appendChild(document.createElement('br'));
        }
        return;
      }
      
      // Regular line - parse for chords
      const parts = line.split(/(\[[^\]]+\])/);
      
      parts.forEach((part) => {
        if (part.match(/^\[([^\]]+)\]$/)) {
          // This is a chord
          const chordText = part.slice(1, -1); // Remove brackets
          
          // Parse chord format: "C:2:abc123" or "C::abc123" or "C:2" or "C"
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
    
    lastValueRef.current = value;
    const currentText = getTextFromEditor();
    if (currentText !== value) {
      const cursorPos = getCursorPosition();
      updateEditorContent(value || '');
      // Restore cursor position after a brief delay
      setTimeout(() => {
        try {
          setCursorPosition(Math.min(cursorPos, (value || '').length));
        } catch (e) {
          // If cursor positioning fails, just set to end
          const range = document.createRange();
          const selection = window.getSelection();
          range.selectNodeContents(editorRef.current);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }, 0);
    }
  }, [value]);

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
              setCursorPosition(chordInfo.start);
              editorRef.current?.focus();
            }, 0);
            return;
          }
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
    // Update data attributes for headings and instructions when their content changes
    if (editorRef.current) {
      const headingElements = editorRef.current.querySelectorAll('[data-heading]');
      headingElements.forEach((el) => {
        const text = el.textContent.trim();
        el.setAttribute('data-heading-text', text);
      });
      
      const instructionElements = editorRef.current.querySelectorAll('[data-instruction]');
      instructionElements.forEach((el) => {
        const text = el.textContent.trim();
        el.setAttribute('data-instruction-text', text);
      });
    }
    
    const text = getTextFromEditor();
    onChange({ target: { value: text } });
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
    console.log('[StyledChordEditor] insertChord - position:', insertPos, 'text length:', currentText.length,
      'text around pos:', JSON.stringify(currentText.substring(Math.max(0, insertPos - 3), Math.min(currentText.length, insertPos + 3))));
    
    // Split text at insertion point (like textarea: text.substring(0, selectionStart) + chord + text.substring(selectionStart))
    const before = currentText.substring(0, insertPos);
    const after = currentText.substring(insertPos);

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
      if (isAlphanumeric(charAfter)) {
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

    // Calculate cursor position for after the inserted chord
    const newCursorPos = insertPos + spaceBefore.length + chordText.length + 2 + spaceAfter.length;
    
    // Use double requestAnimationFrame for iOS Safari compatibility
    // iOS needs the first frame for DOM update, second frame for cursor rendering
    requestAnimationFrame(() => {
      editorRef.current?.focus();
      setCursorPosition(newCursorPos);
      
      // Second RAF specifically for iOS Safari cursor rendering
      requestAnimationFrame(() => {
        if (editorRef.current && document.activeElement === editorRef.current) {
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

  const insertElement = (elementType) => {
    if (!editorRef.current) return;
    
    // Get text directly from editor to ensure we have the most current value
    const currentText = getTextFromEditor();
    let insertPos = insertPositionRef.current;
    
    // Clamp insert position to valid range
    if (insertPos < 0) insertPos = 0;
    if (insertPos > currentText.length) insertPos = currentText.length;
    
    
    const before = currentText.substring(0, insertPos);
    const after = currentText.substring(insertPos);
    
    // Check if we're at the start of a line (or empty line)
    const isAtLineStart = before === '' || before.endsWith('\n');
    const isAtLineEnd = after === '' || after.startsWith('\n');
    
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
    
    // Add newline after if not at end
    let newlineAfter = '';
    if (!isAtLineEnd && !after.startsWith('\n')) {
      newlineAfter = '\n';
    }
    
    const newText = before + newlineBefore + marker + newlineAfter + after;
    
    // Update DOM directly and skip sync to prevent re-render interference
    skipSyncRef.current = true;
    updateEditorContent(newText);
    lastValueRef.current = newText;
    onChange({ target: { value: newText } });
    
    // Set cursor position inside the marker (after the colon)
    setTimeout(() => {
      const newCursorPos = insertPos + newlineBefore.length + marker.length - 1; // -1 to position before closing brace
      setCursorPosition(newCursorPos);
      editorRef.current?.focus();
    }, 0);
    
    setShowDropdown(false);
    setQuery('');
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
        onFocus={handleFocus}
        onBlur={handleBlur}
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
      
      {/* Floating Action Button */}
      <ChordInsertionFAB
        onMouseDown={handleFABMouseDown}
        visible={isFocused && !showDropdown}
      />
      
      {/* Chord Insertion Modal */}
      <ChordInsertionModal
        isOpen={showDropdown}
        query={query}
        setQuery={setQuery}
        selectedIndex={selectedIndex}
        setSelectedIndex={setSelectedIndex}
        filteredElements={filteredElements}
        usedFiltered={usedFiltered}
        libraryFiltered={libraryFiltered}
        personalChordNames={personalChordNames}
        instrument={instrument}
        tuning={tuning}
        onSelectElement={insertElement}
        onSelectChord={handleChordClick}
        onShowVariations={() => {
          setShowVariationsModal(true);
          setShowDropdown(false);
        }}
        onCreateCustom={() => {
          setShowCustomChordModal(true);
          setShowDropdown(false);
        }}
        onClose={handleModalClose}
        onInsert={handleModalInsert}
        modalRef={modalRef}
        searchInputRef={searchInputRef}
      />
      
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
      
      {/* Chord Variations Modal */}
      <ChordVariationsModal
        isOpen={showVariationsModal}
        onClose={() => setShowVariationsModal(false)}
        onSelectChord={(chordName, chordPosition, chordId) => {
          handleChordClick(chordName, chordPosition, chordId);
        }}
        chords={allChordVariations}
        initialQuery={query}
        instrument={instrument}
        tuning={tuning}
        usedChordNames={usedChordNames}
        personalChordNames={personalChordNames}
      />
    </div>
  );
}
