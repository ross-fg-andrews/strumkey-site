import { useState, useRef, useEffect, useMemo } from 'react';
import { getChordNames } from '../utils/chord-library';

/**
 * Extract unique chords from lyrics text that are in [ChordName] format
 */
function extractUsedChords(lyricsText) {
  if (!lyricsText) return [];
  
  const chordPattern = /\[([^\]]+)\]/g;
  const matches = [...lyricsText.matchAll(chordPattern)];
  const chordSet = new Set();
  
  matches.forEach(match => {
    const chordName = match[1].trim();
    if (chordName) {
      chordSet.add(chordName);
    }
  });
  
  return Array.from(chordSet).sort();
}

/**
 * Normalize query to convert "sharp"/"flat" text patterns to #/b notation
 */
function normalizeQuery(query) {
  if (!query) return query;
  
  const trimmed = query.trim();
  
  const flatPatternFull = /^([A-Ga-g][#b]?)\s*(flat|fla|fl)$/i;
  const flatPatternSingle = /^([A-Ga-g][#b]?)\s*f$/i;
  const sharpPatternFull = /^([A-Ga-g][#b]?)\s*(sharp|shar|sha|sh)$/i;
  const sharpPatternSingle = /^([A-Ga-g][#b]?)\s*s$/i;
  
  let match = trimmed.match(flatPatternFull) || trimmed.match(flatPatternSingle);
  if (match) {
    const note = match[1].toUpperCase();
    return note + 'b';
  }
  
  match = trimmed.match(sharpPatternFull) || trimmed.match(sharpPatternSingle);
  if (match) {
    const note = match[1].toUpperCase();
    return note + '#';
  }
  
  return trimmed;
}

/**
 * Filter chords by query (case-insensitive, matches anywhere)
 */
function filterChords(chords, query) {
  if (!query) return chords;
  
  const normalizedQuery = normalizeQuery(query);
  const lowerQuery = normalizedQuery.toLowerCase();
  
  return chords.filter(chord => 
    chord.toLowerCase().includes(lowerQuery)
  );
}

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
  tuning = 'ukulele_standard'
}) {
  const editorRef = useRef(null);
  const dropdownRef = useRef(null);
  const skipSyncRef = useRef(false);
  const insertPositionRef = useRef(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });

  // Extract chords already used in the song
  const usedChords = useMemo(() => extractUsedChords(value), [value]);

  // Get available chords from the library
  const availableChords = useMemo(() => {
    return getChordNames(instrument, tuning);
  }, [instrument, tuning]);

  // Combine: used chords first, then available chords from library
  const allChords = useMemo(() => {
    const usedSet = new Set(usedChords);
    const libraryFiltered = availableChords.filter(c => !usedSet.has(c));
    return [...usedChords, ...libraryFiltered];
  }, [usedChords, availableChords]);

  // Filter chords based on query
  const filteredChords = useMemo(() => {
    return filterChords(allChords, query);
  }, [allChords, query]);

  const usedFiltered = useMemo(() => {
    return filterChords(usedChords, query);
  }, [usedChords, query]);

  const libraryFiltered = useMemo(() => {
    const usedSet = new Set(usedChords);
    return filterChords(availableChords.filter(c => !usedSet.has(c)), query);
  }, [usedChords, availableChords, query]);

  // Reset selected index when filtered chords change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredChords.length]);

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
  }, [showDropdown]);

  // Scroll selected item into view
  useEffect(() => {
    if (showDropdown && dropdownRef.current) {
      const selectedElement = dropdownRef.current.querySelector('[data-selected="true"]');
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex, showDropdown]);

  // Get cursor position in contenteditable (accounting for <br> tags and chord spans)
  const getCursorPosition = () => {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return 0;
    
    const range = selection.getRangeAt(0);
    
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
    for (const item of allNodes) {
      if (item.node === range.endContainer) {
        pos += range.endOffset;
        break;
      }
      if (item.type === 'text') {
        pos += item.node.textContent.length;
      } else if (item.type === 'br') {
        pos += 1; // Count <br> as one character (newline)
      } else if (item.type === 'chord') {
        // Chord span counts as [ChordName] - bracket + name + bracket
        pos += item.node.textContent.length + 2;
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
        // Chord span counts as [ChordName] - bracket + name + bracket
        const chordLength = item.node.textContent.length + 2;
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
            text += `[${child.textContent}]`;
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
          const chordName = part.slice(1, -1); // Remove brackets
          const span = document.createElement('span');
          span.className = 'inline-block px-2 py-1 bg-primary-100 text-primary-700 rounded text-sm font-medium';
          span.textContent = chordName;
          span.setAttribute('data-chord', 'true');
          span.setAttribute('contenteditable', 'false'); // Prevent editing within chord spans
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
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < filteredChords.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : 0);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredChords[selectedIndex]) {
          insertChord(filteredChords[selectedIndex]);
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
          editorRef.current.focus(); // Ensure editor has focus
          const cursorPos = getCursorPosition();
          insertPositionRef.current = cursorPos;
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

  const insertChord = (chordName) => {
    const currentText = getTextFromEditor();
    // Use the stored insert position, but validate it's still valid
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

    const newText = before + spaceBefore + `[${chordName}]` + spaceAfter + after;
    
    // Update DOM directly and skip sync to prevent re-render interference
    skipSyncRef.current = true;
    updateEditorContent(newText);
    lastValueRef.current = newText;
    onChange({ target: { value: newText } });

    setTimeout(() => {
      const newCursorPos = insertPos + spaceBefore.length + chordName.length + 2 + spaceAfter.length;
      setCursorPosition(newCursorPos);
      editorRef.current?.focus();
    }, 0);

    setShowDropdown(false);
    setQuery('');
  };

  const handleChordClick = (chordName) => {
    if (!chordName) return;
    insertChord(chordName);
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
      maxWidth: '300px',
      minWidth: '200px',
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
      
      {showDropdown && (
        <div
          ref={dropdownRef}
          style={getDropdownStyle()}
          className="bg-white border border-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {query && (
            <div className="px-4 py-2 text-xs font-medium text-gray-700 bg-gray-50 border-b border-gray-200 sticky top-0">
              Searching: "{query}"
              {normalizeQuery(query) !== query.trim() && (
                <span className="text-gray-500"> → {normalizeQuery(query)}</span>
              )}
            </div>
          )}
          {filteredChords.length === 0 ? (
            <div className="px-4 py-2 text-gray-500 text-sm">
              No chords found
            </div>
          ) : (
            <>
              {usedFiltered.length > 0 && (
                <>
                  <div className={`px-4 py-2 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-200 ${query ? '' : 'sticky top-0'}`}>
                    Used in song
                  </div>
                  {usedFiltered.map((chord, index) => {
                    const globalIndex = index;
                    const isSelected = globalIndex === selectedIndex;
                    return (
                      <button
                        key={`used-${chord}`}
                        type="button"
                        data-selected={isSelected}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleChordClick(chord);
                        }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors ${
                          isSelected ? 'bg-primary-50 text-primary-700 font-medium' : ''
                        }`}
                      >
                        {chord}
                      </button>
                    );
                  })}
                </>
              )}
              
              {libraryFiltered.length > 0 && (
                <>
                  {usedFiltered.length > 0 && (
                    <div className="border-t border-gray-200"></div>
                  )}
                  <div className={`px-4 py-2 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-200 ${query ? '' : 'sticky top-0'}`}>
                    Available chords
                  </div>
                  {libraryFiltered.map((chord, index) => {
                    const globalIndex = usedFiltered.length + index;
                    const isSelected = globalIndex === selectedIndex;
                    return (
                      <button
                        key={`library-${chord}`}
                        type="button"
                        data-selected={isSelected}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleChordClick(chord);
                        }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors ${
                          isSelected ? 'bg-primary-50 text-primary-700 font-medium' : ''
                        }`}
                      >
                        {chord}
                      </button>
                    );
                  })}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

