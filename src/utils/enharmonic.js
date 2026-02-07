/**
 * Enharmonic (sharp/flat) chord name translation.
 * Database stores flat roots only (Gb, Db, Eb, Ab, Bb).
 * Users may search/display in sharp notation (F#, C#, D#, G#, A#).
 * Mapping: C#↔Db, D#↔Eb, F#↔Gb, G#↔Ab, A#↔Bb (root only; suffix unchanged).
 */

const SHARP_TO_FLAT = {
  'C#': 'Db',
  'D#': 'Eb',
  'F#': 'Gb',
  'G#': 'Ab',
  'A#': 'Bb',
};

const FLAT_TO_SHARP = {
  'Db': 'C#',
  'Eb': 'D#',
  'Gb': 'F#',
  'Ab': 'G#',
  'Bb': 'A#',
};

/**
 * Length of the root note in a chord name (1 for natural, 2 for # or b).
 * e.g. "A" → 1, "Am" → 1, "Ab" → 2, "A#" → 2
 */
function getChordRootLength(chordName) {
  if (!chordName || chordName.length === 0) return 0;
  if (chordName.length === 1) return 1;
  const second = chordName[1];
  if (second === 'b' || second === '#') return 2;
  return 1;
}

/**
 * Get root and suffix from chord name (root only: A-G optional #/b).
 * @returns {{ root: string, suffix: string }}
 */
function getRootAndSuffix(chordName) {
  if (!chordName || typeof chordName !== 'string') {
    return { root: '', suffix: '' };
  }
  const len = getChordRootLength(chordName);
  const root = chordName.slice(0, len);
  const suffix = chordName.slice(len);
  return { root, suffix };
}

/**
 * Convert chord name to database (flat) form for lookup.
 * If root is sharp (C#, D#, F#, G#, A#), return flat-equivalent chord name; otherwise return chordName.
 * @param {string} chordName - e.g. "F#m7", "Gb", "C"
 * @returns {string} e.g. "Gbm7", "Gb", "C"
 */
export function toDbName(chordName) {
  if (!chordName || typeof chordName !== 'string') return chordName;
  const { root, suffix } = getRootAndSuffix(chordName);
  const flatRoot = SHARP_TO_FLAT[root];
  if (flatRoot) {
    return flatRoot + suffix;
  }
  return chordName;
}

/**
 * Convert chord name to sharp form for display.
 * If root is flat (Db, Eb, Gb, Ab, Bb), return sharp-equivalent chord name; otherwise return chordName.
 * @param {string} chordName - e.g. "Gbm7", "F#", "C"
 * @returns {string} e.g. "F#m7", "F#", "C"
 */
export function toDisplaySharp(chordName) {
  if (!chordName || typeof chordName !== 'string') return chordName;
  const { root, suffix } = getRootAndSuffix(chordName);
  const sharpRoot = FLAT_TO_SHARP[root];
  if (sharpRoot) {
    return sharpRoot + suffix;
  }
  return chordName;
}

/**
 * Whether the root is sharp (C#, D#, F#, G#, A#).
 */
export function isSharpRoot(chordName) {
  if (!chordName || chordName.length < 2) return false;
  const root = chordName.slice(0, getChordRootLength(chordName));
  return SHARP_TO_FLAT[root] != null;
}

/**
 * Normalize root for comparison (first letter upper, accidental as-is).
 */
function normalizeRoot(root) {
  if (!root || root.length === 0) return root;
  const r = root.trim();
  if (r.length === 1) return r.toUpperCase();
  return r[0].toUpperCase() + r.slice(1);
}

/**
 * Whether two roots are enharmonically equivalent (same pitch).
 * e.g. rootsAreEquivalent("F#", "Gb") === true
 */
export function rootsAreEquivalent(root1, root2) {
  if (!root1 || !root2) return root1 === root2;
  const r1 = normalizeRoot(root1);
  const r2 = normalizeRoot(root2);
  if (r1 === r2) return true;
  return SHARP_TO_FLAT[r1] === r2 || FLAT_TO_SHARP[r1] === r2;
}

/**
 * Get display chord name for modal: if user query has sharp root, show chord in sharp form; else show as-is.
 * @param {string} dbChordName - Chord name from DB (e.g. "Gbm7")
 * @param {string} userQuery - Raw or normalized user search query (e.g. "F#m7" or "F#")
 * @param {function} [normalizeQuery] - Optional normalizer (e.g. chord-autocomplete-helpers.normalizeQuery)
 * @returns {string} Display name (e.g. "F#m7" when user typed F#, "Gbm7" when user typed Gb)
 */
export function getDisplayChordName(dbChordName, userQuery, normalizeQuery = (q) => q) {
  if (!dbChordName || typeof dbChordName !== 'string') return dbChordName;
  if (!userQuery || typeof userQuery !== 'string') return dbChordName;
  const normalized = normalizeQuery(userQuery.trim());
  const queryRootLen = getChordRootLength(normalized);
  if (queryRootLen === 0) return dbChordName;
  const queryRoot = normalized.slice(0, queryRootLen);
  if (SHARP_TO_FLAT[queryRoot] != null) {
    return toDisplaySharp(dbChordName);
  }
  return dbChordName;
}
