import { rootsAreEquivalent } from './enharmonic';

/**
 * Extract unique chords from lyrics text that are in [ChordName] format
 * Parses chord markers to extract chord name and position, excluding ChordIDs
 * Handles formats: [C], [C:2], [C::id], [C:2:id]
 */
export function extractUsedChords(lyricsText) {
  if (!lyricsText) return [];
  
  const chordPattern = /\[([^\]]+)\]/g;
  const matches = [...lyricsText.matchAll(chordPattern)];
  const chordSet = new Set();
  
  matches.forEach(match => {
    const chordText = match[1].trim();
    if (!chordText) return;
    
    // Parse chord format: "C:2:abc123" or "C::abc123" or "C:2" or "C"
    let chordName = chordText;
    let chordPosition = 1;
    
    // Try to match format with ID: "C:2:abc123" or "C::abc123"
    const idMatch = chordText.match(/^(.+?):(\d*):(.+)$/);
    if (idMatch) {
      chordName = idMatch[1].trim();
      const positionStr = idMatch[2];
      chordPosition = positionStr ? parseInt(positionStr, 10) || 1 : 1;
    } else {
      // Try to match format without ID: "C:2" or "C"
      const positionMatch = chordText.match(/^(.+):(\d+)$/);
      if (positionMatch) {
        chordName = positionMatch[1].trim();
        chordPosition = parseInt(positionMatch[2], 10) || 1;
      }
    }
    
    // Store chord name with position if position > 1, otherwise just the name
    const chordKey = chordPosition > 1 ? `${chordName}:${chordPosition}` : chordName;
    chordSet.add(chordKey);
  });
  
  return Array.from(chordSet).sort();
}

/**
 * Normalize query to convert "sharp"/"flat" text patterns to #/b notation
 * Examples: "A f" -> "Ab", "Af" -> "Ab", "A sharp" -> "A#", "Ash" -> "A#", "A fl" -> "Ab"
 * Sharp requires at least "sh" (e.g. "Csh") so "Cs" can match Csus2/Csus4.
 */
export function normalizeQuery(query) {
  if (!query) return query;
  
  const trimmed = query.trim();
  
  // Flat patterns: "A f", "Af", "A flat", "A fl", "A fla"
  const flatPatternFull = /^([A-Ga-g][#b]?)\s*(flat|fla|fl)$/i;
  const flatPatternSingle = /^([A-Ga-g][#b]?)\s*f$/i;
  // Sharp patterns: only "sh" or more (sharp|shar|sha|sh) so "Cs" matches Csus, "Csh" -> C#
  const sharpPatternFull = /^([A-Ga-g][#b]?)\s*(sharp|shar|sha|sh)$/i;
  
  // Try flat patterns first (check full word patterns, then single letter)
  let match = trimmed.match(flatPatternFull) || trimmed.match(flatPatternSingle);
  if (match) {
    const note = match[1].toUpperCase();
    return note + 'b';
  }
  
  // Try sharp patterns (only when user has typed at least "sh", so Csus isn't treated as C#)
  match = trimmed.match(sharpPatternFull);
  if (match) {
    const note = match[1].toUpperCase();
    return note + '#';
  }
  
  // No pattern matched, return as-is
  return trimmed;
}

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
 * Parse normalized query into root (note + optional #/b) and suffix prefix.
 * e.g. "A" → { root: "A", suffixPrefix: "" }, "Abm" → { root: "Ab", suffixPrefix: "m" }
 * If query doesn't start with A-G, returns { root: "", suffixPrefix: query }.
 */
function parseChordQuery(normalizedQuery) {
  if (!normalizedQuery || typeof normalizedQuery !== 'string') {
    return { root: '', suffixPrefix: '' };
  }
  const trimmed = normalizedQuery.trim();
  const match = trimmed.match(/^([A-Ga-g][#b]?)(.*)$/);
  if (!match) {
    return { root: '', suffixPrefix: trimmed };
  }
  return { root: match[1], suffixPrefix: (match[2] || '').trim() };
}

/**
 * True if chord name matches query with root+accidental rules:
 * - "A" matches only natural A chords (A, Am, A7), not Ab or A#
 * - "Ab" / "Af" match only Ab chords
 * - "A#" / "As" match only A# chords
 * - Enharmonic: query "F#m7" matches DB chord "Gbm7" (same pitch)
 * - Suffix prefix matches start of chord suffix (e.g. "Am" matches Am, Am7, Amaj7)
 */
export function chordMatchesQuery(chordName, query) {
  if (!query) return true;
  if (!chordName || typeof chordName !== 'string') return false;

  const normalizedQuery = normalizeQuery(query);
  const { root: parsedRoot, suffixPrefix } = parseChordQuery(normalizedQuery);

  const chordRootLen = getChordRootLength(chordName);
  const chordRoot = chordName.slice(0, chordRootLen);
  const chordSuffix = chordName.slice(chordRootLen);

  if (parsedRoot === '') {
    return chordSuffix.toLowerCase().startsWith(suffixPrefix.toLowerCase());
  }

  const rootsMatch =
    chordRoot.toLowerCase() === parsedRoot.toLowerCase() ||
    rootsAreEquivalent(chordRoot, parsedRoot);
  if (!rootsMatch) return false;
  return chordSuffix.toLowerCase().startsWith(suffixPrefix.toLowerCase());
}

/**
 * Filter chords by query (case-insensitive, root+accidental aware)
 * Natural roots ("A", "B", …) match only that root; "Ab"/"Af" match flat; "A#"/"As" match sharp.
 */
export function filterChords(chords, query) {
  if (!query) return chords;

  return chords.filter(chord => chordMatchesQuery(chord, query));
}

/**
 * Return the number of strings for an instrument/tuning (for fret-pattern length).
 * Ukulele = 4; guitar = 6 when added.
 */
export function getStringCountForInstrument(instrument = 'ukulele', tuning = 'ukulele_standard') {
  if (instrument === 'guitar') return 6;
  return 4; // ukulele and default
}

/**
 * Parse fret string into array of display values (handles multi-digit frets).
 */
function parseFretStringToArray(str, stringCount = 4) {
  if (!str || typeof str !== 'string') return null;
  const result = [];
  let i = 0;
  while (i < str.length && result.length < stringCount) {
    const c = str[i].toLowerCase();
    if (c === 'x') {
      result.push('x');
      i++;
    } else if (/\d/.test(c)) {
      const two = str.slice(i, i + 2);
      const twoNum = parseInt(two, 10);
      if (two.length === 2 && twoNum >= 10 && twoNum <= 12) {
        result.push(String(twoNum));
        i += 2;
      } else {
        result.push(c);
        i++;
      }
    } else {
      return null;
    }
  }
  return result.length > 0 ? result : null;
}

/**
 * Format frets for display with commas between values (e.g. "0,0,0,3" or "9,10,8,10").
 * Makes multi-digit frets readable (e.g. C7 at position 4: 9,10,8,10 instead of 910810).
 * @param {Array|string} frets - Fret positions (array e.g. [0,0,0,3] or string "0003"/"910810")
 * @param {number} baseFret - Optional base fret; when > 0, relative frets are converted to absolute
 * @param {number} stringCount - Number of strings (default 4); used when frets is a string
 * @returns {string} Comma-separated fret string for display
 */
export function formatFretsForDisplay(frets, baseFret, stringCount = 4) {
  if (!frets) return '—';
  let arr;
  if (Array.isArray(frets)) {
    arr = baseFret != null && baseFret > 0
      ? relativeFretsToAbsolute(frets, baseFret)
      : frets.map(f => (f === null || f === undefined || f === 'x' ? 'x' : f));
  } else if (typeof frets === 'string') {
    const parsed = parseFretStringToArray(frets, stringCount);
    if (parsed && parsed.length === stringCount) {
      arr = parsed;
    } else {
      const legacy = frets.split('').map(c => {
        const lower = c.toLowerCase();
        if (lower === 'x') return 'x';
        const n = parseInt(c, 10);
        return isNaN(n) ? 'x' : n;
      });
      arr = legacy.length === stringCount ? legacy : null;
    }
    if (!arr) return '—';
  } else {
    return '—';
  }
  if (!arr || arr.length === 0) return '—';
  return arr.map(f => (f === null || f === undefined || f === 'x' ? 'x' : String(f))).join(',');
}

/**
 * Validate a single fret token (0-12 or x).
 */
function isValidFretToken(token) {
  const t = (token || '').trim().toLowerCase();
  if (t === 'x') return 'x';
  const n = parseInt(t, 10);
  if (isNaN(n) || n < 0 || n > 12) return null;
  return String(n);
}

/**
 * Parse concatenated fret string (no commas) greedily into array of canonical tokens.
 * Each fret is 0-12 or x. Greedy: take 2 digits if 10/11/12, else 1 digit.
 */
function parseConcatenatedFrets(str, stringCount, allowPartial = false) {
  if (!str || typeof str !== 'string') return null;
  const result = [];
  let i = 0;
  const maxValues = allowPartial ? stringCount : stringCount;
  while (i < str.length && result.length < maxValues) {
    const c = str[i].toLowerCase();
    if (c === 'x') {
      result.push('x');
      i++;
    } else if (/\d/.test(c)) {
      const two = str.slice(i, i + 2);
      const twoNum = parseInt(two, 10);
      if (two.length === 2 && twoNum >= 10 && twoNum <= 12) {
        result.push(String(twoNum));
        i += 2;
      } else {
        result.push(c);
        i++;
      }
    } else {
      return null;
    }
  }
  if (!allowPartial && result.length !== stringCount) return null;
  if (result.length === 0) return null;
  return result.join('');
}

/**
 * Normalize fret query to canonical form for matching.
 * Accepts: "9,10,8,10", "910810", "0003", "0,0,0,3", "x013", "x,0,1,3"
 * @param {string} query - User input
 * @param {number} stringCount - Expected number of strings (4 for ukulele)
 * @param {boolean} allowPartial - If true, allow partial input (1 to stringCount values)
 * @returns {string|null} Canonical form (e.g. "910810") or null if invalid
 */
export function normalizeFretQueryForMatching(query, stringCount, allowPartial = false) {
  if (!query || typeof query !== 'string') return null;
  const trimmed = query.trim();
  if (trimmed.length === 0) return null;

  if (trimmed.includes(',')) {
    const tokens = trimmed.split(',').map(t => t.trim()).filter(Boolean);
    if (tokens.length === 0) return null;
    if (!allowPartial && tokens.length !== stringCount) return null;
    if (allowPartial && (tokens.length > stringCount || tokens.length === 0)) return null;
    const normalized = [];
    for (const t of tokens) {
      const v = isValidFretToken(t);
      if (v === null) return null;
      normalized.push(v);
    }
    return normalized.join('');
  }

  // No commas: legacy single-char or greedy multi-digit
  if (trimmed.length === stringCount && [...trimmed].every(c => /^[0-9xX]$/.test(c))) {
    return trimmed.toLowerCase();
  }
  return parseConcatenatedFrets(trimmed, stringCount, allowPartial);
}

/**
 * True when the query is exactly a fret pattern (full match).
 * Accepts "0003", "0,0,0,3", "910810", "9,10,8,10".
 */
export function isFretPatternQuery(query, stringCount) {
  if (!query || typeof query !== 'string') return false;
  return normalizeFretQueryForMatching(query, stringCount, false) != null;
}

/**
 * True when the query is a fret-pattern prefix (partial input).
 * Accepts "0", "00", "9,10", "910", etc.
 */
export function isFretPatternOrPrefixQuery(query, stringCount) {
  if (!query || typeof query !== 'string') return false;
  const trimmed = query.trim();
  if (trimmed.length === 0) return false;
  const normalized = normalizeFretQueryForMatching(query, stringCount, true);
  return normalized != null && normalized.length > 0;
}

/**
 * Convert relative fret positions to absolute using baseFret.
 * Same formula as ChordDiagram: absoluteFret = baseFret + (relativeFret - 1)
 * Open (0) and muted (null) stay as-is.
 * @param {Array<number|null>} frets - Relative frets from chord (e.g. [1,1,1,1])
 * @param {number} baseFret - Base fret (e.g. 5)
 * @returns {Array<number|string>} Absolute frets for display (e.g. [5,5,5,5]); 0 stays 0, null → 'x'
 */
export function relativeFretsToAbsolute(frets, baseFret) {
  if (!Array.isArray(frets) || frets.length === 0) return frets;
  if (baseFret == null || baseFret <= 0) return frets;
  return frets.map((f) => {
    if (f === null || f === undefined) return 'x';
    if (f === 0) return 0;
    const n = typeof f === 'number' ? f : parseInt(f, 10);
    return isNaN(n) ? 'x' : baseFret + (n - 1);
  });
}

/**
 * Get comparable frets string from a chord object (absolute fret numbers for display and search).
 * When chord has baseFret > 0, frets in DB are relative to baseFret — we convert to absolute.
 * Handles: array [0,0,0,3], [1,1,1,1] with baseFret 5 → "5555", string "0003", JSON string.
 * Returns null if frets cannot be read.
 */
export function getFretsString(chordObj) {
  if (!chordObj) return null;
  let frets = chordObj.frets;
  if (frets === undefined || frets === null) return null;
  const baseFret = chordObj.baseFret;
  const useAbsolute = baseFret != null && baseFret > 0;

  // JSON string from DB e.g. "[0,0,0,3]"
  if (typeof frets === 'string' && frets.startsWith('[')) {
    try {
      frets = JSON.parse(frets);
    } catch {
      return frets.trim().toLowerCase();
    }
  }
  if (Array.isArray(frets) && frets.length > 0) {
    const toDisplay = useAbsolute ? relativeFretsToAbsolute(frets, baseFret) : frets;
    return toDisplay.map((f) => (f === null || f === undefined || f === 'x' ? 'x' : String(f))).join('').toLowerCase();
  }
  if (typeof frets === 'string' && frets.length > 0) {
    return frets.trim().toLowerCase();
  }
  if (typeof frets === 'object' && !Array.isArray(frets) && frets !== null) {
    const vals = Object.values(frets);
    if (vals.length > 0) {
      const toDisplay = useAbsolute ? relativeFretsToAbsolute(vals, baseFret) : vals;
      return toDisplay.map((f) => (f === null || f === undefined || f === 'x' ? 'x' : String(f))).join('').toLowerCase();
    }
  }
  return null;
}

/**
 * True when the chord's frets string equals the pattern (e.g. "0003" or "0,0,0,3" matches C).
 */
export function chordFretsMatchPattern(chordObj, patternStr, stringCount = 4) {
  if (!patternStr || typeof patternStr !== 'string') return false;
  const fretsStr = getFretsString(chordObj);
  if (fretsStr == null) return false;
  const normalized = normalizeFretQueryForMatching(patternStr, stringCount, false);
  return normalized != null && fretsStr === normalized;
}

/**
 * True when the chord's frets string starts with the given prefix (normalized, case-insensitive).
 * Used for partial fret input (e.g. "00" matches "0003", "0022").
 */
export function chordFretsMatchPrefix(chordObj, prefixStr) {
  if (!chordObj || !prefixStr) return false;
  const frets = chordObj.frets;
  if (!Array.isArray(frets) || frets.length === 0) return false;
  const fretsStr = frets.map(f => f === null || f === undefined ? 'x' : String(f)).join('').toLowerCase();
  const normalizedPrefix = prefixStr.toLowerCase();
  return fretsStr.startsWith(normalizedPrefix);
}
