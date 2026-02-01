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

  if (chordRoot.toLowerCase() !== parsedRoot.toLowerCase()) return false;
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
 * True when the query is exactly a fret pattern: length === stringCount and every
 * character is a digit (0-9) or x/X (muted).
 */
export function isFretPatternQuery(query, stringCount) {
  if (!query || typeof query !== 'string') return false;
  if (query.length !== stringCount) return false;
  const validFretChar = /^[0-9xX]$/;
  return [...query].every(char => validFretChar.test(char));
}

/**
 * True when the query is a fret-pattern prefix: 0 < length <= stringCount and every
 * character is a digit (0-9) or x/X. Used to filter chords as the user types (e.g. "0", "00", "000").
 */
export function isFretPatternOrPrefixQuery(query, stringCount) {
  if (!query || typeof query !== 'string') return false;
  if (query.length === 0 || query.length > stringCount) return false;
  const validFretChar = /^[0-9xX]$/;
  return [...query].every(char => validFretChar.test(char));
}

/**
 * Build frets string from chord object (same convention as formatFretsForDisplay):
 * null/undefined → 'x', otherwise String(fret). Compare to normalized pattern (x case-insensitive).
 */
export function chordFretsMatchPattern(chordObj, patternStr) {
  if (!chordObj || !patternStr) return false;
  const frets = chordObj.frets;
  if (!Array.isArray(frets) || frets.length === 0) return false;
  const fretsStr = frets.map(f => f === null || f === undefined ? 'x' : String(f)).join('').toLowerCase();
  const normalizedPattern = patternStr.toLowerCase();
  return fretsStr === normalizedPattern;
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
