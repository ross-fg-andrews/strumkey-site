import { useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useAllDatabaseChords } from '../db/queries';
import ChordDiagram from '../components/ChordDiagram';
import AccessibleSelect from '../components/AccessibleSelect';
import {
  chordMatchesQuery,
  normalizeQuery,
  isFretPatternQuery,
  chordFretsMatchPattern,
  isFretPatternOrPrefixQuery,
  getStringCountForInstrument,
} from '../utils/chord-autocomplete-helpers';
import { isCommonChord, isCommonChordType, findChord } from '../utils/chord-library';
import { getDisplayChordName } from '../utils/enharmonic';

const DEFAULT_INSTRUMENT = 'ukulele';
const DEFAULT_TUNING = 'ukulele_standard';

const TUNING_OPTIONS = [
  { value: 'ukulele_standard', label: 'Standard (GCEA)' },
  { value: 'ukulele_baritone', label: 'Baritone (DGBE)' },
];

/**
 * Extract the root note from a chord name (e.g., "C", "C#", "Db")
 * Used for grouping and root-note sort order.
 */
function extractRootNote(chordName) {
  if (!chordName || chordName.length === 0) return '';
  const match = chordName.match(/^([A-Ga-g][#b]?)/i);
  if (match) {
    const result = match[1];
    return result.charAt(0).toUpperCase() + (result.length > 1 ? result.charAt(1) : '');
  }
  return '';
}

/**
 * Get root note order for sorting chord groups
 * Order: C, C#, Db, D, D#, Eb, E, F, F#, Gb, G, G#, Ab, A, A#, Bb, B
 */
function getRootNoteOrder(chordName) {
  const rootNote = extractRootNote(chordName);
  if (!rootNote) return 99;
  const rootNoteMap = {
    C: 0, 'C#': 1, Db: 2, D: 3, 'D#': 4, Eb: 5, E: 6, F: 7, 'F#': 8,
    Gb: 9, G: 10, 'G#': 11, Ab: 12, A: 13, 'A#': 14, Bb: 15, B: 16,
  };
  return rootNoteMap[rootNote] ?? 99;
}

/**
 * Order for common chord types in default view: major (0), minor (1), 7th (2)
 */
function commonTypeOrderForDefault(suffix, name) {
  const s = (suffix || '').trim().toLowerCase();
  if (s === '' || s === 'major') return 0;
  if (s === 'm' || s === 'minor') return 1;
  if (s === '7') return 2;
  if (name) {
    const m = name.match(/^[A-Ga-g][#b]?(.*)$/i);
    const n = (m ? (m[1] || '') : '').trim().toLowerCase();
    if (!n) return 0;
    if (/^m(\s|$)/.test(n) || /^min(\s|$)/.test(n) || /^minor(\s|$)/.test(n)) return 1;
    if (n === '7' || /^7(\s|$)/.test(n)) return 2;
  }
  return 99; // other
}

/**
 * Sort chords within a group. For default view: major, minor, 7th per root.
 * For search results: modal logic (common type pos>=2 first, then SUFFIX_POPULARITY_ORDER, then position).
 */
function sortChordsWithinGroup(chords, useDefaultOrder = false) {
  const pos = (c) => (Number.isInteger(Number(c.position)) && c.position >= 1 ? Number(c.position) : 1);
  const getSuffixForSort = (chord) => {
    const fromSuffix = (chord.suffix || '').trim().toLowerCase();
    if (fromSuffix) return fromSuffix;
    const match = (chord.name || '').match(/^[A-Ga-g][#b]?(.*)$/i);
    return (match ? (match[1] || '') : '').trim().toLowerCase();
  };

  if (useDefaultOrder) {
    return [...chords].sort((a, b) => {
      const orderA = commonTypeOrderForDefault(a.suffix, a.name);
      const orderB = commonTypeOrderForDefault(b.suffix, b.name);
      if (orderA !== orderB) return orderA - orderB;
      return (a.name || '').localeCompare(b.name || '');
    });
  }

  const SUFFIX_POPULARITY_ORDER = ['maj7', 'm7', 'sus4', 'sus2', 'add9', 'aug', '6', 'dim', '9'];
  const RANK_OTHER = 9;
  const commonTypeOrder = (suffix, name) => {
    const s = (suffix || '').trim().toLowerCase();
    if (s === '' || s === 'major') return 0;
    if (s === '7') return 1;
    if (s === 'm' || s === 'minor') return 2;
    if (name) {
      const m = name.match(/^[A-Ga-g][#b]?(.*)$/i);
      const n = (m ? (m[1] || '') : '').trim().toLowerCase();
      if (!n) return 0;
      if (n === '7' || /^7(\s|$)/.test(n)) return 1;
      if (/^m(\s|$)/.test(n) || /^min(\s|$)/.test(n) || /^minor(\s|$)/.test(n)) return 2;
    }
    return 0;
  };
  const group1 = chords.filter((c) => isCommonChordType(c) && pos(c) >= 2);
  const group2 = chords.filter((c) => !(isCommonChordType(c) && pos(c) >= 2));
  const group1Sorted = [...group1].sort((a, b) => {
    const typeA = commonTypeOrder(a.suffix, a.name);
    const typeB = commonTypeOrder(b.suffix, b.name);
    if (typeA !== typeB) return typeA - typeB;
    return pos(a) - pos(b);
  });
  const group2Sorted = [...group2].sort((a, b) => {
    const sufA = getSuffixForSort(a);
    const sufB = getSuffixForSort(b);
    const rankA = SUFFIX_POPULARITY_ORDER.includes(sufA) ? SUFFIX_POPULARITY_ORDER.indexOf(sufA) : RANK_OTHER;
    const rankB = SUFFIX_POPULARITY_ORDER.includes(sufB) ? SUFFIX_POPULARITY_ORDER.indexOf(sufB) : RANK_OTHER;
    if (rankA !== rankB) return rankA - rankB;
    if (rankA === RANK_OTHER && sufA !== sufB) return sufA.localeCompare(sufB);
    return pos(a) - pos(b);
  });
  return [...group1Sorted, ...group2Sorted];
}

const INITIAL_GROUPS_TO_SHOW = 15;
const GROUPS_PER_PAGE = 10;

export default function ChordsPage() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [tuning, setTuning] = useState(DEFAULT_TUNING);
  const [groupsToShow, setGroupsToShow] = useState(INITIAL_GROUPS_TO_SHOW);

  const stringCount = getStringCountForInstrument(DEFAULT_INSTRUMENT, tuning);
  const trimmedQuery = (searchQuery ?? '').trim();
  const isFretPrefixOnly = isFretPatternOrPrefixQuery(trimmedQuery, stringCount) && !isFretPatternQuery(trimmedQuery, stringCount);

  // Load standard chords when baritone (library stores standard only; baritone uses transpose)
  const dbTuning = tuning === 'ukulele_baritone' ? 'ukulele_standard' : tuning;
  const { data: chordsData, error: chordsError } = useAllDatabaseChords(user?.id, DEFAULT_INSTRUMENT, dbTuning);

  const allChords = chordsData?.chords || [];

  const isTimeoutError = chordsError?.type === 'operation-timed-out' ||
    chordsError?.type === 'operation_timed_out' ||
    (chordsError?.message && (chordsError.message.includes('timed out') || chordsError.message.includes('timed-out')));

  // Filter chords by search query (uses chordMatchesQuery, fret pattern, or common chords)
  const filteredChords = useMemo(() => {
    const effectiveQuery = isFretPrefixOnly ? '' : trimmedQuery;

    if (!effectiveQuery) {
      return allChords.filter((c) => isCommonChord(c));
    }

    if (isFretPatternQuery(effectiveQuery, stringCount)) {
      return allChords.filter((c) => chordFretsMatchPattern(c, effectiveQuery, stringCount));
    }

    const normalized = normalizeQuery(effectiveQuery);
    return allChords.filter((c) => chordMatchesQuery(c.name, normalized));
  }, [allChords, trimmedQuery, isFretPrefixOnly, stringCount]);

  // Group chords by root note (no query) or chord name (with query), and sort
  const allChordGroups = useMemo(() => {
    const groupByRootNote = !trimmedQuery || isFretPrefixOnly;

    if (groupByRootNote) {
      const groupsMap = new Map();
      filteredChords.forEach((chord) => {
        const rootNote = extractRootNote(chord.name);
        if (!rootNote) return;
        if (!groupsMap.has(rootNote)) groupsMap.set(rootNote, []);
        groupsMap.get(rootNote).push(chord);
      });
      const groups = Array.from(groupsMap.entries()).map(([rootNote, chords]) => ({
        name: rootNote,
        chords: sortChordsWithinGroup(chords, true), // major, minor, 7th order
      }));
      return groups.sort((a, b) => getRootNoteOrder(a.name) - getRootNoteOrder(b.name));
    }

    const groupsMap = new Map();
    filteredChords.forEach((chord) => {
      const name = chord.name;
      if (!groupsMap.has(name)) groupsMap.set(name, []);
      groupsMap.get(name).push(chord);
    });
    const groups = Array.from(groupsMap.entries()).map(([name, chords]) => ({
      name,
      chords: chords.sort((a, b) => (a.position || 1) - (b.position || 1)),
    }));
    const normalizedQuery = normalizeQuery(trimmedQuery);
    return groups.sort((a, b) => {
      const exactA = normalizedQuery && a.name.toLowerCase() === normalizedQuery.toLowerCase();
      const exactB = normalizedQuery && b.name.toLowerCase() === normalizedQuery.toLowerCase();
      if (exactA && !exactB) return -1;
      if (exactB && !exactA) return 1;
      const rootA = getRootNoteOrder(a.name);
      const rootB = getRootNoteOrder(b.name);
      if (rootA !== rootB) return rootA - rootB;
      return a.name.localeCompare(b.name);
    });
  }, [filteredChords, trimmedQuery, isFretPrefixOnly]);

  const displayGroups = useMemo(() => allChordGroups.slice(0, groupsToShow), [allChordGroups, groupsToShow]);
  const hasMoreGroups = allChordGroups.length > groupsToShow;

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    setGroupsToShow(INITIAL_GROUPS_TO_SHOW);
  };

  const handleLoadMore = () => setGroupsToShow((prev) => prev + GROUPS_PER_PAGE);

  const resolveChordForDisplay = (chord) => {
    const baseName = getDisplayChordName(chord.name, trimmedQuery, normalizeQuery);
    if (tuning === 'ukulele_baritone') {
      const resolved = findChord(chord.name, DEFAULT_INSTRUMENT, tuning, chord.position || 1, {
        databaseChords: allChords,
      });
      return resolved
        ? { chordName: baseName, frets: resolved.frets, baseFret: resolved.baseFret }
        : { chordName: baseName, frets: chord.frets, baseFret: chord.baseFret };
    }
    return { chordName: baseName, frets: chord.frets, baseFret: chord.baseFret };
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="heading-alice">Chords</h1>
      </div>

      {isTimeoutError && allChords.length === 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded text-amber-800">
          <p className="font-semibold mb-1">Database Query Timeout</p>
          <p className="text-sm">
            The database query timed out due to a large number of chords. Please refresh the page or try searching for a specific chord.
          </p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
        <div className="flex-1 max-w-md">
          <label htmlFor="chord-search" className="block text-sm font-medium text-gray-700 mb-1">
            Search
          </label>
          <input
            id="chord-search"
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Search chords (e.g., C, Am, 0003)..."
            className="input w-full"
          />
        </div>
        <div className="w-full sm:w-48">
          <label htmlFor="tuning-select" className="block text-sm font-medium text-gray-700 mb-1">
            Tuning
          </label>
          <AccessibleSelect
            id="tuning-select"
            value={tuning}
            onChange={(v) => setTuning(v)}
            options={TUNING_OPTIONS}
            className="w-full"
          />
        </div>
      </div>

      {!trimmedQuery && (
        <p className="text-sm text-gray-600">
          Showing common chords (position 1, major/minor/7th). Enter a chord name to see all variations, or search by fret pattern (e.g. 0003).
        </p>
      )}
      {trimmedQuery && allChordGroups.length > 0 && (
        <p className="text-sm text-gray-600">
          Showing {displayGroups.length} of {allChordGroups.length} chord {allChordGroups.length === 1 ? 'group' : 'groups'} matching &quot;{searchQuery}&quot;
        </p>
      )}
      {isTimeoutError && allChords.length > 0 && (
        <p className="text-sm text-amber-600">
          Note: Database query timed out. Showing {allChords.length} chords that loaded successfully.
        </p>
      )}

      {allChordGroups.length === 0 ? (
        <div className="card text-center py-12">
          {!trimmedQuery ? (
            <>
              <p className="text-gray-500 text-lg mb-4">
                Search for a chord to see all variations and positions
              </p>
              <p className="text-sm text-gray-400">
                Try searching for common chords like &quot;C&quot;, &quot;Am&quot;, &quot;G7&quot;, or fret patterns like &quot;0003&quot;.
              </p>
            </>
          ) : (
            <>
              <p className="text-gray-500 text-lg">
                No chords found matching &quot;{searchQuery}&quot;
              </p>
              {isTimeoutError && (
                <p className="text-sm text-gray-400 mt-2">
                  The database query timed out. Please refresh the page or try a different search.
                </p>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-8">
            {displayGroups.map((group) => (
              <div key={group.name} className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">{getDisplayChordName(group.name, trimmedQuery, normalizeQuery)}</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                  {group.chords.map((chord, index) => {
                    const { chordName, frets, baseFret } = resolveChordForDisplay(chord);
                    return (
                      <div key={`${chord.id ?? index}-${chord.position ?? 1}`} className="flex flex-col items-center">
                        <ChordDiagram
                          frets={frets}
                          baseFret={baseFret}
                          chordName={chordName}
                          position={chord.position}
                          instrument={chord.instrument ?? DEFAULT_INSTRUMENT}
                          tuning={tuning}
                        />
                        {trimmedQuery && (
                          <span className="mt-2 text-sm text-gray-600">
                            Position {chord.position ?? 1}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {hasMoreGroups && (
            <div className="flex justify-center pt-4">
              <button onClick={handleLoadMore} className="btn btn-secondary">
                Load More ({allChordGroups.length - groupsToShow} more {allChordGroups.length - groupsToShow === 1 ? 'group' : 'groups'})
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
