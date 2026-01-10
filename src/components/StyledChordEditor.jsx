import { useState, useRef, useEffect, useMemo } from 'react';
import { getChordNames, findChord, getChordVariations, getAllChords } from '../utils/chord-library';
import { useAllDatabaseChords } from '../db/queries';
import CustomChordModal from './CustomChordModal';
import { createPersonalChord } from '../db/mutations';
import ChordDiagram from './ChordDiagram';

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
  tuning = 'ukulele_standard',
  userId = null
}) {
  const editorRef = useRef(null);
  const dropdownRef = useRef(null);
  const skipSyncRef = useRef(false);
  const insertPositionRef = useRef(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const [showCustomChordModal, setShowCustomChordModal] = useState(false);
  // Track selected variations for chords (chordName -> variation)
  const [selectedVariations, setSelectedVariations] = useState(new Map());

  // Get database chords (main + personal) if userId provided
  const { data: dbChordsData } = useAllDatabaseChords(userId, instrument, tuning);
  const dbChords = dbChordsData?.chords || [];
  
  // Create a map of personal chord names for quick lookup
  const personalChordNames = useMemo(() => {
    return new Set(
      dbChords
        .filter(c => c.libraryType === 'personal')
        .map(c => c.name)
    );
  }, [dbChords]);

  // Get chord data for a chord name, using selected variation if available
  const getChordData = (chordName) => {
    const selectedVariation = selectedVariations.get(chordName) || 'standard';
    
    // Try to find chord with selected variation
    let chord = findChord(chordName, instrument, tuning, selectedVariation, {
      databaseChords: dbChords,
    });
    
    // If not found with selected variation, try standard
    if (!chord && selectedVariation !== 'standard') {
      chord = findChord(chordName, instrument, tuning, 'standard', {
        databaseChords: dbChords,
      });
    }
    
    return chord;
  };

  // Extract chords already used in the song
  const usedChords = useMemo(() => extractUsedChords(value), [value]);

  // Get all chord variations (not just unique names) from all sources
  // Keep ALL variations with different frets, even if they have the same name
  const allChordVariations = useMemo(() => {
    const variations = [];
    
    // Get static seed chords FIRST - always include all of them
    const staticChords = getAllChords(instrument, tuning);
    staticChords.forEach(c => {
      variations.push({ ...c, source: 'static' });
    });
    
    // Get database chords (main + personal)
    // Add ALL of them as separate entries, even if they have same name+frets as static
    const dbChordsList = dbChords
      .filter(c => c.instrument === instrument && c.tuning === tuning)
      .map(c => {
        // Ensure source is set correctly based on libraryType
        // If libraryType is missing or not 'personal', check if it has createdBy (personal indicator)
        const source = c.libraryType === 'personal' 
          ? 'personal' 
          : (c.libraryType === 'main' ? 'main' : (c.createdBy ? 'personal' : 'main'));
        return { ...c, source };
      });
    
    // Add all database chords - no deduplication, we want to show all variations
    dbChordsList.forEach(dbChord => {
      variations.push(dbChord);
    });
    
    return variations;
  }, [instrument, tuning, dbChords]);

  // Get unique chord names for filtering
  const availableChordNames = useMemo(() => {
    const names = new Set(allChordVariations.map(c => c.name));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [allChordVariations]);

  // Get used chord names
  const usedChordNames = useMemo(() => {
    return [...new Set(usedChords)].sort((a, b) => a.localeCompare(b));
  }, [usedChords]);

  // Combine: used chord names first, then available chord names (excluding duplicates)
  const allChords = useMemo(() => {
    const usedSet = new Set(usedChordNames);
    const libraryFiltered = availableChordNames.filter(c => !usedSet.has(c));
    return [...usedChordNames, ...libraryFiltered];
  }, [usedChordNames, availableChordNames]);

  // Get all variations for a chord name
  const getVariationsForName = useMemo(() => {
    return (chordName) => {
      return allChordVariations.filter(c => c.name === chordName);
    };
  }, [allChordVariations]);

  // Filter chord names based on query
  const filteredChordNames = useMemo(() => {
    return filterChords(allChords, query);
  }, [allChords, query]);

  // Separate used and library chord names in filtered results
  const usedFilteredNames = useMemo(() => {
    return filterChords(usedChordNames, query);
  }, [usedChordNames, query]);

  const libraryFilteredNames = useMemo(() => {
    const usedSet = new Set(usedChordNames);
    return filterChords(availableChordNames.filter(c => !usedSet.has(c)), query);
  }, [usedChordNames, availableChordNames, query]);
  
  // Expand filtered names into chord entries (one per variation)
  const usedFiltered = useMemo(() => {
    return usedFilteredNames.flatMap(chordName => {
      const variations = getVariationsForName(chordName);
      if (variations.length > 0) {
        return variations;
      }
      const fallbackChord = findChord(chordName, instrument, tuning, 'standard', {
        databaseChords: dbChords,
      });
      if (fallbackChord) {
        return [{ ...fallbackChord, source: fallbackChord.libraryType === 'personal' ? 'personal' : 'main' }];
      }
      return [{ name: chordName, frets: null }];
    });
  }, [usedFilteredNames, getVariationsForName, instrument, tuning, dbChords]);

  const libraryFiltered = useMemo(() => {
    return libraryFilteredNames.flatMap(chordName => {
      const variations = getVariationsForName(chordName);
      if (variations.length > 0) {
        return variations;
      }
      const fallbackChord = findChord(chordName, instrument, tuning, 'standard', {
        databaseChords: dbChords,
      });
      if (fallbackChord) {
        return [{ ...fallbackChord, source: fallbackChord.libraryType === 'personal' ? 'personal' : 'main' }];
      }
      return [{ name: chordName, frets: null }];
    });
  }, [libraryFilteredNames, getVariationsForName, instrument, tuning, dbChords]);

  // Elements (headings and instructions) - always available
  const elements = [
    { type: 'heading', label: 'Heading', icon: '📝' },
    { type: 'instruction', label: 'Instruction', icon: '💡' },
  ];

  // Filter elements based on query
  const filteredElements = useMemo(() => {
    if (!query) return elements;
    const lowerQuery = query.toLowerCase();
    return elements.filter(el => 
      el.label.toLowerCase().includes(lowerQuery) ||
      el.type.toLowerCase().includes(lowerQuery)
    );
  }, [query]);

  // Reset selected index when filtered chords change
  useEffect(() => {
    setSelectedIndex(0);
  }, [usedFiltered.length, libraryFiltered.length, filteredElements.length]);

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
          pos += child.textContent.length + 2; // [ChordName]
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
        // Chord span counts as [ChordName] - bracket + name + bracket
        pos += item.node.textContent.length + 2;
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
      const totalItems = filteredElements.length + usedFiltered.length + libraryFiltered.length + 1; // +1 for "Create custom chord"
      
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
        // Check if "Create custom chord" is selected (last item)
        if (selectedIndex === totalItems - 1) {
          setShowCustomChordModal(true);
          setShowDropdown(false);
        } else if (selectedIndex < filteredElements.length) {
          // Element selected - use insertPositionRef.current directly, just like chords do
          const element = filteredElements[selectedIndex];
          insertElement(element.type);
        } else {
          // Chord selected
          const chordIndex = selectedIndex - filteredElements.length;
          const allFiltered = [...usedFiltered, ...libraryFiltered];
          const selectedChord = allFiltered[chordIndex];
          if (selectedChord) {
            const chordName = selectedChord.name || selectedChord;
            insertChord(chordName);
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

  const insertChord = (chordName) => {
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

    // Remember the selected variation for this chord
    const chordData = getChordData(chordName);
    if (chordData?.variation) {
      setSelectedVariations(prev => {
        const newMap = new Map(prev);
        newMap.set(chordName, chordData.variation);
        return newMap;
      });
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
      
      {showDropdown && (
        <div
          ref={dropdownRef}
          style={getDropdownStyle()}
          className="bg-white border border-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto flex flex-col min-w-[280px]"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex-1 overflow-y-auto">
            {query && (
              <div className="px-4 py-2 text-xs font-medium text-gray-700 bg-gray-50 border-b border-gray-200 sticky top-0">
                Searching: "{query}"
                {normalizeQuery(query) !== query.trim() && (
                  <span className="text-gray-500"> → {normalizeQuery(query)}</span>
                )}
              </div>
            )}
            {filteredElements.length === 0 && usedFiltered.length === 0 && libraryFiltered.length === 0 ? (
              <div className="px-4 py-2 text-gray-500 text-sm">
                No results found
              </div>
            ) : (
              <>
                {filteredElements.length > 0 && (
                  <>
                    <div className={`px-4 py-2 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-200 ${query ? '' : 'sticky top-0'}`}>
                      Elements
                    </div>
                    {filteredElements.map((element, index) => {
                      const isSelected = index === selectedIndex;
                      return (
                        <button
                          key={`element-${element.type}-${index}`}
                          type="button"
                          data-selected={isSelected}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            // Use insertPositionRef.current directly, just like chords do
                            insertElement(element.type);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 transition-colors flex items-center gap-3 ${
                            isSelected ? 'bg-primary-50 text-primary-700 font-medium' : ''
                          }`}
                        >
                          <span className="text-lg">{element.icon}</span>
                          <span className="font-medium">{element.label}</span>
                        </button>
                      );
                    })}
                    {(usedFiltered.length > 0 || libraryFiltered.length > 0) && (
                      <div className="border-t border-gray-200"></div>
                    )}
                  </>
                )}
                {usedFiltered.length > 0 && (
                  <>
                    <div className={`px-4 py-2 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-200 ${query ? '' : 'sticky top-0'}`}>
                      Used in song
                    </div>
                    {usedFiltered.map((chordObj, index) => {
                      const globalIndex = filteredElements.length + index;
                      const isSelected = globalIndex === selectedIndex;
                      const chordName = chordObj.name || chordObj;
                      const chordFrets = chordObj.frets;
                      const isPersonal = chordObj.source === 'personal';
                      
                      return (
                        <button
                          key={`used-${chordName}-${chordFrets || 'no-frets'}-${index}`}
                          type="button"
                          data-selected={isSelected}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleChordClick(chordName);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 transition-colors flex items-center gap-3 ${
                            isSelected ? 'bg-primary-50 text-primary-700 font-medium' : ''
                          }`}
                        >
                          {chordFrets && (
                            <div className="flex-shrink-0">
                              <ChordDiagram
                                frets={chordFrets}
                                chordName=""
                                instrument={instrument}
                                tuning={tuning}
                              />
                            </div>
                          )}
                          <div className="flex-1 flex items-center gap-2 min-w-0">
                            <span className="font-medium">{chordName}</span>
                            {isPersonal && (
                              <span className="text-xs text-yellow-600 flex-shrink-0" title="Personal library">
                                ⭐
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </>
                )}
                
                {libraryFiltered.length > 0 && (
                  <>
                    {(filteredElements.length > 0 || usedFiltered.length > 0) && (
                      <div className="border-t border-gray-200"></div>
                    )}
                    <div className={`px-4 py-2 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-200 ${query ? '' : 'sticky top-0'}`}>
                      Available chords
                    </div>
                    {libraryFiltered.map((chordObj, index) => {
                      const globalIndex = filteredElements.length + usedFiltered.length + index;
                      const isSelected = globalIndex === selectedIndex;
                      const chordName = chordObj.name || chordObj;
                      const chordFrets = chordObj.frets;
                      const isPersonal = chordObj.source === 'personal';
                      const isStatic = chordObj.source === 'static';
                      
                      return (
                        <button
                          key={`library-${chordName}-${chordFrets || 'no-frets'}-${index}-${chordObj.source || 'unknown'}`}
                          type="button"
                          data-selected={isSelected}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleChordClick(chordName);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 transition-colors flex items-center gap-3 ${
                            isSelected ? 'bg-primary-50 text-primary-700 font-medium' : ''
                          }`}
                        >
                          {chordFrets && (
                            <div className="flex-shrink-0">
                              <ChordDiagram
                                frets={chordFrets}
                                chordName=""
                                instrument={instrument}
                                tuning={tuning}
                              />
                            </div>
                          )}
                          <div className="flex-1 flex items-center gap-2 min-w-0">
                            <span className="font-medium">{chordName}</span>
                            {isPersonal && (
                              <span className="text-xs text-yellow-600 flex-shrink-0" title="Personal library">
                                ⭐
                              </span>
                            )}
                            {isStatic && !isPersonal && (
                              <span className="text-xs text-gray-400 flex-shrink-0" title="Standard library">
                                📚
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </>
                )}
              </>
            )}
          </div>
          
          {/* Create custom chord option - ALWAYS show at bottom, sticky */}
          <div className="border-t border-gray-200 bg-white sticky bottom-0">
            <button
              type="button"
              data-selected={selectedIndex === filteredElements.length + usedFiltered.length + libraryFiltered.length}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowCustomChordModal(true);
                setShowDropdown(false);
              }}
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors"
              style={{
                backgroundColor: selectedIndex === filteredElements.length + usedFiltered.length + libraryFiltered.length 
                  ? '#eff6ff' 
                  : 'transparent',
                color: selectedIndex === filteredElements.length + usedFiltered.length + libraryFiltered.length 
                  ? '#1e40af' 
                  : '#111827',
                fontWeight: selectedIndex === filteredElements.length + usedFiltered.length + libraryFiltered.length 
                  ? '500' 
                  : '400',
              }}
            >
              Create custom chord
            </button>
          </div>
        </div>
      )}
      
      {/* Custom Chord Modal */}
      <CustomChordModal
        isOpen={showCustomChordModal}
        onClose={() => setShowCustomChordModal(false)}
        onSave={handleCustomChordSave}
        instrument={instrument}
        tuning={tuning}
        userId={userId}
      />
    </div>
  );
}

