/**
 * Central Chord Library Utility
 * 
 * Provides functions to query and filter chords from the static chord library
 * and database libraries (main library and personal library).
 */

import { CHORD_SEED_DATA } from '../data/chord-seed';

/**
 * Find a chord by name, instrument, and tuning
 * Checks multiple sources in order: static seed, database main library, personal library, embedded chords
 * @param {string} chordName - Chord name (e.g., "C", "Am", "G7")
 * @param {string} instrument - Instrument type (e.g., "ukulele")
 * @param {string} tuning - Tuning identifier (e.g., "ukulele_standard")
 * @param {string} variation - Variation type (e.g., "standard", "barre")
 * @param {Object} options - Additional options
 * @param {Array} options.databaseChords - Array of database chord objects (main + personal)
 * @param {Array} options.embeddedChords - Array of embedded chord objects from song
 * @returns {Object|null} Chord data object or null if not found
 */
export function findChord(
  chordName, 
  instrument = 'ukulele', 
  tuning = 'ukulele_standard', 
  variation = 'standard',
  options = {}
) {
  if (!chordName) return null;
  
  const { databaseChords = [], embeddedChords = [] } = options;
  
  // 1. Check static seed data first
  let chord = CHORD_SEED_DATA.find(c => 
    c.name === chordName &&
    c.instrument === instrument &&
    c.tuning === tuning &&
    c.variation === variation
  );
  
  // Fallback to standard variation if specific variation not found
  if (!chord && variation !== 'standard') {
    chord = CHORD_SEED_DATA.find(c => 
      c.name === chordName &&
      c.instrument === instrument &&
      c.tuning === tuning &&
      c.variation === 'standard'
    );
  }
  
  // Fallback to case-insensitive match in static data
  if (!chord) {
    chord = CHORD_SEED_DATA.find(c => 
      c.name.toLowerCase() === chordName.toLowerCase() &&
      c.instrument === instrument &&
      c.tuning === tuning
    );
  }
  
  // 2. Check database chords (main library)
  if (!chord && databaseChords.length > 0) {
    chord = databaseChords.find(c => 
      c.name === chordName &&
      c.instrument === instrument &&
      c.tuning === tuning &&
      (c.variation === variation || (!c.variation && variation === 'standard')) &&
      c.libraryType === 'main'
    );
    
    // Case-insensitive fallback
    if (!chord) {
      chord = databaseChords.find(c => 
        c.name.toLowerCase() === chordName.toLowerCase() &&
        c.instrument === instrument &&
        c.tuning === tuning &&
        c.libraryType === 'main'
      );
    }
  }
  
  // 3. Check personal library chords
  if (!chord && databaseChords.length > 0) {
    chord = databaseChords.find(c => 
      c.name === chordName &&
      c.instrument === instrument &&
      c.tuning === tuning &&
      (c.variation === variation || (!c.variation && variation === 'standard')) &&
      c.libraryType === 'personal'
    );
    
    // Case-insensitive fallback
    if (!chord) {
      chord = databaseChords.find(c => 
        c.name.toLowerCase() === chordName.toLowerCase() &&
        c.instrument === instrument &&
        c.tuning === tuning &&
        c.libraryType === 'personal'
      );
    }
  }
  
  // 4. Check embedded chords (from song)
  if (!chord && embeddedChords.length > 0) {
    chord = embeddedChords.find(c => 
      c.name === chordName &&
      c.instrument === instrument &&
      c.tuning === tuning
    );
    
    // Case-insensitive fallback
    if (!chord) {
      chord = embeddedChords.find(c => 
        c.name.toLowerCase() === chordName.toLowerCase() &&
        c.instrument === instrument &&
        c.tuning === tuning
      );
    }
  }
  
  return chord || null;
}

/**
 * Get all chords for a specific instrument and tuning
 * @param {string} instrument - Instrument type
 * @param {string} tuning - Tuning identifier
 * @returns {Array} Array of chord objects
 */
export function getAllChords(instrument = 'ukulele', tuning = 'ukulele_standard') {
  return CHORD_SEED_DATA.filter(c => 
    c.instrument === instrument &&
    c.tuning === tuning
  );
}

/**
 * Get all variations of a chord for an instrument/tuning
 * Includes static seed data and database chords (main + personal)
 * @param {string} chordName - Chord name
 * @param {string} instrument - Instrument type
 * @param {string} tuning - Tuning identifier
 * @param {Object} options - Additional options
 * @param {Array} options.databaseChords - Array of database chord objects (main + personal)
 * @returns {Array} Array of chord objects with different variations, including libraryType
 */
export function getChordVariations(chordName, instrument = 'ukulele', tuning = 'ukulele_standard', options = {}) {
  const { databaseChords = [] } = options;
  
  // Get static seed variations
  const staticVariations = CHORD_SEED_DATA
    .filter(c => 
      c.name === chordName &&
      c.instrument === instrument &&
      c.tuning === tuning
    )
    .map(c => ({
      ...c,
      libraryType: 'static',
    }));
  
  // Get database variations (main + personal)
  const dbVariations = databaseChords
    .filter(c => 
      c.name === chordName &&
      c.instrument === instrument &&
      c.tuning === tuning
    )
    .map(c => ({
      ...c,
      libraryType: c.libraryType || 'main', // Default to 'main' if not specified
    }));
  
  // Combine all variations
  // Prefer database over static for same variation (database is more up-to-date)
  const variationMap = new Map();
  
  // Add static variations first
  staticVariations.forEach(chord => {
    const key = chord.variation || 'standard';
    if (!variationMap.has(key)) {
      variationMap.set(key, chord);
    }
  });
  
  // Add database variations (will override static if same variation)
  dbVariations.forEach(chord => {
    const key = chord.variation || 'standard';
    variationMap.set(key, chord);
  });
  
  return Array.from(variationMap.values());
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
  
  // Get static chords
  const staticChords = getAllChords(instrument, tuning);
  const staticNames = staticChords.map(c => c.name);
  
  // Get database chord names (main + personal)
  const dbNames = databaseChords
    .filter(c => c.instrument === instrument && c.tuning === tuning)
    .map(c => c.name);
  
  // Combine and deduplicate
  const allNames = [...new Set([...staticNames, ...dbNames])];
  
  // Return sorted
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
 * Get all available chords combining static seed data and database chords
 * @param {string} instrument - Instrument type
 * @param {string} tuning - Tuning identifier
 * @param {Object} options - Additional options
 * @param {Array} options.databaseChords - Array of database chord objects (main + personal)
 * @returns {Array} Array of chord objects with source indicator
 */
export function getAllAvailableChords(instrument = 'ukulele', tuning = 'ukulele_standard', options = {}) {
  const { databaseChords = [] } = options;
  
  // Get static chords
  const staticChords = getAllChords(instrument, tuning).map(c => ({
    ...c,
    source: 'static',
    isPersonal: false,
  }));
  
  // Get database chords
  const dbChords = databaseChords
    .filter(c => c.instrument === instrument && c.tuning === tuning)
    .map(c => ({
      ...c,
      source: 'database',
      isPersonal: c.libraryType === 'personal',
    }));
  
  // Combine and deduplicate by name (prefer database over static for same name)
  const chordMap = new Map();
  
  // Add static chords first
  staticChords.forEach(chord => {
    const key = `${chord.name}-${chord.instrument}-${chord.tuning}`;
    if (!chordMap.has(key)) {
      chordMap.set(key, chord);
    }
  });
  
  // Add database chords (will override static if same name)
  dbChords.forEach(chord => {
    const key = `${chord.name}-${chord.instrument}-${chord.tuning}`;
    chordMap.set(key, chord);
  });
  
  return Array.from(chordMap.values());
}


