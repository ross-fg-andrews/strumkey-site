import { useState, useRef, useEffect, useMemo } from 'react';
import { findChord, isCommonChord } from '../utils/chord-library';
import { useAllDatabaseChords } from '../db/queries';
import { extractUsedChords, filterChords } from '../utils/chord-autocomplete-helpers';

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
  const [showVariationsModal, setShowVariationsModal] = useState(false);
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
    // Filter to only show common chords in the dropdown (main library only)
    return filterChords(commonChordNames.filter(c => !usedSet.has(c)), query);
  }, [usedChordNames, commonChordNames, query]);
  
  // Expand filtered names into chord entries (only the specific position used)
  const usedFiltered = useMemo(() => {
    return usedFilteredNames.map(chordText => {
      // Parse position from chord text: "C7:2" -> chord "C7", position 2; "C7" -> chord "C7", position 1
      let actualChordName = chordText;
      let chordPosition = 1;
      const positionMatch = chordText.match(/^(.+):(\d+)$/);
      if (positionMatch) {
        actualChordName = positionMatch[1].trim();
        chordPosition = parseInt(positionMatch[2], 10) || 1;
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
  }, [usedFilteredNames, getVariationsForName, instrument, tuning, dbChords]);

  const libraryFiltered = useMemo(() => {
    return libraryFilteredNames.flatMap(chordName => {
      const variations = getVariationsForName(chordName);
      // Filter to only include common chords (position 1, main library, specific suffixes)
      const commonVariations = variations.filter(isCommonChord);
      if (commonVariations.length > 0) {
        // Ensure all variations have position property
        return commonVariations.map(v => ({ ...v, position: v.position || 1 }));
      }
      // Fallback: try to get chord data using findChord (will only return position 1 if it's common)
      const fallbackChord = findChord(chordName, instrument, tuning, 1, {
        databaseChords: dbChords,
      });
      if (fallbackChord && isCommonChord(fallbackChord)) {
        return [{ ...fallbackChord, source: fallbackChord.libraryType === 'personal' ? 'personal' : 'main', position: fallbackChord.position || 1 }];
      }
      return [];
    });
  }, [libraryFilteredNames, getVariationsForName, instrument, tuning, dbChords]);

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
    showVariationsModal,
    setShowVariationsModal,
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
    
    // Handlers
    handleChordPositionSelect,
  };
}
