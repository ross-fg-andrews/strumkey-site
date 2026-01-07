/**
 * Chord Name Suggestion Utility
 * 
 * Provides pattern-based chord name suggestions by matching against
 * the chord seed library. Supports exact matches and transposed shape recognition.
 */

import { CHORD_SEED_DATA } from '../data/chord-seed';

/**
 * Convert fret string to array of numbers, handling muted strings
 * @param {string} frets - Fret positions (e.g., "2013" or "x013")
 * @returns {Array<number|null>} Array of fret numbers, null for muted strings
 */
function parseFrets(frets) {
  return frets.split('').map(f => {
    const normalized = f.toLowerCase();
    if (normalized === 'x') return null; // Muted string
    const num = parseInt(normalized, 10);
    return isNaN(num) ? null : num;
  });
}

/**
 * Normalize a fret pattern by subtracting the minimum fret value
 * This allows matching transposed chord shapes
 * @param {Array<number|null>} frets - Array of fret numbers
 * @returns {Array<number|null>|null} Normalized pattern, or null if all muted
 */
function normalizeFretPattern(frets) {
  // Filter out muted strings to find minimum
  const activeFrets = frets.filter(f => f !== null);
  if (activeFrets.length === 0) return null;
  
  const minFret = Math.min(...activeFrets);
  
  // Normalize by subtracting minimum, but keep muted strings as null
  return frets.map(f => f === null ? null : f - minFret);
}

/**
 * Check if two fret patterns have the same shape (transposed)
 * @param {Array<number|null>} pattern1 - First pattern
 * @param {Array<number|null>} pattern2 - Second pattern
 * @returns {boolean} True if patterns match
 */
function patternsMatch(pattern1, pattern2) {
  if (pattern1.length !== pattern2.length) return false;
  
  for (let i = 0; i < pattern1.length; i++) {
    // Both must be muted or both must have same relative position
    if (pattern1[i] === null && pattern2[i] === null) continue;
    if (pattern1[i] === null || pattern2[i] === null) return false;
    if (pattern1[i] !== pattern2[i]) return false;
  }
  
  return true;
}

/**
 * Calculate similarity score between two fret patterns
 * Returns a score from 0-1, where 1 is exact match
 * @param {Array<number|null>} frets1 - First pattern
 * @param {Array<number|null>} frets2 - Second pattern
 * @returns {number} Similarity score
 */
function calculateSimilarity(frets1, frets2) {
  if (frets1.length !== frets2.length) return 0;
  
  let matches = 0;
  let total = 0;
  
  for (let i = 0; i < frets1.length; i++) {
    // Skip muted strings in both
    if (frets1[i] === null && frets2[i] === null) {
      matches++;
      total++;
      continue;
    }
    
    // If one is muted and other isn't, it's a mismatch
    if (frets1[i] === null || frets2[i] === null) {
      total++;
      continue;
    }
    
    total++;
    // Check if frets are close (within 1 fret)
    const diff = Math.abs(frets1[i] - frets2[i]);
    if (diff === 0) {
      matches++;
    } else if (diff === 1) {
      matches += 0.5; // Partial match for close frets
    }
  }
  
  return total > 0 ? matches / total : 0;
}

/**
 * Suggest chord names from a fret pattern
 * Checks for exact matches, then transposed shapes, then similar patterns
 * @param {string} frets - Fret positions (e.g., "2013")
 * @param {string} instrument - Instrument type (default: 'ukulele')
 * @param {string} tuning - Tuning identifier (default: 'ukulele_standard')
 * @returns {Array<string>} Array of suggested chord names matching the naming convention
 */
export function suggestChordNames(frets, instrument = 'ukulele', tuning = 'ukulele_standard') {
  if (!frets || frets.length === 0) {
    return [];
  }
  
  // Normalize frets (handle case)
  const normalizedFrets = frets.toLowerCase();
  
  // Check if all strings are muted
  if (normalizedFrets.split('').every(f => f === 'x')) {
    return [];
  }
  
  const inputFrets = parseFrets(normalizedFrets);
  const normalizedInput = normalizeFretPattern(inputFrets);
  
  // Get all chords for this instrument/tuning
  const relevantChords = CHORD_SEED_DATA.filter(chord => 
    chord.instrument === instrument &&
    chord.tuning === tuning
  );
  
  const suggestions = new Map(); // Use Map to avoid duplicates while preserving order
  
  // 1. Check for exact matches first (highest priority)
  for (const chord of relevantChords) {
    if (chord.frets === normalizedFrets) {
      suggestions.set(chord.name, { name: chord.name, score: 1.0, type: 'exact' });
    }
  }
  
  // 2. Check for transposed shapes (same relative pattern, different position)
  if (normalizedInput) {
    for (const chord of relevantChords) {
      const chordFrets = parseFrets(chord.frets);
      const normalizedChord = normalizeFretPattern(chordFrets);
      
      if (normalizedChord && patternsMatch(normalizedInput, normalizedChord)) {
        // Only add if not already added as exact match
        if (!suggestions.has(chord.name) || suggestions.get(chord.name).score < 0.9) {
          suggestions.set(chord.name, { name: chord.name, score: 0.9, type: 'transposed' });
        }
      }
    }
  }
  
  // 3. Check for similar patterns (close matches)
  for (const chord of relevantChords) {
    const chordFrets = parseFrets(chord.frets);
    const similarity = calculateSimilarity(inputFrets, chordFrets);
    
    // Only add if similarity is high enough and not already added
    if (similarity >= 0.75 && !suggestions.has(chord.name)) {
      suggestions.set(chord.name, { name: chord.name, score: similarity, type: 'similar' });
    }
  }
  
  // Convert to array, sort by score (highest first), and return just names
  return Array.from(suggestions.values())
    .sort((a, b) => b.score - a.score)
    .map(item => item.name);
}

/**
 * Legacy function name for backward compatibility
 * @deprecated Use suggestChordNames instead
 */
export function detectChordNames(frets, instrument = 'ukulele', tuning = 'ukulele_standard') {
  return suggestChordNames(frets, instrument, tuning);
}

