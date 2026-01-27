import { useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useAllDatabaseChords } from '../db/queries';
import ChordDiagram from '../components/ChordDiagram';

const DEFAULT_INSTRUMENT = 'ukulele';
const DEFAULT_TUNING = 'ukulele_standard';

/**
 * Extract the root note from a chord name (e.g., "C", "C#", "Db")
 * @param {string} chordName - Chord name (e.g., "C", "Cm", "C7", "C#maj7")
 * @returns {string} Root note (e.g., "C", "C#", "Db")
 */
function extractRootNote(chordName) {
  if (!chordName || chordName.length === 0) return '';
  
  // Match root note: A-G optionally followed by # or b
  // Use case-insensitive matching but preserve the case of the accidental
  const match = chordName.match(/^([A-Ga-g][#b]?)/i);
  if (match) {
    const result = match[1];
    // Normalize the note letter to uppercase, but preserve the accidental (# or b)
    const note = result.charAt(0).toUpperCase();
    const accidental = result.length > 1 ? result.charAt(1) : '';
    return note + accidental;
  }
  return '';
}

/**
 * Check if a chord is minor
 * @param {string} chordName - Chord name (e.g., "Cm", "Am7", "Cmaj7")
 * @returns {boolean} True if the chord is minor
 */
function isMinorChord(chordName) {
  if (!chordName) return false;
  const name = chordName.toLowerCase();
  
  // Exclude major chords explicitly marked with "maj"
  if (name.includes('maj')) {
    return false;
  }
  
  // Check for explicit "min"
  if (name.includes('min')) {
    return true;
  }
  
  // Check for "m" that comes after the root note
  // Pattern: root note (A-G, optional #/b) followed by "m"
  const minorPattern = /^[a-g][#b]?m/;
  return minorPattern.test(name);
}

/**
 * Check if a chord matches the search query with smart filtering
 * @param {string} chordName - Chord name to check
 * @param {string} query - Search query
 * @returns {boolean} True if the chord matches the query
 */
function matchesRootQuery(chordName, query) {
  if (!chordName || !query) return false;
  
  const normalizedChord = chordName.toLowerCase();
  const normalizedQuery = query.trim().toLowerCase();
  
  if (normalizedQuery.length === 0) return true;
  
  // Extract root notes
  const chordRoot = extractRootNote(chordName).toLowerCase();
  const queryRoot = extractRootNote(query).toLowerCase();
  
  // Check if query explicitly includes "m" or "min" (indicating minor search)
  const queryWantsMinor = /^[a-g][#b]?m/i.test(normalizedQuery) || normalizedQuery.includes('min');
  
  // Check if the query is just a root note (no extensions after the root)
  // Pattern: root note (A-G, optional #/b) with nothing or just whitespace after
  const isJustRootNote = /^[a-g][#b]?\s*$/i.test(normalizedQuery);
  
  // If query is just a root note (e.g., "C"), exclude minor chords (e.g., "Cm")
  // But only if the chord root matches the query root
  if (isJustRootNote && !queryWantsMinor && chordRoot === queryRoot) {
    if (isMinorChord(chordName)) {
      return false;
    }
  }
  
  // Check if chord starts with the query
  return normalizedChord.startsWith(normalizedQuery);
}

/**
 * Get suffix priority for sorting (lower = more common)
 * Improved priority system based on common chord usage
 */
function getSuffixPriority(chordName) {
  const name = chordName.toLowerCase();
  
  // Extract the root note to get just the suffix
  const rootNote = extractRootNote(chordName).toLowerCase();
  const suffix = name.substring(rootNote.length);
  
  // Priority 0: Major chords (no suffix) - e.g., "C", "C#", "Db"
  if (!suffix || suffix.trim().length === 0) {
    return 0;
  }
  
  // Priority 1: Dominant 7th - e.g., "C7", "G7"
  // Check for standalone "7" (not part of "11", "13", "m7", "maj7")
  if (/^7(\s|$)/.test(suffix) || suffix === '7') {
    return 1;
  }
  
  // Priority 2: Major 6th - e.g., "C6", "G6"
  if (/^6(\s|$)/.test(suffix) || suffix === '6') {
    return 2;
  }
  
  // Priority 3: Major 7th - e.g., "Cmaj7", "Gmaj7"
  if (name.includes('maj7')) {
    return 3;
  }
  
  // Priority 4: Minor - e.g., "Cm", "Am"
  if (isMinorChord(chordName) && !name.includes('m7') && !name.includes('m6')) {
    return 4;
  }
  
  // Priority 5: Minor 7th - e.g., "Cm7", "Am7"
  if (name.includes('m7')) {
    return 5;
  }
  
  // Priority 6: Suspended - e.g., "Csus2", "Csus4"
  if (name.includes('sus')) {
    return 6;
  }
  
  // Priority 7: Added tones - e.g., "Cadd9"
  if (name.includes('add')) {
    return 7;
  }
  
  // Priority 8+: Diminished, augmented, and other extensions
  if (name.includes('dim')) {
    return 8;
  }
  if (name.includes('aug')) {
    return 9;
  }
  
  // Other extensions (like 11, 13, 9, etc.) get lower priority
  return 10;
}

/**
 * Get root note for sorting
 * Returns a numeric value for sorting (A=0, B=1, C=2, etc.)
 */
function getRootNoteValue(chordName) {
  const firstChar = chordName.charAt(0).toUpperCase();
  const noteOrder = { 'A': 0, 'B': 1, 'C': 2, 'D': 3, 'E': 4, 'F': 5, 'G': 6 };
  return noteOrder[firstChar] ?? 99;
}

/**
 * Check if a chord is considered "popular/common"
 * Popular chords are: position 1, common suffixes or no suffix
 */
function isPopularChord(chord) {
  if (chord.position !== 1) return false;
  
  const suffixPriority = getSuffixPriority(chord.name);
  // Popular chords have priority 0-3 (basic, minor, 7, m7)
  return suffixPriority <= 3;
}

/**
 * Get root note order for sorting common chords
 * Returns a numeric value for sorting root notes in the desired order
 * Order: C, C#, Db, D, D#, Eb, E, F, F#, Gb, G, G#, Ab, A, A#, Bb, B
 */
function getRootNoteOrder(chordName) {
  const rootNote = extractRootNote(chordName);
  if (!rootNote) return 99;
  
  const rootNoteMap = {
    'C': 0,
    'C#': 1,
    'Db': 2,
    'D': 3,
    'D#': 4,
    'Eb': 5,
    'E': 6,
    'F': 7,
    'F#': 8,
    'Gb': 9,
    'G': 10,
    'G#': 11,
    'Ab': 12,
    'A': 13,
    'A#': 14,
    'Bb': 15,
    'B': 16,
  };
  
  return rootNoteMap[rootNote] ?? 99;
}

/**
 * Check if a chord is a common chord to show on initial load
 * Common chords are: position 1, root notes C through B (with sharps/flats), 
 * and suffixes: major (none), minor (m/min/minor), or dominant 7th (7)
 */
function isCommonChord(chord) {
  // Must be position 1
  if (chord.position !== 1) return false;
  
  // Extract root note
  const rootNote = extractRootNote(chord.name);
  if (!rootNote) return false;
  
  // Check if root note is in the common list (C through B with sharps/flats)
  const commonRootNotes = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];
  if (!commonRootNotes.includes(rootNote)) return false;
  
  // Extract suffix (everything after the root note)
  const name = chord.name.toLowerCase();
  const rootNoteLower = rootNote.toLowerCase();
  const suffix = name.substring(rootNoteLower.length).trim();
  
  // Check if suffix matches: empty (major), "m"/"min"/"minor" (minor), or standalone "7" (dominant 7th)
  // Must be standalone "7" - not "m7", "maj7", "7sus4", etc.
  if (!suffix || suffix.length === 0) {
    // Major chord (no suffix)
    return true;
  }
  
  // Check for minor: "m", "min", or "minor" (but not "m7", "maj7", etc.)
  if (suffix === 'm' || suffix === 'min' || suffix === 'minor' ||
      /^m(\s|$)/.test(suffix) || /^min(\s|$)/.test(suffix) || /^minor(\s|$)/.test(suffix)) {
    return true;
  }
  
  // Check for dominant 7th: standalone "7" (not part of "11", "13", "m7", "maj7")
  if (/^7(\s|$)/.test(suffix) || suffix === '7') {
    return true;
  }
  
  return false;
}

/**
 * Sort chord groups by commonality
 * @param {Array} groups - Array of chord groups with name property
 * @param {string} searchQuery - Optional search query for exact match bonus
 */
function sortChordGroups(groups, searchQuery = '') {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  
  return groups.sort((a, b) => {
    const nameA = a.name;
    const nameB = b.name;
    
    // Check for exact matches (bonus priority)
    const exactMatchA = normalizedQuery && nameA.toLowerCase() === normalizedQuery;
    const exactMatchB = normalizedQuery && nameB.toLowerCase() === normalizedQuery;
    
    if (exactMatchA && !exactMatchB) return -1;
    if (exactMatchB && !exactMatchA) return 1;
    
    // First sort by root note
    const rootA = getRootNoteOrder(nameA);
    const rootB = getRootNoteOrder(nameB);
    if (rootA !== rootB) {
      return rootA - rootB;
    }
    
    // Then sort by suffix priority
    const priorityA = getSuffixPriority(nameA);
    const priorityB = getSuffixPriority(nameB);
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }
    
    // Finally alphabetically
    return nameA.localeCompare(nameB);
  });
}

const INITIAL_GROUPS_TO_SHOW = 15; // Show first 15 chord groups initially
const GROUPS_PER_PAGE = 10; // Load 10 more groups per click

export default function ChordsPage() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [groupsToShow, setGroupsToShow] = useState(INITIAL_GROUPS_TO_SHOW);
  
  // Get all chords from database
  // Note: This may timeout with large datasets, but we'll use whatever loads
  const { data: chordsData, error: chordsError } = useAllDatabaseChords(user?.id, DEFAULT_INSTRUMENT, DEFAULT_TUNING);
  
  // Use whatever chords loaded, even if there was a timeout error
  const allChords = chordsData?.chords || [];
  
  // Check for timeout errors (expected with large datasets)
  const isTimeoutError = chordsError?.type === 'operation-timed-out' || 
                        chordsError?.type === 'operation_timed_out' ||
                        (chordsError?.message && chordsError.message.includes('timed out') || 
                         chordsError?.message && chordsError.message.includes('timed-out'));
  
  // Filter chords by search query
  const filteredChords = useMemo(() => {
    if (!searchQuery.trim()) {
      // When no search query, show common chords only (position 1, major/minor/7th for C-B)
      return allChords.filter(chord => isCommonChord(chord));
    }
    
    // Use smart filtering that excludes minor chords when searching for just root note
    const query = searchQuery.trim();
    return allChords.filter(chord => matchesRootQuery(chord.name, query));
  }, [allChords, searchQuery]);
  
  // Group chords by name (or root note when no search) and sort
  const allChordGroups = useMemo(() => {
    // When no search query, group by root note; otherwise group by chord name
    const groupByRootNote = !searchQuery.trim();
    
    if (groupByRootNote) {
      // Group by root note for initial view
      const groupsMap = new Map();
      
      filteredChords.forEach(chord => {
        const rootNote = extractRootNote(chord.name);
        if (!rootNote) return;
        
        if (!groupsMap.has(rootNote)) {
          groupsMap.set(rootNote, []);
        }
        groupsMap.get(rootNote).push(chord);
      });
      
      // Convert to array and sort chords within each root note group by suffix priority
      const groups = Array.from(groupsMap.entries()).map(([rootNote, chords]) => ({
        name: rootNote,
        chords: chords.sort((a, b) => {
          // Sort by suffix priority (major=0, 7th=1, minor=4)
          const priorityA = getSuffixPriority(a.name);
          const priorityB = getSuffixPriority(b.name);
          if (priorityA !== priorityB) {
            return priorityA - priorityB;
          }
          // If same priority, sort alphabetically
          return a.name.localeCompare(b.name);
        })
      }));
      
      // Sort groups by root note order
      return groups.sort((a, b) => {
        const rootA = getRootNoteOrder(a.name);
        const rootB = getRootNoteOrder(b.name);
        return rootA - rootB;
      });
    } else {
      // Group by chord name for search results
      const groupsMap = new Map();
      
      filteredChords.forEach(chord => {
        const name = chord.name;
        if (!groupsMap.has(name)) {
          groupsMap.set(name, []);
        }
        groupsMap.get(name).push(chord);
      });
      
      // Convert to array and sort chords within each group by position
      const groups = Array.from(groupsMap.entries()).map(([name, chords]) => ({
        name,
        chords: chords.sort((a, b) => (a.position || 1) - (b.position || 1))
      }));
      
      // Sort groups by commonality (pass search query for exact match bonus)
      return sortChordGroups(groups, searchQuery);
    }
  }, [filteredChords, searchQuery]);
  
  // Reset groups to show when search query changes
  const displayGroups = useMemo(() => {
    return allChordGroups.slice(0, groupsToShow);
  }, [allChordGroups, groupsToShow]);
  
  const hasMoreGroups = allChordGroups.length > groupsToShow;
  
  // Reset pagination when search query changes
  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    setGroupsToShow(INITIAL_GROUPS_TO_SHOW);
  };
  
  const handleLoadMore = () => {
    setGroupsToShow(prev => prev + GROUPS_PER_PAGE);
  };
  
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="heading-alice">Chords</h1>
      </div>
      
      {/* Error Display - show timeout warnings subtly */}
      {isTimeoutError && allChords.length === 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded text-amber-800">
          <p className="font-semibold mb-1">Database Query Timeout</p>
          <p className="text-sm">
            The database query timed out due to a large number of chords. Please refresh the page or try searching for a specific chord.
          </p>
        </div>
      )}
      
      {/* Search Input */}
      <div>
        <input
          type="text"
          value={searchQuery}
          onChange={handleSearchChange}
          placeholder="Search chords (e.g., C, C7, Am)..."
          className="input w-full max-w-md"
        />
        {!searchQuery && (
          <p className="mt-2 text-sm text-gray-600">
            Showing common chords (C through B, major/minor/7th, position 1). Enter a chord name to see all variations.
          </p>
        )}
        {searchQuery && allChordGroups.length > 0 && (
          <p className="mt-2 text-sm text-gray-600">
            Showing {displayGroups.length} of {allChordGroups.length} chord {allChordGroups.length === 1 ? 'group' : 'groups'} matching "{searchQuery}"
          </p>
        )}
        {isTimeoutError && allChords.length > 0 && (
          <p className="mt-2 text-sm text-amber-600">
            Note: Database query timed out. Showing {allChords.length} chords that loaded successfully.
          </p>
        )}
      </div>
      
      {/* Chord Display */}
      {allChordGroups.length === 0 ? (
        <div className="card text-center py-12">
          {!searchQuery ? (
            <>
              <p className="text-gray-500 text-lg mb-4">
                Search for a chord to see all variations and positions
              </p>
              <p className="text-sm text-gray-400">
                Try searching for common chords like "C", "Am", "G7", etc.
              </p>
            </>
          ) : (
            <>
              <p className="text-gray-500 text-lg">
                No chords found matching "{searchQuery}"
              </p>
              {isTimeoutError && allChords.length === 0 && (
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
                {/* Group Header */}
                <h2 className="text-2xl font-semibold text-gray-900">{group.name}</h2>
                
                {/* Chord Diagrams Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                  {group.chords.map((chord, index) => (
                    <div key={`${chord.id || index}-${chord.position || 1}`} className="flex flex-col items-center">
                      <ChordDiagram
                        frets={chord.frets}
                        baseFret={chord.baseFret}
                        chordName={chord.name}
                        position={chord.position}
                        instrument={chord.instrument || DEFAULT_INSTRUMENT}
                        tuning={chord.tuning || DEFAULT_TUNING}
                      />
                      {/* Only show position label when searching (not in initial grouped view) */}
                      {searchQuery && (
                        <span className="mt-2 text-sm text-gray-600">
                          Position {chord.position || 1}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          
          {/* Load More Button */}
          {hasMoreGroups && (
            <div className="flex justify-center pt-4">
              <button
                onClick={handleLoadMore}
                className="btn btn-secondary"
              >
                Load More ({allChordGroups.length - groupsToShow} more {allChordGroups.length - groupsToShow === 1 ? 'group' : 'groups'})
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
