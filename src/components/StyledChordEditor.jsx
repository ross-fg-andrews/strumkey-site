import { useRef, useEffect, useState } from 'react';
import { findChord } from '../utils/chord-library';
import { useChordAutocomplete } from '../hooks/useChordAutocomplete';
import ChordAutocompleteDropdown from './ChordAutocompleteDropdown';
import CustomChordModal from './CustomChordModal';
import ChordVariationsModal from './ChordVariationsModal';
import { createPersonalChord } from '../db/mutations';

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
  const dropdownRef = useRef(null);
  const skipSyncRef = useRef(false);
  const insertPositionRef = useRef(0);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });

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

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        editorRef.current &&
        !editorRef.current.contains(event.target)
      ) {
        setShowDropdown(false);
        setQuery('');
      }
    }

    if (showDropdown) {
      // Use a small delay to prevent immediate closure when opening
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 100);
      
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showDropdown, setShowDropdown, setQuery]);

  // Helper function to get chord marker text length from a chord span
  const getChordMarkerLength = (chordSpan) => {
    const childSpans = chordSpan.querySelectorAll('span');
    let chordName = '';
    let chordPosition = null;
    
    if (childSpans.length > 0) {
      chordName = childSpans[0].textContent.trim();
      if (childSpans.length > 1) {
        const positionText = childSpans[1].textContent.trim();
        const positionNum = parseInt(positionText, 10);
        if (!isNaN(positionNum) && positionNum > 1) {
          chordPosition = positionNum;
        }
      }
    } else {
      chordName = chordSpan.textContent.trim();
    }
    
    // Calculate length: [ChordName] or [ChordName:Position]
    return chordPosition 
      ? chordName.length + 1 + chordPosition.toString().length + 2 // [Name:Pos]
      : chordName.length + 2; // [Name]
  };

  // Get cursor position in contenteditable (accounting for <br> tags and chord spans)
  const getCursorPosition = () => {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return 0;
    
    const range = selection.getRangeAt(0);
    
    // CRITICAL FIX: Handle case where endContainer is the editor itself (common on empty lines)
    // When cursor is on an empty line, the browser might place the selection at the editor level
    if (range.endContainer === editorRef.current || range.endContainer === editorRef.current.parentNode) {
      // When endContainer is the editor, endOffset is the child node INDEX before the cursor
      // So if offset=2, cursor is before child[2], meaning we've passed children 0 and 1
      const offset = range.endOffset;
      let pos = 0;
      
      // Count all child nodes up to (but not including) the offset
      // This gives us the position RIGHT BEFORE the child at that index
      for (let i = 0; i < Math.min(offset, editorRef.current.childNodes.length); i++) {
        const child = editorRef.current.childNodes[i];
        if (child.nodeType === Node.TEXT_NODE) {
          pos += child.textContent.length;
        } else if (child.tagName === 'BR') {
          pos += 1; // Count <br> as one character (newline)
        } else if (child.nodeType === Node.ELEMENT_NODE && child.hasAttribute('data-chord')) {
          pos += getChordMarkerLength(child);
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          // For other elements (like divs), count their text content
          pos += child.textContent.length;
        }
      }
      
      return pos;
    }
    
    // Also check if endContainer is a BR tag itself (cursor positioned right after a <br>)
    if (range.endContainer.nodeType === Node.ELEMENT_NODE && range.endContainer.tagName === 'BR') {
      // Find the position of this BR in the editor
      const allNodes = [];
      const collectNodes = (node) => {
        for (let child = node.firstChild; child; child = child.nextSibling) {
          if (child.nodeType === Node.TEXT_NODE) {
            allNodes.push({ type: 'text', node: child });
          } else if (child.tagName === 'BR') {
            allNodes.push({ type: 'br', node: child });
          } else if (child.nodeType === Node.ELEMENT_NODE && child.hasAttribute('data-chord')) {
            allNodes.push({ type: 'chord', node: child });
          } else if (child.nodeType === Node.ELEMENT_NODE) {
            collectNodes(child);
          }
        }
      };
      collectNodes(editorRef.current);
      
      let pos = 0;
      for (const item of allNodes) {
        if (item.node === range.endContainer) {
          // Position is right after this BR
          pos += 1; // Count the <br> itself
          console.log('[StyledChordEditor] getCursorPosition - BR is container, calculated pos:', pos);
          return pos;
        }
        if (item.type === 'text') {
          pos += item.node.textContent.length;
        } else if (item.type === 'br') {
          pos += 1;
        } else if (item.type === 'chord') {
          pos += item.node.textContent.length + 2;
        }
      }
    }
    
    // Collect all nodes in order: text nodes, <br> elements, and chord spans
    const allNodes = [];
    const collectNodes = (node) => {
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === Node.TEXT_NODE) {
          allNodes.push({ type: 'text', node: child });
        } else if (child.tagName === 'BR') {
          allNodes.push({ type: 'br', node: child });
        } else if (child.nodeType === Node.ELEMENT_NODE && child.hasAttribute('data-chord')) {
          // Chord span - counts as [ChordName] in text
          allNodes.push({ type: 'chord', node: child });
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          // Recurse into other elements
          collectNodes(child);
        }
      }
    };
    collectNodes(editorRef.current);
    
    let pos = 0;
    let found = false;
    for (const item of allNodes) {
      if (item.node === range.endContainer) {
        pos += range.endOffset;
        found = true;
        break;
      }
      if (item.type === 'text') {
        pos += item.node.textContent.length;
      } else if (item.type === 'br') {
        pos += 1; // Count <br> as one character (newline)
      } else if (item.type === 'chord') {
        // Calculate chord marker length (accounts for position format)
        pos += getChordMarkerLength(item.node);
      }
    }
    
    // If we didn't find the container, it might be nested deeper
    // Try to find it in the DOM tree
    if (!found && range.endContainer.nodeType === Node.TEXT_NODE) {
      // Recalculate by finding the text node in our tree
      const textContent = range.endContainer.textContent;
      const offset = range.endOffset;
      // This is a fallback - try to find the position by text matching
      const fullText = getTextFromEditor();
      const index = fullText.indexOf(textContent);
      if (index !== -1) {
        return index + offset;
      }
    }
    
    return pos;
  };

  // Set cursor position in contenteditable (accounting for <br> tags and chord spans)
  const setCursorPosition = (pos) => {
    const selection = window.getSelection();
    const range = document.createRange();
    
    // Collect all nodes in order: text nodes, <br> elements, and chord spans
    const allNodes = [];
    const collectNodes = (node) => {
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === Node.TEXT_NODE) {
          allNodes.push({ type: 'text', node: child });
        } else if (child.tagName === 'BR') {
          allNodes.push({ type: 'br', node: child });
        } else if (child.nodeType === Node.ELEMENT_NODE && child.hasAttribute('data-chord')) {
          allNodes.push({ type: 'chord', node: child });
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          collectNodes(child);
        }
      }
    };
    collectNodes(editorRef.current);
    
    let currentPos = 0;
    for (const item of allNodes) {
      if (item.type === 'text') {
        const nodeLength = item.node.textContent.length;
        if (currentPos + nodeLength >= pos) {
          range.setStart(item.node, pos - currentPos);
          range.setEnd(item.node, pos - currentPos);
          selection.removeAllRanges();
          selection.addRange(range);
          return;
        }
        currentPos += nodeLength;
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
          // Place cursor right after the chord span
          range.setStartAfter(item.node);
          range.setEndAfter(item.node);
          selection.removeAllRanges();
          selection.addRange(range);
          return;
        }
        currentPos += chordLength;
      }
    }
    
    // If we get here, position is at the end - place cursor at end of last node
    if (allNodes.length > 0) {
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
      }
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
          text += child.textContent;
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          if (child.tagName === 'BR') {
            // Line break
            text += '\n';
          } else if (child.hasAttribute('data-chord')) {
            // This is a styled chord span
            // Extract chord name and position from child spans
            // Structure: span[data-chord] > span (chord name) + span (position indicator, optional)
            const childSpans = child.querySelectorAll('span');
            let chordName = '';
            let chordPosition = null;
            
            if (childSpans.length > 0) {
              // First span is always the chord name
              chordName = childSpans[0].textContent.trim();
              
              // If there's a second span, it's the position indicator
              if (childSpans.length > 1) {
                const positionText = childSpans[1].textContent.trim();
                const positionNum = parseInt(positionText, 10);
                if (!isNaN(positionNum) && positionNum > 1) {
                  chordPosition = positionNum;
                }
              }
            } else {
              // Fallback: use textContent if structure is unexpected
              chordName = child.textContent.trim();
            }
            
            // Reconstruct chord marker with position if present
            const chordMarker = chordPosition 
              ? `[${chordName}:${chordPosition}]` 
              : `[${chordName}]`;
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
    
    // Parse text and create styled HTML, handling line breaks
    const lines = text.split('\n');
    const fragment = document.createDocumentFragment();
    
    lines.forEach((line, lineIndex) => {
      // Parse each line for chords
      const parts = line.split(/(\[[^\]]+\])/);
      
      parts.forEach((part) => {
        if (part.match(/^\[([^\]]+)\]$/)) {
          // This is a chord
          const chordText = part.slice(1, -1); // Remove brackets
          
          // Parse position from chord name format: "C:2" -> chord "C", position 2
          const positionMatch = chordText.match(/^(.+):(\d+)$/);
          const chordName = positionMatch ? positionMatch[1].trim() : chordText;
          const chordPosition = positionMatch ? parseInt(positionMatch[2], 10) : 1;
          
          const span = document.createElement('span');
          span.className = 'inline-flex items-center gap-1.5 px-2 py-1 bg-primary-100 text-primary-700 rounded text-sm font-medium';
          span.setAttribute('data-chord', 'true');
          span.setAttribute('contenteditable', 'false'); // Prevent editing within chord spans
          
          // Add chord name text
          const chordNameSpan = document.createElement('span');
          chordNameSpan.textContent = chordName;
          span.appendChild(chordNameSpan);
          
          // Add position indicator if position > 1
          if (chordPosition > 1) {
            const positionSpan = document.createElement('span');
            positionSpan.className = 'inline-flex items-center justify-center rounded-full bg-primary-700 text-white text-xs font-medium leading-[1em] min-w-[1em] px-1';
            positionSpan.textContent = chordPosition.toString();
            span.appendChild(positionSpan);
          }
          
          fragment.appendChild(span);
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
      // +1 for "Show more variations", +1 for "Create custom chord"
      const totalItems = filteredElements.length + usedFiltered.length + libraryFiltered.length + 2;
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < totalItems - 1 ? prev + 1 : prev
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : 0);
      } else if (e.key === 'Enter') {
        e.preventDefault();
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
          const selectedChord = allFiltered[chordIndex];
          if (selectedChord) {
            const chordName = selectedChord.name || selectedChord;
            const chordPosition = selectedChord.position;
            // Pass position directly to insertChord to avoid state timing issues
            insertChord(chordName, chordPosition || null);
          }
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowDropdown(false);
        setQuery('');
        editorRef.current?.focus();
      } else if (e.key === 'Backspace') {
        if (query.length > 0) {
          e.preventDefault();
          setQuery(prev => prev.slice(0, -1));
        } else {
          setShowDropdown(false);
          setQuery('');
        }
      } else if (e.key === ' ' || e.key === 'Tab') {
        setShowDropdown(false);
        setQuery('');
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && /[a-zA-Z0-9#]/.test(e.key)) {
        e.preventDefault();
        setQuery(prev => prev + e.key);
      }
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
          // Don't call focus() as it might reset the selection, especially on empty lines
          const cursorPos = getCursorPosition();
          
          // Store immediately - this must happen synchronously
          insertPositionRef.current = cursorPos;
          
          // Now update UI state (this is async but position is already captured in ref)
          setQuery('');
          setSelectedIndex(0);
          setShowDropdown(true);
        }
      }
    }
  };

  const handleInput = (e) => {
    const text = getTextFromEditor();
    onChange({ target: { value: text } });
  };

  const insertChord = (chordName, explicitPosition = null) => {
    if (!editorRef.current) return;
    
    // Get text directly from editor to ensure we have the most current value
    const currentText = getTextFromEditor();
    let insertPos = insertPositionRef.current;
    
    // Clamp insert position to valid range
    if (insertPos < 0) insertPos = 0;
    if (insertPos > currentText.length) insertPos = currentText.length;
    
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
    
    // Ensure position is stored
    if (chordPosition && chordPosition > 1) {
      handleChordPositionSelect(chordName, chordPosition);
    }

    // Format chord with position suffix if position > 1: [C:2], otherwise just [C]
    const chordText = chordPosition > 1 ? `${chordName}:${chordPosition}` : chordName;
    const newText = before + spaceBefore + `[${chordText}]` + spaceAfter + after;
    
    // Update DOM directly and skip sync to prevent re-render interference
    skipSyncRef.current = true;
    updateEditorContent(newText);
    lastValueRef.current = newText;
    onChange({ target: { value: newText } });

    setTimeout(() => {
      const newCursorPos = insertPos + spaceBefore.length + chordText.length + 2 + spaceAfter.length;
      setCursorPosition(newCursorPos);
      editorRef.current?.focus();
    }, 0);

    setShowDropdown(false);
    setQuery('');
  };

  const handleChordClick = (chordName, chordPosition = null) => {
    if (!chordName) return;
    // If position is provided, use it; otherwise get from chord data
    if (chordPosition !== null && chordPosition !== undefined) {
      // Store the position for this chord
      handleChordPositionSelect(chordName, chordPosition);
      // Pass position directly to insertChord to avoid state timing issues
      insertChord(chordName, chordPosition);
    } else {
      insertChord(chordName);
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
    
    console.log('[StyledChordEditor] insertElement - final insertPos:', insertPos,
      'text around pos:', JSON.stringify(currentText.substring(Math.max(0, insertPos - 5), Math.min(currentText.length, insertPos + 5))));
    
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

  // Calculate dropdown position
  useEffect(() => {
    if (!showDropdown || !editorRef.current) return;
    
    const selection = window.getSelection();
    let position = { top: 0, left: 0 };
    
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0).cloneRange();
      const rect = range.getBoundingClientRect();
      // Use fixed positioning (no scroll offset needed)
      position = {
        top: rect.bottom + 5,
        left: rect.left,
        positionAbove: false,
      };
    } else {
      // Fallback to editor position
      const rect = editorRef.current.getBoundingClientRect();
      position = {
        top: rect.bottom + 5,
        left: rect.left,
        positionAbove: false,
      };
    }
    
    setDropdownPosition(position);
  }, [showDropdown]);

  const getDropdownStyle = () => {
    if (!showDropdown) return {};
    
    return {
      position: 'fixed',
      top: `${dropdownPosition.top}px`,
      left: `${dropdownPosition.left}px`,
      zIndex: 1000,
      maxWidth: '350px',
      minWidth: '280px',
    };
  };

  // Initialize content on mount
  useEffect(() => {
    if (editorRef.current && value) {
      updateEditorContent(value);
    }
  }, []);

  return (
    <div className="relative">
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
      
      <ChordAutocompleteDropdown
        isOpen={showDropdown}
        position={getDropdownStyle()}
        query={query}
        selectedIndex={selectedIndex}
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
        dropdownRef={dropdownRef}
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
        onSelectChord={(chordName, chordPosition) => {
          handleChordClick(chordName, chordPosition);
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
