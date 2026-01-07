import { useState, useRef, useEffect, useMemo } from 'react';
import { getChordNames, getChordVariations } from '../utils/chord-library';
import { useAllDatabaseChords } from '../db/queries';
import CustomChordModal from './CustomChordModal';
import { createPersonalChord } from '../db/mutations';

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
  const [showDropdown, setShowDropdown] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [insertPosition, setInsertPosition] = useState(0);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const [showCustomChordModal, setShowCustomChordModal] = useState(false);

  // Get database chords (main + personal) if userId provided
  const { data: dbChordsData } = useAllDatabaseChords(userId, instrument, tuning);
  const dbChords = dbChordsData?.chords || [];

  // Extract chords already used in the song
  const usedChords = useMemo(() => extractUsedChords(value), [value]);

  // Get available chord names from the library (static + database)
  const availableChordNames = useMemo(() => {
    const staticChords = getChordNames(instrument, tuning);
    const dbChordNames = dbChords.map(c => c.name);
    // Combine and deduplicate
    return [...new Set([...staticChords, ...dbChordNames])].sort((a, b) => a.localeCompare(b));
  }, [instrument, tuning, dbChords]);

  // Get all variations for each chord name, grouped by name
  const chordVariationsMap = useMemo(() => {
    const map = new Map();
    const allChordNames = [...new Set([...usedChords, ...availableChordNames])];
    
    allChordNames.forEach(chordName => {
      const variations = getChordVariations(chordName, instrument, tuning, {
        databaseChords: dbChords,
      });
      if (variations.length > 0) {
        map.set(chordName, variations);
      }
    });
    
    // Debug: log a sample to verify variations are being found
    if (map.size > 0) {
      const sampleChord = Array.from(map.keys())[0];
      const sampleVariations = map.get(sampleChord);
      console.log(`[ChordAutocomplete] Sample chord "${sampleChord}" has ${sampleVariations.length} variation(s):`, sampleVariations);
    }
    
    return map;
  }, [usedChords, availableChordNames, instrument, tuning, dbChords]);

  // Filter chord names based on query
  const filteredChordNames = useMemo(() => {
    const allNames = [...new Set([...usedChords, ...availableChordNames])];
    return filterChords(allNames, query);
  }, [usedChords, availableChordNames, query]);

  // Separate used and library chords in filtered results
  const usedFiltered = useMemo(() => {
    return filterChords(usedChords, query);
  }, [usedChords, query]);

  const libraryFiltered = useMemo(() => {
    const usedSet = new Set(usedChords);
    return filterChords(availableChordNames.filter(c => !usedSet.has(c)), query);
  }, [usedChords, availableChordNames, query]);

  // Handle custom chord save
  const handleCustomChordSave = async (chordData) => {
    try {
      // Always save to personal library - requires userId
      if (!userId) {
        alert('You must be logged in to save custom chords.');
        return;
      }
      await createPersonalChord(chordData, userId);
      
      // Insert chord with variation info
      insertChord(
        chordData.name,
        chordData.variation || 'standard',
        chordData.frets,
        'personal'
      );
      setShowCustomChordModal(false);
    } catch (error) {
      console.error('Error saving custom chord:', error);
      alert('Error saving chord. Please try again.');
    }
  };

  // Build flat list of all variations for keyboard navigation
  // Order: used chords first, then library chords
  // Also build a map for quick index lookup
  const { allVariationsFlat, variationIndexMap } = useMemo(() => {
    const flat = [];
    const indexMap = new Map();
    let currentIndex = 0;
    
    // Add used chord variations first
    usedFiltered.forEach(chordName => {
      const variations = chordVariationsMap.get(chordName) || [];
      variations.forEach(variation => {
        const varKey = `${chordName}|${variation.variation || 'standard'}`;
        flat.push({
          chordName,
          variation: variation.variation || 'standard',
          frets: variation.frets,
          libraryType: variation.libraryType || 'static',
        });
        indexMap.set(varKey, currentIndex);
        currentIndex++;
      });
    });
    
    // Add library chord variations
    libraryFiltered.forEach(chordName => {
      const variations = chordVariationsMap.get(chordName) || [];
      variations.forEach(variation => {
        const varKey = `${chordName}|${variation.variation || 'standard'}`;
        flat.push({
          chordName,
          variation: variation.variation || 'standard',
          frets: variation.frets,
          libraryType: variation.libraryType || 'static',
        });
        indexMap.set(varKey, currentIndex);
        currentIndex++;
      });
    });
    
    return { allVariationsFlat: flat, variationIndexMap: indexMap };
  }, [usedFiltered, libraryFiltered, chordVariationsMap]);

  // Reset selected index when filtered chords change
  useEffect(() => {
    setSelectedIndex(0);
  }, [allVariationsFlat.length]);

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
          prev < allVariationsFlat.length ? prev + 1 : prev
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : 0);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        // Check if "Create custom chord" is selected (last item)
        const totalItems = allVariationsFlat.length + 1; // +1 for "Create custom chord"
        if (selectedIndex === totalItems - 1) {
          setShowCustomChordModal(true);
          setShowDropdown(false);
        } else if (allVariationsFlat[selectedIndex]) {
          const item = allVariationsFlat[selectedIndex];
          insertChord(item.chordName, item.variation, item.frets, item.libraryType);
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

  const insertChord = (chordName, variation = null, frets = null, libraryType = null) => {
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

    // Build chord marker with variation info if present
    let chordMarker = `[${chordName}`;
    if (variation && variation !== 'standard') {
      chordMarker += `|${variation}`;
      if (frets) chordMarker += `:${frets}`;
      if (libraryType) chordMarker += `:${libraryType}`;
    } else if (frets || libraryType) {
      // Even if variation is standard, include frets/libraryType if available
      chordMarker += `|standard`;
      if (frets) chordMarker += `:${frets}`;
      if (libraryType) chordMarker += `:${libraryType}`;
    }
    chordMarker += ']';

    const newText = before + spaceBefore + chordMarker + spaceAfter + after;
    onChange({ target: { value: newText } });

    // Set cursor position after inserted chord (account for added spaces)
    setTimeout(() => {
      const newCursorPos = insertPosition + spaceBefore.length + chordMarker.length + spaceAfter.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
      textarea.focus();
    }, 0);

    setShowDropdown(false);
    setQuery('');
  };

  const handleChordClick = (chordName, variation = null, frets = null, libraryType = null) => {
    insertChord(chordName, variation, frets, libraryType);
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
          className="bg-white border border-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto flex flex-col"
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
            {allVariationsFlat.length === 0 ? (
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
                    {usedFiltered.map((chordName) => {
                      const variations = chordVariationsMap.get(chordName) || [];
                      return variations.map((variation, varIndex) => {
                        const varKey = `${chordName}|${variation.variation || 'standard'}`;
                        const flatIndex = variationIndexMap.get(varKey) ?? -1;
                        const isSelected = flatIndex === selectedIndex;
                        const libraryType = variation.libraryType || 'static';
                        const frets = variation.frets || '';
                        
                        return (
                          <button
                            key={`used-${chordName}-${variation.variation || 'standard'}-${varIndex}`}
                            type="button"
                            data-selected={isSelected}
                            onClick={() => handleChordClick(
                              chordName,
                              variation.variation || 'standard',
                              frets,
                              libraryType
                            )}
                            className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors ${
                              isSelected ? 'bg-primary-50 text-primary-700 font-medium' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between w-full">
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span>{chordName}</span>
                                {libraryType === 'personal' && (
                                  <svg className="w-4 h-4 text-gray-600" fill="currentColor" viewBox="0 0 20 20" title="Personal library">
                                    <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
                                  </svg>
                                )}
                                {(libraryType === 'main' || libraryType === 'static') && (
                                  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" title="Central library">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                  </svg>
                                )}
                              </div>
                              {frets && (
                                <span className="font-mono text-gray-600 text-xs">{frets}</span>
                              )}
                            </div>
                          </button>
                        );
                      });
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
                    {libraryFiltered.map((chordName) => {
                      const variations = chordVariationsMap.get(chordName) || [];
                      return variations.map((variation, varIndex) => {
                        const varKey = `${chordName}|${variation.variation || 'standard'}`;
                        const flatIndex = variationIndexMap.get(varKey) ?? -1;
                        const isSelected = flatIndex === selectedIndex;
                        const libraryType = variation.libraryType || 'static';
                        const frets = variation.frets || '';
                        
                        return (
                          <button
                            key={`library-${chordName}-${variation.variation || 'standard'}-${varIndex}`}
                            type="button"
                            data-selected={isSelected}
                            onClick={() => handleChordClick(
                              chordName,
                              variation.variation || 'standard',
                              frets,
                              libraryType
                            )}
                            className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors ${
                              isSelected ? 'bg-primary-50 text-primary-700 font-medium' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between w-full">
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span>{chordName}</span>
                                {libraryType === 'personal' && (
                                  <svg className="w-4 h-4 text-gray-600" fill="currentColor" viewBox="0 0 20 20" title="Personal library">
                                    <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
                                  </svg>
                                )}
                                {(libraryType === 'main' || libraryType === 'static') && (
                                  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" title="Central library">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                  </svg>
                                )}
                              </div>
                              {frets && (
                                <span className="font-mono text-gray-600 text-xs">{frets}</span>
                              )}
                            </div>
                          </button>
                        );
                      });
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
              data-selected={selectedIndex === allVariationsFlat.length}
              onClick={() => {
                setShowCustomChordModal(true);
                setShowDropdown(false);
              }}
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors"
              style={{
                backgroundColor: selectedIndex === allVariationsFlat.length 
                  ? '#eff6ff' 
                  : 'transparent',
                color: selectedIndex === allVariationsFlat.length 
                  ? '#1e40af' 
                  : '#111827',
                fontWeight: selectedIndex === allVariationsFlat.length 
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

