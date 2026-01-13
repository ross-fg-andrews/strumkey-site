import { useState, useRef, useEffect, useMemo } from 'react';
import { getChordNames, findChord, getChordVariations } from '../utils/chord-library';
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
 * Examples: "A f" -> "Ab", "Af" -> "Ab", "A sharp" -> "A#", "As" -> "A#", "A fl" -> "Ab"
 */
function normalizeQuery(query) {
  if (!query) return query;
  
  const trimmed = query.trim();
  
  // Match patterns where note letter is followed by space? and then "flat"/"f" or "sharp"/"s"
  // For single letter "f" or "s", only match if it's the end of the query (to avoid matching "Asus")
  // Flat patterns: "A f", "Af", "A flat", "A fl", "A fla"
  const flatPatternFull = /^([A-Ga-g][#b]?)\s*(flat|fla|fl)$/i;
  const flatPatternSingle = /^([A-Ga-g][#b]?)\s*f$/i;
  // Sharp patterns: "A s", "As", "A sharp", "A shar", "A sha", "A sh"
  const sharpPatternFull = /^([A-Ga-g][#b]?)\s*(sharp|shar|sha|sh)$/i;
  const sharpPatternSingle = /^([A-Ga-g][#b]?)\s*s$/i;
  
  // Try flat patterns first (check full word patterns, then single letter)
  let match = trimmed.match(flatPatternFull) || trimmed.match(flatPatternSingle);
  if (match) {
    const note = match[1].toUpperCase();
    return note + 'b';
  }
  
  // Try sharp patterns (check full word patterns, then single letter)
  match = trimmed.match(sharpPatternFull) || trimmed.match(sharpPatternSingle);
  if (match) {
    const note = match[1].toUpperCase();
    return note + '#';
  }
  
  // No pattern matched, return as-is
  return trimmed;
}

/**
 * Filter chords by query (case-insensitive, matches anywhere)
 * Also handles "sharp"/"flat" text patterns
 */
function filterChords(chords, query) {
  if (!query) return chords;
  
  const normalizedQuery = normalizeQuery(query);
  const lowerQuery = normalizedQuery.toLowerCase();
  
  return chords.filter(chord => 
    chord.toLowerCase().includes(lowerQuery)
  );
}

export default function ChordAutocomplete({ 
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
  const textareaRef = useRef(null);
  const dropdownRef = useRef(null);
  const measureRef = useRef(null);
  const insertPositionRef = useRef(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const [showCustomChordModal, setShowCustomChordModal] = useState(false);
  // Track selected positions for chords (chordName -> position number)
  const [selectedPositions, setSelectedPositions] = useState(new Map());

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

  // Create a map of chord data (name -> chord object) for quick lookup
  const chordDataMap = useMemo(() => {
    const map = new Map();
    
    // Add database chords
    dbChords.forEach(chord => {
      const key = chord.name;
      if (!map.has(key) || chord.libraryType === 'personal') {
        map.set(key, chord);
      }
    });
    
    return map;
  }, [dbChords]);

  // Get chord data for a chord name, using selected position if available
  const getChordData = (chordName) => {
    const selectedPosition = selectedPositions.get(chordName) || 1;
    
    // Try to find chord with selected position
    let chord = findChord(chordName, instrument, tuning, selectedPosition, {
      databaseChords: dbChords,
    });
    
    // If not found with selected position, try position 1 (standard)
    if (!chord && selectedPosition !== 1) {
      chord = findChord(chordName, instrument, tuning, 1, {
        databaseChords: dbChords,
      });
    }
    
    return chord;
  };

  // Extract chords already used in the song
  const usedChords = useMemo(() => extractUsedChords(value), [value]);

  // Get all chord variations (not just unique names) from database
  // Keep ALL variations with different frets, even if they have the same name
  const allChordVariations = useMemo(() => {
    const variations = [];
    
    // Get database chords (main + personal)
    const dbChordsList = dbChords
      .filter(c => c.instrument === instrument && c.tuning === tuning)
      .map(c => ({ ...c, source: c.libraryType === 'personal' ? 'personal' : 'main' }));
    
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
      // Return all variations, or a placeholder if none found
      if (variations.length > 0) {
        return variations;
      }
      // Fallback: try to get chord data using findChord
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
      // Return all variations, or a placeholder if none found
      if (variations.length > 0) {
        return variations;
      }
      // Fallback: try to get chord data using findChord
      const fallbackChord = findChord(chordName, instrument, tuning, 'standard', {
        databaseChords: dbChords,
      });
      if (fallbackChord) {
        return [{ ...fallbackChord, source: fallbackChord.libraryType === 'personal' ? 'personal' : 'main' }];
      }
      return [{ name: chordName, frets: null }];
    });
  }, [libraryFilteredNames, getVariationsForName, instrument, tuning, dbChords]);

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

  // Reset selected index when filtered chords or elements change
  useEffect(() => {
    setSelectedIndex(0);
  }, [usedFiltered.length, libraryFiltered.length, filteredElements.length]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        textareaRef.current &&
        !textareaRef.current.contains(event.target)
      ) {
        setShowDropdown(false);
        setQuery('');
      }
    }

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
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
          if (allFiltered[chordIndex]) {
            const selectedChord = allFiltered[chordIndex];
            const chordName = selectedChord.name || selectedChord;
            const chordPosition = selectedChord.position;
            if (chordPosition) {
              setSelectedPositions(prev => {
                const newMap = new Map(prev);
                newMap.set(chordName, chordPosition);
                return newMap;
              });
            }
            insertChord(chordName);
          }
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowDropdown(false);
        setQuery('');
        textareaRef.current?.focus();
      } else if (e.key === 'Backspace') {
        if (query.length > 0) {
          e.preventDefault();
          setQuery(prev => prev.slice(0, -1));
        } else {
          // Close dropdown if query is empty
          setShowDropdown(false);
          setQuery('');
        }
      } else if (e.key === ' ' || e.key === 'Enter' || e.key === 'Tab') {
        // Space, Enter (when not selecting), or Tab should close dropdown
        // Enter is already handled above for selection, so this won't fire
        setShowDropdown(false);
        setQuery('');
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && /[a-zA-Z0-9#]/.test(e.key)) {
        // User is typing alphanumeric or chord-related characters (# for sharp, b for flat) to filter
        // Prevent default and update query
        e.preventDefault();
        setQuery(prev => prev + e.key);
      }
    } else if (e.key === '/') {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (textarea) {
        // CRITICAL: Read cursor position IMMEDIATELY, before any state updates or focus changes
        // Use selectionStart which should be accurate even on empty lines
        // On empty lines, selectionStart should be the position after the previous newline
        const cursorStart = textarea.selectionStart;
        const cursorEnd = textarea.selectionEnd;
        // Use the start position (cursor position, not end of selection)
        const cursorPos = Math.min(cursorStart, cursorEnd);
        
        // Store immediately - this must happen synchronously, before any React state updates
        insertPositionRef.current = cursorPos;
        
        // Debug: log the position and text around it to help diagnose
        const text = value || '';
        const before = text.substring(Math.max(0, cursorPos - 10), cursorPos);
        const after = text.substring(cursorPos, Math.min(text.length, cursorPos + 10));
        console.log('[ChordAutocomplete] / pressed - cursorPos:', cursorPos, 'text.length:', text.length, 
          'selectionStart:', cursorStart, 'selectionEnd:', cursorEnd,
          'before:', JSON.stringify(before), 'after:', JSON.stringify(after));
        
        // Now update UI state (this is async but position is already captured in ref)
        setQuery('');
        setSelectedIndex(0);
        setShowDropdown(true);
      }
    }
  };

  const handleChange = (e) => {
    onChange(e);
    
    // If dropdown is open, check if cursor has moved away from insert position
    if (showDropdown) {
      const textarea = textareaRef.current;
      if (textarea) {
        const cursorPos = textarea.selectionStart;
        // If cursor moved significantly away from insert position, close dropdown
        // Allow some movement for the query text (but we're not inserting query text)
        // Actually, since we prevent default on typing when dropdown is open,
        // the cursor shouldn't move. But if user clicks elsewhere, it will.
        if (cursorPos < insertPositionRef.current) {
          setShowDropdown(false);
          setQuery('');
        }
      }
    }
  };

  const insertChord = (chordName, explicitPosition = null) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const text = value || '';
    const insertPos = insertPositionRef.current;
    
    // Clamp to valid range
    const validPos = Math.max(0, Math.min(insertPos, text.length));
    
    const before = text.substring(0, validPos);
    const after = text.substring(validPos);

    // Get characters around insertion point to determine spacing
    const charBefore = before.length > 0 ? before[before.length - 1] : null;
    const charAfter = after.length > 0 ? after[0] : null;
    
    // Check if we're within a word (both sides are alphanumeric)
    const isAlphanumeric = (char) => char && /[a-zA-Z0-9]/.test(char);
    const isWithinWord = isAlphanumeric(charBefore) && isAlphanumeric(charAfter);
    
    // Determine spacing
    let spaceBefore = '';
    let spaceAfter = '';
    
    if (!isWithinWord) {
      // At word boundary - add spaces if needed
      // Add space before if: previous char is alphanumeric (inserting after a word)
      // This means we're inserting after a word, so add space before chord
      if (isAlphanumeric(charBefore)) {
        spaceBefore = ' ';
      }
      // Add space after if: next char is alphanumeric (inserting before a word)
      // This means we're inserting before a word, so add space after chord
      if (isAlphanumeric(charAfter)) {
        spaceAfter = ' ';
      }
    }
    // If within word, no spaces are added (both remain empty)

    // Get the selected position for this chord
    // Priority: explicitPosition (passed directly) > storedPosition > chordData position > default 1
    const storedPosition = selectedPositions.get(chordName);
    const chordData = getChordData(chordName);
    let chordPosition = explicitPosition !== null ? explicitPosition : (storedPosition || chordData?.position || 1);
    
    // Ensure position is stored
    if (chordPosition && chordPosition > 1) {
      setSelectedPositions(prev => {
        const newMap = new Map(prev);
        newMap.set(chordName, chordPosition);
        return newMap;
      });
    }

    // Format chord with position suffix if position > 1: [C:2], otherwise just [C]
    const chordText = chordPosition > 1 ? `${chordName}:${chordPosition}` : chordName;
    const newText = before + spaceBefore + `[${chordText}]` + spaceAfter + after;
    onChange({ target: { value: newText } });

    // Set cursor position after inserted chord (account for added spaces)
    setTimeout(() => {
      const newCursorPos = validPos + spaceBefore.length + chordText.length + 2 + spaceAfter.length; // +2 for "["
      textarea.setSelectionRange(newCursorPos, newCursorPos);
      textarea.focus();
    }, 0);

    setShowDropdown(false);
    setQuery('');
  };

  const handleChordClick = (chordName, chordPosition = null) => {
    // If position is provided, use it; otherwise get from chord data
    if (chordPosition !== null && chordPosition !== undefined) {
      // Store the position for this chord
      setSelectedPositions(prev => {
        const newMap = new Map(prev);
        newMap.set(chordName, chordPosition);
        return newMap;
      });
      // Pass position directly to insertChord to avoid state timing issues
      insertChord(chordName, chordPosition);
    } else {
      insertChord(chordName);
    }
  };

  const insertElement = (elementType) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Get text directly from textarea.value to ensure we have the most current value
    // This is more reliable than using the value prop which might be stale
    const text = textarea.value || '';
    let insertPos = insertPositionRef.current;
    
    // Debug: log what we're about to insert
    console.log('[ChordAutocomplete] insertElement - stored insertPos:', insertPos, 'text.length:', text.length, 
      'textarea.value.length:', textarea.value?.length, 'value prop length:', (value || '').length,
      'elementType:', elementType);
    
    // IMPORTANT: If the stored position is at the end of text, this might be wrong for empty lines
    // Try to verify by checking if we're actually at the end of a line
    // If textarea still has focus, we can also try reading the current position
    if (insertPos >= text.length && text.length > 0) {
      console.warn('[ChordAutocomplete] insertElement - WARNING: stored position is at end of text, this might be wrong!');
      // If textarea has focus, try reading current position as fallback
      if (document.activeElement === textarea) {
        const currentPos = textarea.selectionStart;
        console.log('[ChordAutocomplete] insertElement - textarea has focus, current selectionStart:', currentPos);
        // Only use current position if it's significantly different and makes more sense
        if (currentPos < text.length && currentPos !== insertPos) {
          console.log('[ChordAutocomplete] insertElement - using current position instead of stored');
          insertPos = currentPos;
        }
      }
    }
    
    // Clamp to valid range
    const validPos = Math.max(0, Math.min(insertPos, text.length));
    
    console.log('[ChordAutocomplete] insertElement - final validPos:', validPos, 
      'text around pos:', JSON.stringify(text.substring(Math.max(0, validPos - 5), Math.min(text.length, validPos + 5))));
    
    const before = text.substring(0, validPos);
    const after = text.substring(validPos);
    
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
    onChange({ target: { value: newText } });
    
    // Set cursor position inside the marker (after the colon)
    setTimeout(() => {
      const newCursorPos = validPos + newlineBefore.length + marker.length - 1; // -1 to position before closing brace
      textarea.setSelectionRange(newCursorPos, newCursorPos);
      textarea.focus();
    }, 0);
    
    setShowDropdown(false);
    setQuery('');
  };

  /**
   * Calculate cursor position in pixels
   * Returns { top, left } coordinates in viewport coordinates
   */
  const calculateCursorPosition = (cursorPos) => {
    const textarea = textareaRef.current;
    if (!textarea) return { top: 0, left: 0 };

    const text = value || '';
    const textBeforeCursor = text.substring(0, cursorPos);
    
    // Get textarea position and styles
    const textareaRect = textarea.getBoundingClientRect();
    const textareaStyles = window.getComputedStyle(textarea);
    const lineHeight = parseFloat(textareaStyles.lineHeight) || parseFloat(textareaStyles.fontSize) * 1.2;
    const paddingTop = parseFloat(textareaStyles.paddingTop) || 0;
    const paddingLeft = parseFloat(textareaStyles.paddingLeft) || 0;
    const borderTop = parseFloat(textareaStyles.borderTopWidth) || 0;
    const borderLeft = parseFloat(textareaStyles.borderLeftWidth) || 0;
    const scrollTop = textarea.scrollTop;

    // Split text into lines to find which line the cursor is on
    const lines = textBeforeCursor.split('\n');
    const currentLineIndex = lines.length - 1;
    const currentLineText = lines[currentLineIndex];

    // Calculate vertical position
    const lineTop = paddingTop + borderTop + (currentLineIndex * lineHeight);
    const top = textareaRect.top + lineTop - scrollTop;

    // Calculate horizontal position using canvas for text measurement
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    context.font = `${textareaStyles.fontSize} ${textareaStyles.fontFamily}`;
    
    // Measure text width on current line
    const textWidth = context.measureText(currentLineText).width;
    
    // Calculate content width
    const contentWidth = textarea.offsetWidth - paddingLeft - parseFloat(textareaStyles.paddingRight || 0) - borderLeft - parseFloat(textareaStyles.borderRightWidth || 0);
    
    // Calculate horizontal position, accounting for word wrapping
    let left = textareaRect.left + paddingLeft + borderLeft;
    if (textWidth > contentWidth && contentWidth > 0) {
      // Text wraps - use modulo to find position on wrapped line
      left += textWidth % contentWidth;
    } else {
      left += textWidth;
    }

    return { top, left };
  };

  // Update dropdown position when it opens or cursor changes
  useEffect(() => {
    if (!showDropdown || !textareaRef.current) return;
    
    const textarea = textareaRef.current;
    const textareaRect = textarea.getBoundingClientRect();
    
    const position = calculateCursorPosition(insertPosition);
    // position is already in viewport coordinates
    let absoluteTop = position.top;
    let absoluteLeft = position.left;
    
    // Validate positions - if invalid, use textarea position as fallback
    if (isNaN(absoluteTop) || isNaN(absoluteLeft) || absoluteTop < 0 || absoluteLeft < 0) {
      absoluteTop = textareaRect.top;
      absoluteLeft = textareaRect.left;
    }
    
    // Check if dropdown would overflow viewport
    const dropdownHeight = 256; // max-h-64 = 256px
    const dropdownWidth = 280; // min-w-[280px] to accommodate chord diagrams
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    
    let finalTop = absoluteTop;
    let finalLeft = absoluteLeft;
    let positionAbove = false;

    // Add some spacing below cursor (approximate line height)
    const lineHeight = parseFloat(window.getComputedStyle(textarea).lineHeight) || 20;
    
    // If dropdown would overflow bottom, position above cursor
    if (absoluteTop + lineHeight + dropdownHeight > viewportHeight && absoluteTop > dropdownHeight) {
      finalTop = absoluteTop - dropdownHeight;
      positionAbove = true;
    } else {
      // Position below cursor with line height spacing
      finalTop = absoluteTop + lineHeight;
    }

    // If dropdown would overflow right, align to left
    if (absoluteLeft + dropdownWidth > viewportWidth) {
      finalLeft = Math.max(10, viewportWidth - dropdownWidth - 10); // 10px margin
    }

    // Ensure dropdown doesn't go off left edge
    if (finalLeft < 10) {
      finalLeft = 10;
    }
    
    // Final validation
    if (isNaN(finalTop) || isNaN(finalLeft)) {
      finalTop = textareaRect.top + 20;
      finalLeft = textareaRect.left;
    }

    setDropdownPosition({
      top: finalTop,
      left: finalLeft,
      positionAbove,
    });
  }, [showDropdown, value]);

  // Update position on scroll and resize
  useEffect(() => {
    if (!showDropdown) return;

    const handleUpdate = () => {
      if (!textareaRef.current) return;
      
      const position = calculateCursorPosition(insertPositionRef.current);
      // position is already in viewport coordinates
      const absoluteTop = position.top;
      const absoluteLeft = position.left;
      
      const dropdownHeight = 256;
      const dropdownWidth = 280;
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      
      let finalTop = absoluteTop;
      let finalLeft = absoluteLeft;
      
      const lineHeight = parseFloat(window.getComputedStyle(textarea).lineHeight) || 20;
      
      if (absoluteTop + lineHeight + dropdownHeight > viewportHeight && absoluteTop > dropdownHeight) {
        finalTop = absoluteTop - dropdownHeight;
      } else {
        finalTop = absoluteTop + lineHeight;
      }

      if (absoluteLeft + dropdownWidth > viewportWidth) {
        finalLeft = Math.max(10, viewportWidth - dropdownWidth - 10);
      }

      if (finalLeft < 10) {
        finalLeft = 10;
      }

      setDropdownPosition({
        top: finalTop,
        left: finalLeft,
        positionAbove: finalTop < absoluteTop,
      });
    };

    window.addEventListener('scroll', handleUpdate, true);
    window.addEventListener('resize', handleUpdate);
    const textarea = textareaRef.current;
    textarea?.addEventListener('scroll', handleUpdate);

    return () => {
      window.removeEventListener('scroll', handleUpdate, true);
      window.removeEventListener('resize', handleUpdate);
      textarea?.removeEventListener('scroll', handleUpdate);
    };
  }, [showDropdown, value]);

  const getDropdownStyle = () => {
    if (!showDropdown) return {};
    
    // Ensure we have valid positions, fallback to textarea position if not
    const textarea = textareaRef.current;
    let top = dropdownPosition.top;
    let left = dropdownPosition.left;
    
    if (!textarea || isNaN(top) || isNaN(left) || top < 0 || left < 0) {
      const textareaRect = textarea?.getBoundingClientRect();
      if (textareaRect) {
        top = textareaRect.top + 20;
        left = textareaRect.left;
      } else {
        top = 100;
        left = 100;
      }
    }
    
    return {
      position: 'fixed', // Use fixed to position relative to viewport
      top: `${top}px`,
      left: `${left}px`,
      zIndex: 1000,
      maxWidth: '350px',
      minWidth: '280px',
    };
  };

  return (
    <div className="relative">
      {/* Hidden div for measuring text width */}
      <div
        ref={measureRef}
        style={{
          position: 'absolute',
          visibility: 'hidden',
          whiteSpace: 'pre-wrap',
          wordWrap: 'break-word',
        }}
      />
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
        rows={rows}
        required={required}
      />
      
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
                      const isPersonal = chordObj.source === 'personal' || personalChordNames.has(chordName);
                      
                      return (
                        <button
                          key={`used-${chordName}-${chordFrets || 'no-frets'}-${index}`}
                          type="button"
                          data-selected={isSelected}
                          onClick={() => handleChordClick(chordName, chordObj.position)}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 transition-colors flex items-center gap-3 ${
                            isSelected ? 'bg-primary-50 text-primary-700 font-medium' : ''
                          }`}
                        >
                          {chordFrets && (
                            <div className="flex-shrink-0">
                              <ChordDiagram
                                frets={chordFrets}
                                baseFret={chordObj.baseFret}
                                chordName=""
                                instrument={instrument}
                                tuning={tuning}
                              />
                            </div>
                          )}
                          <div className="flex-1 flex items-center gap-2 min-w-0">
                            <span className="font-medium">{chordName}</span>
                            {chordObj.position > 1 && (
                              <span className={`inline-flex items-center justify-center rounded-full text-white text-xs font-medium leading-[1em] min-w-[1em] px-1 ${
                                isSelected ? 'bg-primary-700' : 'bg-gray-900'
                              }`}>
                                {chordObj.position}
                              </span>
                            )}
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
                      
                      return (
                        <button
                          key={`library-${chordName}-${chordFrets || 'no-frets'}-${index}-${chordObj.source || 'unknown'}`}
                          type="button"
                          data-selected={isSelected}
                          onClick={() => handleChordClick(chordName, chordObj.position)}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 transition-colors flex items-center gap-3 ${
                            isSelected ? 'bg-primary-50 text-primary-700 font-medium' : ''
                          }`}
                        >
                          {chordFrets && (
                            <div className="flex-shrink-0">
                              <ChordDiagram
                                frets={chordFrets}
                                baseFret={chordObj.baseFret}
                                chordName=""
                                instrument={instrument}
                                tuning={tuning}
                              />
                            </div>
                          )}
                          <div className="flex-1 flex items-center gap-2 min-w-0">
                            <span className="font-medium">{chordName}</span>
                            {chordObj.position > 1 && (
                              <span className={`inline-flex items-center justify-center rounded-full text-white text-xs font-medium leading-[1em] min-w-[1em] px-1 ${
                                isSelected ? 'bg-primary-700' : 'bg-gray-900'
                              }`}>
                                {chordObj.position}
                              </span>
                            )}
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
              </>
            )}
          </div>
          
          {/* Create custom chord option - ALWAYS show at bottom, sticky */}
          <div className="border-t border-gray-200 bg-white sticky bottom-0">
            <button
              type="button"
              data-selected={selectedIndex === filteredElements.length + usedFiltered.length + libraryFiltered.length}
              onClick={() => {
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
        databaseChords={dbChords}
      />
    </div>
  );
}

