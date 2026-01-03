/**
 * Central Chord Library Utility
 * 
 * Provides functions to query and filter chords from the static chord library.
 * This replaces database queries for chord data, making chords always available
 * without requiring seeding.
 */

import { CHORD_SEED_DATA } from '../data/chord-seed';

/**
 * Find a chord by name, instrument, and tuning
 * @param {string} chordName - Chord name (e.g., "C", "Am", "G7")
 * @param {string} instrument - Instrument type (e.g., "ukulele")
 * @param {string} tuning - Tuning identifier (e.g., "ukulele_standard")
 * @param {string} variation - Variation type (e.g., "standard", "barre")
 * @returns {Object|null} Chord data object or null if not found
 */
export function findChord(chordName, instrument = 'ukulele', tuning = 'ukulele_standard', variation = 'standard') {
  if (!chordName) return null;
  
  // Try exact match first (name, instrument, tuning, variation)
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
  
  // Fallback to case-insensitive match
  if (!chord) {
    chord = CHORD_SEED_DATA.find(c => 
      c.name.toLowerCase() === chordName.toLowerCase() &&
      c.instrument === instrument &&
      c.tuning === tuning
    );
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
 * @param {string} chordName - Chord name
 * @param {string} instrument - Instrument type
 * @param {string} tuning - Tuning identifier
 * @returns {Array} Array of chord objects with different variations
 */
export function getChordVariations(chordName, instrument = 'ukulele', tuning = 'ukulele_standard') {
  return CHORD_SEED_DATA.filter(c => 
    c.name === chordName &&
    c.instrument === instrument &&
    c.tuning === tuning
  );
}

/**
 * Get unique chord names for autocomplete
 * Returns sorted list of unique chord names for the given instrument/tuning
 * @param {string} instrument - Instrument type
 * @param {string} tuning - Tuning identifier
 * @returns {Array<string>} Sorted array of unique chord names
 */
export function getChordNames(instrument = 'ukulele', tuning = 'ukulele_standard') {
  const chords = getAllChords(instrument, tuning);
  const names = chords.map(c => c.name);
  // Return unique names, sorted alphabetically
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

/**
 * Search chords by name (case-insensitive, partial match)
 * @param {string} query - Search query
 * @param {string} instrument - Instrument type
 * @param {string} tuning - Tuning identifier
 * @param {number} limit - Maximum number of results
 * @returns {Array<string>} Array of matching chord names
 */
export function searchChordNames(query, instrument = 'ukulele', tuning = 'ukulele_standard', limit = 20) {
  if (!query || query.length < 1) return [];
  
  const allNames = getChordNames(instrument, tuning);
  const lowerQuery = query.toLowerCase();
  
  return allNames
    .filter(name => name.toLowerCase().includes(lowerQuery))
    .slice(0, limit);
}

