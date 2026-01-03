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
  tuning = 'ukulele_standard'
}) {
  const textareaRef = useRef(null);
  const dropdownRef = useRef(null);
  const measureRef = useRef(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [insertPosition, setInsertPosition] = useState(0);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });

  // Extract chords already used in the song
  const usedChords = useMemo(() => extractUsedChords(value), [value]);

  // Get available chords from the library
  const availableChords = useMemo(() => {
    return getChordNames(instrument, tuning);
  }, [instrument, tuning]);

  // Combine: used chords first, then available chords from library (excluding duplicates)
  const allChords = useMemo(() => {
    const usedSet = new Set(usedChords);
    const libraryFiltered = availableChords.filter(c => !usedSet.has(c));
    return [...usedChords, ...libraryFiltered];
  }, [usedChords, availableChords]);

  // Filter chords based on query
  const filteredChords = useMemo(() => {
    return filterChords(allChords, query);
  }, [allChords, query]);

  // Separate used and library chords in filtered results
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
        const cursorPos = textarea.selectionStart;
        setInsertPosition(cursorPos);
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
        if (cursorPos < insertPosition) {
          setShowDropdown(false);
          setQuery('');
        }
      }
    }
  };

  const insertChord = (chordName) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const text = value || '';
    const before = text.substring(0, insertPosition);
    const after = text.substring(insertPosition);

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

    const newText = before + spaceBefore + `[${chordName}]` + spaceAfter + after;
    onChange({ target: { value: newText } });

    // Set cursor position after inserted chord (account for added spaces)
    setTimeout(() => {
      const newCursorPos = insertPosition + spaceBefore.length + chordName.length + 2 + spaceAfter.length; // +2 for "["
      textarea.setSelectionRange(newCursorPos, newCursorPos);
      textarea.focus();
    }, 0);

    setShowDropdown(false);
    setQuery('');
  };

  const handleChordClick = (chordName) => {
    insertChord(chordName);
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
    const dropdownWidth = 200; // min-w-[200px]
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
  }, [showDropdown, insertPosition, value]);

  // Update position on scroll and resize
  useEffect(() => {
    if (!showDropdown) return;

    const handleUpdate = () => {
      if (!textareaRef.current) return;
      
      const position = calculateCursorPosition(insertPosition);
      // position is already in viewport coordinates
      const absoluteTop = position.top;
      const absoluteLeft = position.left;
      
      const dropdownHeight = 256;
      const dropdownWidth = 200;
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
  }, [showDropdown, insertPosition, value]);

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
      maxWidth: '300px',
      minWidth: '200px',
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
                        onClick={() => handleChordClick(chord)}
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
                        onClick={() => handleChordClick(chord)}
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

