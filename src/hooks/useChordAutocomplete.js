import { useState, useRef, useEffect, useMemo } from 'react';
import { findChord, isCommonChord, isCommonChordType } from '../utils/chord-library';
import { useAllDatabaseChords } from '../db/queries';
import {
  extractUsedChords,
  filterChords,
  getStringCountForInstrument,
  isFretPatternQuery,
  isFretPatternOrPrefixQuery,
  chordFretsMatchPattern,
  chordFretsMatchPrefix,
} from '../utils/chord-autocomplete-helpers';

/**
 * Shared hook for chord autocomplete functionality
 * Handles all state management, chord data processing, and filtering logic
 */
export function useChordAutocomplete({ 
  value, 
  instrument = 'ukulele', 
  tuning = 'ukulele_standard', 
  userId = null 
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showCustomChordModal, setShowCustomChordModal] = useState(false);
  const [selectedPositions, setSelectedPositions] = useState(new Map());

  // Get database chords (main + personal) if userId provided
  const { data: dbChordsData } = useAllDatabaseChords(userId, instrument, tuning);
  const dbChords = dbChordsData?.chords || [];

  const stringCount = getStringCountForInstrument(instrument, tuning);
  
  // Create a map of personal chord names for quick lookup
  const personalChordNames = useMemo(() => {
    return new Set(
      dbChords
        .filter(c => c.libraryType === 'personal')
        .map(c => c.name)
    );
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

  // Get common chord names (position 1, main library, specific suffixes)
  const commonChordNames = useMemo(() => {
    const commonChords = allChordVariations.filter(isCommonChord);
    const names = new Set(commonChords.map(c => c.name));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [allChordVariations]);

  // Get used chord names
  const usedChordNames = useMemo(() => {
    return [...new Set(usedChords)].sort((a, b) => a.localeCompare(b));
  }, [usedChords]);

  // Get all variations for a chord name
  const getVariationsForName = useMemo(() => {
    return (chordName) => {
      return allChordVariations.filter(c => c.name === chordName);
    };
  }, [allChordVariations]);

  // Elements (headings and instructions) - now only via edit banner Section button
  const elements = [];

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

  // Library names: all matching chord names (include names used in song so alternate positions can appear)
  const libraryFilteredNames = useMemo(() => {
    return filterChords(availableChordNames, query);
  }, [availableChordNames, query]);
  
  // Expand filtered names into chord entries (only the specific position used).
  // When query is a fret pattern or prefix (e.g. "0", "00", "000", "0003"), expand all used chords then filter by frets.
  const usedFiltered = useMemo(() => {
    const namesToExpand = isFretPatternOrPrefixQuery(query, stringCount) ? usedChordNames : usedFilteredNames;
    const expanded = namesToExpand.map(chordText => {
      // Parse chord format: "C:2:abc123" or "C::abc123" or "C:2" or "C"
      // Note: extractUsedChords should have already stripped IDs, but handle defensively
      let actualChordName = chordText;
      let chordPosition = 1;
      
      // Try to match format with ID: "C:2:abc123" or "C::abc123"
      const idMatch = chordText.match(/^(.+?):(\d*):(.+)$/);
      if (idMatch) {
        actualChordName = idMatch[1].trim();
        const positionStr = idMatch[2];
        chordPosition = positionStr ? parseInt(positionStr, 10) || 1 : 1;
      } else {
        // Try to match format without ID: "C:2" or "C"
        const positionMatch = chordText.match(/^(.+):(\d+)$/);
        if (positionMatch) {
          actualChordName = positionMatch[1].trim();
          chordPosition = parseInt(positionMatch[2], 10) || 1;
        }
      }
      
      // Find the specific variation with this position
      const variations = getVariationsForName(actualChordName);
      const matchingVariation = variations.find(v => v.position === chordPosition);
      
      if (matchingVariation) {
        return { ...matchingVariation, position: matchingVariation.position || 1 };
      }
      
      // Fallback: try to get chord data using findChord with the specific position
      const fallbackChord = findChord(actualChordName, instrument, tuning, chordPosition, {
        databaseChords: dbChords,
      });
      if (fallbackChord) {
        return { ...fallbackChord, source: fallbackChord.libraryType === 'personal' ? 'personal' : 'main', position: fallbackChord.position || 1 };
      }
      
      // Last resort: return a placeholder
      return { name: actualChordName, frets: null, position: chordPosition };
    });
    if (isFretPatternOrPrefixQuery(query, stringCount)) {
      const matchFrets = query.length === stringCount
        ? (c) => chordFretsMatchPattern(c, query)
        : (c) => chordFretsMatchPrefix(c, query);
      return expanded.filter(matchFrets);
    }
    return expanded;
  }, [query, stringCount, usedChordNames, usedFilteredNames, getVariationsForName, instrument, tuning, dbChords]);

  // All matching library chords (name or fret search) — include all chords, not just common
  const libraryFilteredAll = useMemo(() => {
    if (isFretPatternOrPrefixQuery(query, stringCount)) {
      const usedSet = new Set(usedChordNames);
      const libraryVariations = allChordVariations.filter(
        c => !usedSet.has(c.position > 1 ? `${c.name}:${c.position}` : c.name)
      );
      const matchFrets = query.length === stringCount
        ? (c) => chordFretsMatchPattern(c, query)
        : (c) => chordFretsMatchPrefix(c, query);
      return libraryVariations
        .filter(matchFrets)
        .map(v => ({ ...v, position: v.position || 1 }));
    }
    // Name search: expand all matching names to all variations, then exclude only the exact voicings used in the song
    const usedSet = new Set(usedChordNames);
    return libraryFilteredNames.flatMap(chordName => {
      const variations = getVariationsForName(chordName);
      return variations
        .map(v => ({ ...v, position: v.position || 1 }))
        .filter(v => {
          const pos = v.position ?? 1;
          const key = pos > 1 ? `${v.name}:${v.position}` : v.name;
          return !usedSet.has(key);
        });
    });
  }, [query, stringCount, usedChordNames, libraryFilteredNames, allChordVariations, getVariationsForName]);

  // Split into common chords and "all other" for display; combined list has no duplicates.
  // Sort "All chords": Group 1 = alternate positions of major/7/minor (by type then position), Group 2 = rest (by name then position).
  const { libraryFilteredCommon, libraryFilteredAllForDisplay, libraryFiltered } = useMemo(() => {
    const common = libraryFilteredAll.filter(isCommonChord);
    const allForDisplay = common.length > 0
      ? libraryFilteredAll.filter(c => !isCommonChord(c))
      : libraryFilteredAll;

    const pos = (c) => {
      const p = Number(c.position);
      return Number.isInteger(p) && p >= 1 ? p : 1;
    };

    const group1 = allForDisplay.filter(c => isCommonChordType(c) && pos(c) >= 2);
    const group2 = allForDisplay.filter(c => !(isCommonChordType(c) && pos(c) >= 2));

    const commonTypeOrder = (suffix, name) => {
      const s = (suffix || '').trim().toLowerCase();
      if (s === '' || s === 'major') return 0;
      if (s === '7') return 1;
      if (s === 'm' || s === 'minor') return 2;
      if (name) {
        const match = name.match(/^[A-Ga-g][#b]?(.*)$/i);
        const nameSuffix = match ? (match[1] || '') : '';
        const n = nameSuffix.trim().toLowerCase();
        if (!n) return 0;
        if (n === '7' || /^7(\s|$)/.test(n)) return 1;
        if (n === 'm' || n === 'min' || n === 'minor' || /^m(\s|$)/.test(n) || /^min(\s|$)/.test(n) || /^minor(\s|$)/.test(n)) return 2;
      }
      return 0;
    };
    const group1Sorted = [...group1].sort((a, b) => {
      const typeA = commonTypeOrder(a.suffix, a.name);
      const typeB = commonTypeOrder(b.suffix, b.name);
      if (typeA !== typeB) return typeA - typeB;
      return pos(a) - pos(b);
    });
    const group2Sorted = [...group2].sort((a, b) => {
      const nameCmp = (a.name || '').localeCompare(b.name || '');
      if (nameCmp !== 0) return nameCmp;
      return pos(a) - pos(b);
    });

    const sortedAllForDisplay = [...group1Sorted, ...group2Sorted];

    return {
      libraryFilteredCommon: common,
      libraryFilteredAllForDisplay: sortedAllForDisplay,
      libraryFiltered: [...common, ...sortedAllForDisplay],
    };
  }, [libraryFilteredAll]);

  // Reset selected index when filtered chords or elements change
  useEffect(() => {
    setSelectedIndex(0);
  }, [usedFiltered.length, libraryFiltered.length, filteredElements.length, showDropdown]);

  // Handle chord position selection
  const handleChordPositionSelect = (chordName, chordPosition) => {
    if (chordPosition && chordPosition > 1) {
      setSelectedPositions(prev => {
        const newMap = new Map(prev);
        newMap.set(chordName, chordPosition);
        return newMap;
      });
    }
  };

  return {
    // State
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
    
    // Data
    dbChords,
    personalChordNames,
    allChordVariations,
    usedChordNames,
    getChordData,
    getVariationsForName,
    
    // Filtered results
    filteredElements,
    usedFiltered,
    libraryFiltered,
    libraryFilteredCommon,
    libraryFilteredAllForDisplay,

    // Handlers
    handleChordPositionSelect,
  };
}
