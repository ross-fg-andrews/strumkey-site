import { useState, useRef, useEffect, useMemo } from 'react';
import { findChord, isCommonChord, isCommonChordType } from '../utils/chord-library';
import {
  useCommonChords,
  useChordsByNames,
  useChordSearch,
  useMainLibraryChords,
  usePersonalChords,
} from '../db/queries';
import {
  extractUsedChords,
  filterChords,
  chordMatchesQuery,
  getStringCountForInstrument,
  isFretPatternQuery,
  isFretPatternOrPrefixQuery,
  chordFretsMatchPattern,
  normalizeQuery,
} from '../utils/chord-autocomplete-helpers';
import { toDbName, toDisplaySharp } from '../utils/enharmonic';

const SEARCH_DEBOUNCE_MS = 250;
const CHORD_SEARCH_LIMIT = 50;

/** Suffix popularity order for Group 2 "All chords" sort (most common first). Unlisted suffixes appear after, alphabetically. */
const SUFFIX_POPULARITY_ORDER = ['maj7', 'm7', 'sus4', 'sus2', 'add9', 'aug', '6', 'dim', '9'];

/**
 * Split a library chord list into common vs all-for-display (for modal).
 * Used by the hook and by full-search results so display is consistent.
 */
export function splitLibraryForDisplay(libraryFilteredAll) {
  const common = (libraryFilteredAll || []).filter(isCommonChord);
  const allForDisplay =
    common.length > 0
      ? libraryFilteredAll.filter((c) => !isCommonChord(c))
      : libraryFilteredAll;

  const pos = (c) => {
    const p = Number(c.position);
    return Number.isInteger(p) && p >= 1 ? p : 1;
  };
  const getSuffixForSort = (chord) => {
    const fromSuffix = (chord.suffix || '').trim().toLowerCase();
    if (fromSuffix) return fromSuffix;
    const name = chord.name || '';
    const match = name.match(/^[A-Ga-g][#b]?(.*)$/i);
    return (match ? (match[1] || '') : '').trim().toLowerCase();
  };
  const group1 = allForDisplay.filter((c) => isCommonChordType(c) && pos(c) >= 2);
  const group2 = allForDisplay.filter((c) => !(isCommonChordType(c) && pos(c) >= 2));
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
  const RANK_OTHER = 9;
  const group2Sorted = [...group2].sort((a, b) => {
    const sufA = getSuffixForSort(a);
    const sufB = getSuffixForSort(b);
    const rankA = SUFFIX_POPULARITY_ORDER.indexOf(sufA) >= 0 ? SUFFIX_POPULARITY_ORDER.indexOf(sufA) : RANK_OTHER;
    const rankB = SUFFIX_POPULARITY_ORDER.indexOf(sufB) >= 0 ? SUFFIX_POPULARITY_ORDER.indexOf(sufB) : RANK_OTHER;
    if (rankA !== rankB) return rankA - rankB;
    if (rankA === RANK_OTHER) {
      const sufCmp = sufA.localeCompare(sufB);
      if (sufCmp !== 0) return sufCmp;
    }
    return pos(a) - pos(b);
  });
  const sortedAllForDisplay = [...group1Sorted, ...group2Sorted];
  return {
    libraryFilteredCommon: common,
    libraryFilteredAllForDisplay: sortedAllForDisplay,
    libraryFiltered: [...common, ...sortedAllForDisplay],
  };
}

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
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showCustomChordModal, setShowCustomChordModal] = useState(false);
  const [selectedPositions, setSelectedPositions] = useState(new Map());

  const stringCount = getStringCountForInstrument(instrument, tuning);
  const trimmedQuery = (query ?? '').trim();
  const tuningMatch = (c) =>
    (c.tuning === 'ukulele_standard' || c.tuning === 'standard') &&
    (tuning === 'ukulele_standard' || tuning === 'standard')
      ? true
      : c.tuning === tuning;

  // Debounce search query for useChordSearch
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  // Extract chords already used in the song (needed before useChordsByNames)
  const usedChords = useMemo(() => extractUsedChords(value), [value]);
  const usedChordNames = useMemo(() => {
    return [...new Set(usedChords)].sort((a, b) => a.localeCompare(b));
  }, [usedChords]);
  
  // Extract base chord names (without position) for database query
  // This ensures we load all positions for chords used in the song
  const usedChordBaseNames = useMemo(() => {
    const baseNames = new Set();
    usedChordNames.forEach(chordText => {
      // Parse to extract base name: "Dm7:2" -> "Dm7", "C" -> "C"
      const positionMatch = chordText.match(/^(.+):(\d+)$/);
      const baseName = positionMatch ? positionMatch[1] : chordText;
      baseNames.add(baseName);
    });
    return Array.from(baseNames).sort((a, b) => a.localeCompare(b));
  }, [usedChordNames]);

  // Include flat equivalents so we load DB chords for sharp-used chords (e.g. F#m7 -> also load Gbm7)
  const usedChordBaseNamesForDb = useMemo(() => {
    const withFlats = new Set(usedChordBaseNames);
    usedChordBaseNames.forEach(name => {
      const dbName = toDbName(name);
      if (dbName) withFlats.add(dbName);
    });
    return Array.from(withFlats).sort((a, b) => a.localeCompare(b));
  }, [usedChordBaseNames]);

  // Search query for DB: translate sharp to flat so DB (flat-only) returns results
  const searchQueryForDb = useMemo(() => {
    const raw = debouncedQuery && debouncedQuery.trim() ? normalizeQuery(debouncedQuery) : '';
    return raw ? (toDbName(raw) || raw) : '';
  }, [debouncedQuery]);

  // Load common + personal + used-by-name + search; full main library for fret search
  const { data: commonChordsData } = useCommonChords(instrument, tuning);
  const { data: personalChordsData } = usePersonalChords(userId, instrument, tuning);
  const { data: chordsByNamesData } = useChordsByNames(usedChordBaseNamesForDb, instrument, tuning);
  const { data: mainLibraryChordsData } = useMainLibraryChords(instrument, tuning);
  const { data: searchChordsData } = useChordSearch(
    searchQueryForDb,
    { limit: CHORD_SEARCH_LIMIT, instrument, tuning }
  );

  const commonChords = commonChordsData?.chords || [];
  const personalChords = personalChordsData?.chords || [];
  const chordsByNames = chordsByNamesData?.chords || [];
  const mainLibraryChords = mainLibraryChordsData?.chords || [];
  const searchChords = searchChordsData?.chords || [];

  // Merge into current chord set (filter by instrument/tuning, add source)
  const currentChords = useMemo(() => {
    const list = [];
    const add = (arr, sourceOrFn) => {
      (arr || []).forEach((c) => {
        if (c.instrument !== instrument || !tuningMatch(c)) return;
        const source =
          typeof sourceOrFn === 'function'
            ? sourceOrFn(c)
            : (sourceOrFn || (c.libraryType === 'personal' ? 'personal' : 'main'));
        list.push({ ...c, source });
      });
    };
    add(commonChords, 'main');
    add(personalChords, 'personal');
    add(chordsByNames, (c) => (c.libraryType === 'personal' ? 'personal' : 'main'));
    if (debouncedQuery && debouncedQuery.trim()) {
      add(searchChords, (c) => (c.libraryType === 'personal' ? 'personal' : 'main'));
    }
    return list;
  }, [
    instrument,
    tuning,
    commonChords,
    personalChords,
    chordsByNames,
    searchChords,
    debouncedQuery,
  ]);

  // Alias for consumers (CustomChordModal, getChordData)
  const dbChords = currentChords;

  const personalChordNames = useMemo(() => {
    return new Set(
      currentChords.filter((c) => c.libraryType === 'personal').map((c) => c.name)
    );
  }, [currentChords]);

  const getChordData = (chordName) => {
    const selectedPosition = selectedPositions.get(chordName) || 1;
    let chord = findChord(chordName, instrument, tuning, selectedPosition, {
      databaseChords: currentChords,
    });
    if (!chord && selectedPosition !== 1) {
      chord = findChord(chordName, instrument, tuning, 1, {
        databaseChords: currentChords,
      });
    }
    return chord;
  };

  const allChordVariations = currentChords;

  const availableChordNames = useMemo(() => {
    const names = new Set(currentChords.map((c) => c.name));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [currentChords]);

  const getVariationsForName = useMemo(() => {
    return (chordName) => currentChords.filter((c) => c.name === chordName);
  }, [currentChords]);

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

  // Expand filtered names into chord entries (only the specific position used).
  // Fret prefix (1–3 chars): show default list (all used expanded, no filter).
  // Full fret pattern (4 chars): expand all used, filter by frets.
  // Otherwise: filter by name (usedFilteredNames) then expand.
  // Prefix = fret-like input but incomplete (fewer than stringCount values).
// Use value count, not char count, so "0,0,0" (3 values) is prefix, "0,0,0,3" (4 values) is full.
const isFretPrefixOnly = isFretPatternOrPrefixQuery(trimmedQuery, stringCount) && !isFretPatternQuery(trimmedQuery, stringCount);
  const usedFiltered = useMemo(() => {
    const namesToExpand =
      isFretPrefixOnly ? usedChordNames
      : isFretPatternQuery(trimmedQuery, stringCount) ? usedChordNames
      : usedFilteredNames;
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
      
      // Find the specific variation with this position (try display name first, then DB/flat name for enharmonic)
      let variations = getVariationsForName(actualChordName);
      let matchingVariation = variations.find(v => v.position === chordPosition);

      if (!matchingVariation && toDbName(actualChordName) !== actualChordName) {
        const dbName = toDbName(actualChordName);
        variations = getVariationsForName(dbName);
        matchingVariation = variations.find(v => v.position === chordPosition);
      }

      if (matchingVariation && matchingVariation.frets) {
        const base = { ...matchingVariation, position: matchingVariation.position || 1 };
        return matchingVariation.name !== actualChordName
          ? { ...base, displayName: actualChordName }
          : base;
      }

      // Fallback: try findChord with actual name, then DB name for enharmonic
      let fallbackChord = findChord(actualChordName, instrument, tuning, chordPosition, {
        databaseChords: currentChords,
      }, null, false);
      if (!fallbackChord && toDbName(actualChordName) !== actualChordName) {
        fallbackChord = findChord(toDbName(actualChordName), instrument, tuning, chordPosition, {
          databaseChords: currentChords,
        }, null, false);
      }
      if (fallbackChord && fallbackChord.frets) {
        const base = { ...fallbackChord, source: fallbackChord.libraryType === 'personal' ? 'personal' : 'main', position: fallbackChord.position || 1 };
        return actualChordName !== fallbackChord.name ? { ...base, displayName: actualChordName } : base;
      }

      // If exact position not found, try with fallback enabled (for backward compatibility)
      let fallbackWithPosition1 = findChord(actualChordName, instrument, tuning, chordPosition, {
        databaseChords: currentChords,
      }, null, true);
      if (!fallbackWithPosition1 && toDbName(actualChordName) !== actualChordName) {
        fallbackWithPosition1 = findChord(toDbName(actualChordName), instrument, tuning, chordPosition, {
          databaseChords: currentChords,
        }, null, true);
      }
      if (fallbackWithPosition1 && fallbackWithPosition1.frets) {
        const base = { ...fallbackWithPosition1, source: fallbackWithPosition1.libraryType === 'personal' ? 'personal' : 'main', position: fallbackWithPosition1.position || 1 };
        return actualChordName !== fallbackWithPosition1.name ? { ...base, displayName: actualChordName } : base;
      }

      // Last resort: return a placeholder (only if no chord data exists at all)
      return { name: actualChordName, frets: null, position: chordPosition };
    });
    // Fret prefix only: show default list (no fret filter). Full fret pattern: filter by frets.
    if (isFretPrefixOnly) return expanded;
    if (isFretPatternQuery(trimmedQuery, stringCount)) return expanded.filter((c) => chordFretsMatchPattern(c, trimmedQuery, stringCount));
    return expanded;
  }, [query, trimmedQuery, stringCount, usedChordNames, usedFilteredNames, getVariationsForName, instrument, tuning, currentChords]);

  // Helper: add source and filter by instrument/tuning
  const withSource = (arr, src) =>
    (arr || [])
      .filter((c) => c.instrument === instrument && tuningMatch(c))
      .map((c) => ({
        ...c,
        position: c.position ?? 1,
        source: typeof src === 'function' ? src(c) : (c.libraryType === 'personal' ? 'personal' : 'main'),
      }));

  // Library list: empty query = common + personal; fret prefix = same default (effective query ''); full fret pattern = search by frets; else = name search
  const libraryFilteredAll = useMemo(() => {
    const usedSet = new Set(usedChordNames);
    // Use displayName when present so sharp/flat variants are excluded independently (e.g. Bb vs A#)
    const excludeUsed = (chords) =>
      chords.filter((v) => {
        const pos = v.position ?? 1;
        const nameForKey = v.displayName ?? v.name;
        const key = pos > 1 ? `${nameForKey}:${v.position}` : nameForKey;
        return !usedSet.has(key);
      });

    // When trimmed query is a fret prefix (1–3 digits/x), treat library as empty so we show default list
    const effectiveLibraryQuery = isFretPrefixOnly ? '' : trimmedQuery;

    // Full fret pattern (4 chars): search all chords (common + personal + full main library) by frets.
    // Add sharp-display variant for each flat chord so user sees both Bb and A# (same fingering).
    if (isFretPatternQuery(trimmedQuery, stringCount)) {
      const fromCommon = withSource(commonChords, 'main');
      const fromPersonal = withSource(personalChords, 'personal');
      const fromMain = withSource(mainLibraryChords, 'main');
      const seen = new Set();
      const pool = [];
      for (const c of [...fromCommon, ...fromPersonal, ...fromMain]) {
        const key = c.id ?? `${c.name}:${c.position ?? 1}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pool.push(c);
      }
      const matched = pool.filter((c) => chordFretsMatchPattern(c, trimmedQuery, stringCount));
      const withSharpVariants = [];
      for (const c of matched) {
        withSharpVariants.push(c);
        const sharpName = toDisplaySharp(c.name);
        if (sharpName !== c.name) {
          withSharpVariants.push({ ...c, displayName: sharpName });
        }
      }
      return excludeUsed(withSharpVariants);
    }

    if (effectiveLibraryQuery) {
      // Union common + personal + search results, then filter by smart match (root+accidental, suffix prefix).
      // This ensures we show results immediately from already-loaded common/personal (e.g. A7) even before
      // debounced API search returns; search adds extra chords (maj7, dim, etc.) when they arrive.
      const fromCommonAndPersonal = [
        ...withSource(commonChords, 'main'),
        ...withSource(personalChords, 'personal'),
      ];
      const fromSearch = withSource(searchChords, (c) =>
        c.libraryType === 'personal' ? 'personal' : 'main'
      );
      const seen = new Set();
      const union = [];
      for (const c of [...fromCommonAndPersonal, ...fromSearch]) {
        const key = `${c.name}:${c.position ?? 1}`;
        if (seen.has(key)) continue;
        seen.add(key);
        union.push(c);
      }
      const filteredBySmartMatch = union.filter((c) =>
        chordMatchesQuery(c.name, effectiveLibraryQuery)
      );
      return excludeUsed(filteredBySmartMatch);
    }

    // Empty or fret-prefix: default list (common + personal)
    const fromCommonAndPersonal = [
      ...withSource(commonChords, 'main'),
      ...withSource(personalChords, 'personal'),
    ];
    return excludeUsed(fromCommonAndPersonal);
  }, [
    query,
    stringCount,
    usedChordNames,
    commonChords,
    personalChords,
    chordsByNames,
    mainLibraryChords,
    currentChords,
    searchChords,
    instrument,
    tuning,
  ]);

  const { libraryFilteredCommon, libraryFilteredAllForDisplay, libraryFiltered } = useMemo(
    () => splitLibraryForDisplay(libraryFilteredAll),
    [libraryFilteredAll]
  );

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
