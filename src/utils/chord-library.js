/**
 * Central Chord Library Utility
 * 
 * Provides functions to query and filter chords from database libraries
 * (main library and personal library).
 */

/**
 * Find a chord by name, instrument, and tuning
 * Checks multiple sources in order: embedded chords, personal library, main library
 * This prioritizes custom/user chords over standard library chords
 * @param {string} chordName - Chord name (e.g., "C", "Am", "G7")
 * @param {string} instrument - Instrument type (e.g., "ukulele")
 * @param {string} tuning - Tuning identifier (e.g., "ukulele_standard")
 * @param {string|number} positionOrVariation - Position number (1, 2, 3...) or legacy variation string ('standard' maps to 1)
 * @param {Object} options - Additional options
 * @param {Array} options.databaseChords - Array of database chord objects (main + personal)
 * @param {Array} options.embeddedChords - Array of embedded chord objects from song
 * @param {string|null} chordId - Optional chord ID for direct lookup (fastest, most reliable)
 * @param {boolean} allowPositionFallback - If false, don't fall back to position 1 when requested position isn't found (default: true)
 * @returns {Object|null} Chord data object or null if not found
 */
export function findChord(
  chordName, 
  instrument = 'ukulele', 
  tuning = 'ukulele_standard', 
  positionOrVariation = 1,
  options = {},
  chordId = null,
  allowPositionFallback = true
) {
  if (!chordName) return null;
  
  const { databaseChords = [], embeddedChords = [] } = options;
  
  // If chordId provided, use it directly (fastest, most reliable)
  // Check embedded chords first (song-specific), then database
  if (chordId) {
    const fromEmbedded = embeddedChords.find(c => c.id === chordId);
    if (fromEmbedded) return fromEmbedded;
    if (databaseChords.length > 0) {
      const chord = databaseChords.find(c => c.id === chordId);
      if (chord) return chord;
    }
  }
  
  // Convert legacy variation string to position number (backward compatibility)
  let position = positionOrVariation;
  if (typeof positionOrVariation === 'string') {
    position = positionOrVariation === 'standard' ? 1 : 1; // Map 'standard' to 1, others default to 1
  }
  if (typeof position !== 'number' || position < 1) {
    position = 1; // Default to position 1
  }
  
  // 1. Check embedded chords first (highest priority - song-specific custom chords)
  // Match position so the correct diagram is shown for each chord position (e.g. Dm7 1, 2, 3).
  // Embedded chords without a position field are treated as position 1.
  const positionMatches = (c) => (c.position == null || c.position === undefined) ? position === 1 : c.position === position;
  let chord = embeddedChords.find(c => 
    c.name === chordName &&
    c.instrument === instrument &&
    c.tuning === tuning &&
    positionMatches(c)
  );
  
  // Case-insensitive fallback for embedded chords (still match position)
  if (!chord) {
    chord = embeddedChords.find(c => 
      c.name.toLowerCase() === chordName.toLowerCase() &&
      c.instrument === instrument &&
      c.tuning === tuning &&
      positionMatches(c)
    );
  }
  
  // If no exact position match in embedded and fallback allowed, use first matching chord by name
  if (!chord && embeddedChords.length > 0 && allowPositionFallback) {
    chord = embeddedChords.find(c => 
      c.name === chordName &&
      c.instrument === instrument &&
      c.tuning === tuning
    );
    if (!chord) {
      chord = embeddedChords.find(c => 
        c.name.toLowerCase() === chordName.toLowerCase() &&
        c.instrument === instrument &&
        c.tuning === tuning
      );
    }
  }
  
  // 2. Check personal library chords (user's custom chords take precedence)
  if (!chord && databaseChords.length > 0) {
    // Try to find chord with matching position
    chord = databaseChords.find(c => 
      c.name === chordName &&
      c.instrument === instrument &&
      c.tuning === tuning &&
      c.position === position &&
      c.libraryType === 'personal'
    );
    
    // If not found with specific position and fallback is allowed, fall back to position 1 (most common)
    if (!chord && position !== 1 && allowPositionFallback) {
      chord = databaseChords.find(c => 
        c.name === chordName &&
        c.instrument === instrument &&
        c.tuning === tuning &&
        c.position === 1 &&
        c.libraryType === 'personal'
      );
    }
    
    // Case-insensitive fallback (any position) - only if fallback is allowed or we're looking for position 1
    if (!chord && (allowPositionFallback || position === 1)) {
      chord = databaseChords.find(c => 
        c.name.toLowerCase() === chordName.toLowerCase() &&
        c.instrument === instrument &&
        c.tuning === tuning &&
        c.libraryType === 'personal'
      );
    }
  }
  
  // 3. Check database chords (main library)
  if (!chord && databaseChords.length > 0) {
    // Try to find chord with matching position
    chord = databaseChords.find(c => 
      c.name === chordName &&
      c.instrument === instrument &&
      c.tuning === tuning &&
      c.position === position &&
      c.libraryType === 'main'
    );
    
    // If not found with specific position and fallback is allowed, fall back to position 1 (most common)
    if (!chord && position !== 1 && allowPositionFallback) {
      chord = databaseChords.find(c => 
        c.name === chordName &&
        c.instrument === instrument &&
        c.tuning === tuning &&
        c.position === 1 &&
        c.libraryType === 'main'
      );
    }
    
    // Case-insensitive fallback (any position) - only if fallback is allowed or we're looking for position 1
    if (!chord && (allowPositionFallback || position === 1)) {
      chord = databaseChords.find(c => 
        c.name.toLowerCase() === chordName.toLowerCase() &&
        c.instrument === instrument &&
        c.tuning === tuning &&
        c.libraryType === 'main'
      );
    }
  }
  
  return chord || null;
}

/**
 * Get all variations of a chord for an instrument/tuning
 * Includes chords from database main library and personal library
 * @param {string} chordName - Chord name
 * @param {string} instrument - Instrument type
 * @param {string} tuning - Tuning identifier
 * @param {Object} options - Additional options
 * @param {Array} options.databaseChords - Array of database chord objects (main + personal)
 * @returns {Array} Array of chord objects with different variations
 */
export function getChordVariations(chordName, instrument = 'ukulele', tuning = 'ukulele_standard', options = {}) {
  const { databaseChords = [] } = options;
  
  const variations = [];
  
  // Get database variations (main library)
  const mainVariations = databaseChords.filter(c => 
    c.name === chordName &&
    c.instrument === instrument &&
    c.tuning === tuning &&
    c.libraryType === 'main'
  );
  variations.push(...mainVariations);
  
  // Get personal library variations
  const personalVariations = databaseChords.filter(c => 
    c.name === chordName &&
    c.instrument === instrument &&
    c.tuning === tuning &&
    c.libraryType === 'personal'
  );
  variations.push(...personalVariations);
  
  // Deduplicate by frets (keep unique fret patterns)
  // Normalize frets to string for comparison (handles both string and array formats)
  const normalizeFrets = (frets) => {
    if (Array.isArray(frets)) {
      return frets.join(',');
    }
    return String(frets);
  };
  
  const seenFrets = new Set();
  const uniqueVariations = variations.filter(chord => {
    const fretsKey = `${normalizeFrets(chord.frets)}-${chord.instrument}-${chord.tuning}`;
    if (seenFrets.has(fretsKey)) {
      return false;
    }
    seenFrets.add(fretsKey);
    return true;
  });
  
  return uniqueVariations;
}

/**
 * Get unique chord names for autocomplete
 * Returns sorted list of unique chord names for the given instrument/tuning
 * @param {string} instrument - Instrument type
 * @param {string} tuning - Tuning identifier
 * @param {Object} options - Additional options
 * @param {Array} options.databaseChords - Array of database chord objects (main + personal)
 * @returns {Array<string>} Sorted array of unique chord names
 */
export function getChordNames(instrument = 'ukulele', tuning = 'ukulele_standard', options = {}) {
  const { databaseChords = [] } = options;
  
  // Get database chord names (main + personal)
  const dbNames = databaseChords
    .filter(c => c.instrument === instrument && c.tuning === tuning)
    .map(c => c.name);
  
  // Deduplicate and return sorted
  const allNames = [...new Set(dbNames)];
  return allNames.sort((a, b) => a.localeCompare(b));
}

/**
 * Search chords by name (case-insensitive, partial match)
 * @param {string} query - Search query
 * @param {string} instrument - Instrument type
 * @param {string} tuning - Tuning identifier
 * @param {number} limit - Maximum number of results
 * @param {Object} options - Additional options
 * @param {Array} options.databaseChords - Array of database chord objects (main + personal)
 * @returns {Array<string>} Array of matching chord names
 */
export function searchChordNames(
  query, 
  instrument = 'ukulele', 
  tuning = 'ukulele_standard', 
  limit = 20,
  options = {}
) {
  if (!query || query.length < 1) return [];
  
  const allNames = getChordNames(instrument, tuning, options);
  const lowerQuery = query.toLowerCase();
  
  return allNames
    .filter(name => name.toLowerCase().includes(lowerQuery))
    .slice(0, limit);
}

/**
 * Get all available chords from database
 * @param {string} instrument - Instrument type
 * @param {string} tuning - Tuning identifier
 * @param {Object} options - Additional options
 * @param {Array} options.databaseChords - Array of database chord objects (main + personal)
 * @returns {Array} Array of chord objects with source indicator
 */
export function getAllAvailableChords(instrument = 'ukulele', tuning = 'ukulele_standard', options = {}) {
  const { databaseChords = [] } = options;
  
  // Get database chords
  const dbChords = databaseChords
    .filter(c => c.instrument === instrument && c.tuning === tuning)
    .map(c => ({
      ...c,
      source: 'database',
      isPersonal: c.libraryType === 'personal',
    }));
  
  return dbChords;
}

/**
 * Check if a chord is a "common" chord
 * Common chords are defined as: Position 1 chords from the main library with suffixes:
 * - "major" (or empty/null)
 * - "m" or "minor" (minor)
 * - exactly "7" (dominant 7th, not "m7", "maj7", etc.)
 * @param {Object} chord - Chord object with position, libraryType, and suffix fields
 * @returns {boolean} True if the chord is a common chord
 */
export function isCommonChord(chord) {
  if (!chord) return false;
  
  // Must be position 1
  if (chord.position !== 1) return false;
  
  // Must be from main library
  if (chord.libraryType !== 'main') return false;
  
  // Get suffix (normalize to handle empty/null/undefined)
  const suffix = (chord.suffix || '').trim().toLowerCase();
  
  // Common suffixes: empty, "major", "m", "minor", or exactly "7"
  if (suffix === '' || suffix === 'major') return true;
  if (suffix === 'm' || suffix === 'minor') return true;
  if (suffix === '7') return true;
  
  return false;
}

/**
 * Get suffix from chord name (everything after the root note A-G optional #/b).
 * Used as fallback when chord.suffix is missing or not in our common list.
 */
function getSuffixFromChordName(name) {
  if (!name || typeof name !== 'string') return '';
  const match = name.match(/^[A-Ga-g][#b]?(.*)$/i);
  return match ? (match[1] || '').trim().toLowerCase() : '';
}

/**
 * Check if a chord has a "common" chord type (major, 7th, or minor) by suffix, with fallback from name.
 * Used for sorting the "All chords" section: alternate positions of these types appear first.
 * No check on position or libraryType.
 * @param {Object} chord - Chord object with suffix and name fields
 * @returns {boolean} True if suffix (or name-derived suffix) is major, 7, or minor
 */
export function isCommonChordType(chord) {
  if (!chord) return false;
  const suffix = (chord.suffix || '').trim().toLowerCase();
  if (suffix === '' || suffix === 'major') return true;
  if (suffix === '7') return true;
  if (suffix === 'm' || suffix === 'minor') return true;
  // Fallback: infer from chord name when suffix is missing or not in our list (e.g. DB uses different values)
  const nameSuffix = getSuffixFromChordName(chord.name);
  if (!nameSuffix || nameSuffix === '') return true; // major
  if (nameSuffix === '7' || /^7(\s|$)/.test(nameSuffix)) return true; // dominant 7 only
  if (nameSuffix === 'm' || nameSuffix === 'min' || nameSuffix === 'minor' ||
      /^m(\s|$)/.test(nameSuffix) || /^min(\s|$)/.test(nameSuffix) || /^minor(\s|$)/.test(nameSuffix)) {
    return true; // minor
  }
  return false;
}

