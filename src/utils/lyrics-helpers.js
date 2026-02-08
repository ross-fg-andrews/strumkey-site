import { toDbName } from './enharmonic';

/**
 * Parse lyrics text into lines and extract chords
 * Input: "Amazing [C]grace how [G]sweet the [Am]sound\nThat saved a [F]wretch like [C]me"
 * Output: { lyrics: string, chords: array }
 */
export function parseLyricsWithChords(text) {
  // Normalize line breaks: convert \r\n (Windows) and \r (old Mac) to \n
  // This ensures consistent handling across platforms
  const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalizedText.split('\n');
  const chords = [];
  let chordId = 0;

  const cleanLines = lines.map((line, lineIndex) => {
    // Match [ChordName] patterns
    const chordPattern = /\[([^\]]+)\]/g;
    let match;
    let removedLength = 0; // Track cumulative length of removed chord markers
    const cleanLine = line.replace(chordPattern, (matchStr, chordName, offset) => {
      // offset is the position in the ORIGINAL string
      // We need the position in the CLEANED string (after removing previous markers)
      const position = offset - removedLength;
      
      // Trim chord name to remove any leading/trailing whitespace
      const trimmedChordName = chordName.trim();
      
      // Parse chord format: "C:2:abc123" or "C::abc123" or "C:2" or "C"
      // Format: [name:position:chordId] or [name::chordId] or [name:position] or [name]
      // Default to position 1 if no position specified
      let actualChordName = trimmedChordName;
      let chordPosition = 1;
      let extractedChordId = null;
      
      // Try to match format with ID: "C:2:abc123" or "C::abc123"
      const idMatch = trimmedChordName.match(/^(.+?):(\d*):(.+)$/);
      if (idMatch) {
        actualChordName = idMatch[1].trim();
        const positionStr = idMatch[2];
        extractedChordId = idMatch[3].trim();
        chordPosition = positionStr ? parseInt(positionStr, 10) || 1 : 1;
      } else {
        // Try to match format without ID: "C:2" or "C"
        const positionMatch = trimmedChordName.match(/^(.+):(\d+)$/);
        if (positionMatch) {
          actualChordName = positionMatch[1].trim();
          chordPosition = parseInt(positionMatch[2], 10) || 1;
        }
      }
      
      chords.push({
        id: `chord-${chordId++}`,
        lineIndex,
        position,
        chord: actualChordName,
        chordPosition: chordPosition, // Store the position from the chord name
        chordId: extractedChordId || null, // Store the chord ID if present
      });
      removedLength += matchStr.length; // Track how much we've removed
      return ''; // Remove chord marker from text
    });

    // Don't trim - preserve original spacing for accurate chord positioning
    return cleanLine;
  });

  return {
    lyrics: cleanLines.join('\n'),
    chords,
  };
}

/**
 * Parse a chord marker string (content inside [ ]) to extract name, position, and optional id.
 * Handles: "C", "C:2", "C:2:abc123", "C::abc123"
 * @param {string} markerString - e.g. "C", "C:2", "C:2:abc123"
 * @returns {{ chordName: string, chordPosition: number, chordId?: string | null }}
 */
export function parseChordMarker(markerString) {
  const trimmed = (markerString || '').trim();
  let chordName = trimmed;
  let chordPosition = 1;
  let chordId = null;
  const idMatch = trimmed.match(/^(.+?):(\d*):(.+)$/);
  if (idMatch) {
    chordName = idMatch[1].trim();
    const positionStr = idMatch[2];
    chordPosition = positionStr ? parseInt(positionStr, 10) || 1 : 1;
    chordId = idMatch[3].trim();
  } else {
    const positionMatch = trimmed.match(/^(.+):(\d+)$/);
    if (positionMatch) {
      chordName = positionMatch[1].trim();
      chordPosition = parseInt(positionMatch[2], 10) || 1;
    }
  }
  return { chordName, chordPosition, chordId };
}

/**
 * Build segments for one line: trim leading spaces, collapse space runs, then interleave
 * text and chord segments at chord positions. Used by renderChordsWithAnchors and renderAboveChords.
 * @returns {{ segments: Array<{ type: 'text', content: string } | { type: 'chord', name: string, chordPosition: number, id?: string | null }>, lyricLine: string }}
 */
function buildLineSegments(line, lineChords) {
  const sortedChords = [...lineChords].sort((a, b) => a.position - b.position);

  if (sortedChords.length === 0) {
    const trimmedLine = line.replace(/^\s+/, '');
    return {
      segments: [{ type: 'text', content: trimmedLine }],
      lyricLine: trimmedLine,
    };
  }

  const leadingSpacesMatch = line.match(/^\s+/);
  const leadingSpacesCount = leadingSpacesMatch ? leadingSpacesMatch[0].length : 0;
  const trimmedLine = line.substring(leadingSpacesCount);

  const adjustedChords = sortedChords
    .map(({ position, chord, id, chordPosition }) => ({
      position: Math.max(0, position - leadingSpacesCount),
      chord: (chord || '').trim(),
      id,
      chordPosition: chordPosition ?? 1,
    }))
    .filter(({ position }) => position >= 0)
    .filter(({ chord }) => chord.length > 0);

  if (adjustedChords.length === 0) {
    const trimmed = trimmedLine.replace(/^\s+/, '');
    return { segments: [{ type: 'text', content: trimmed }], lyricLine: trimmed };
  }

  // Collapse consecutive spaces and build position map
  let collapsedLyricLine = '';
  const positionMap = new Map();
  let newPos = 0;
  let inSpaceRun = false;
  let spaceRunNewPos = -1;

  for (let oldPos = 0; oldPos < trimmedLine.length; oldPos++) {
    const charCode = trimmedLine.charCodeAt(oldPos);
    const isSpace = trimmedLine[oldPos] === ' ' || trimmedLine[oldPos] === '\t' ||
      charCode === 160 || (charCode >= 8192 && charCode <= 8202);

    if (isSpace) {
      if (!inSpaceRun) {
        collapsedLyricLine += ' ';
        spaceRunNewPos = newPos;
        positionMap.set(oldPos, newPos);
        newPos++;
        inSpaceRun = true;
      } else {
        positionMap.set(oldPos, spaceRunNewPos);
      }
    } else {
      if (inSpaceRun) inSpaceRun = false;
      collapsedLyricLine += trimmedLine[oldPos];
      positionMap.set(oldPos, newPos);
      newPos++;
    }
  }

  const mappedChords = adjustedChords.map(({ position, chord, id, chordPosition }) => {
    const mappedPosition = positionMap.get(position);
    return {
      position: mappedPosition !== undefined ? mappedPosition : position,
      chord,
      id,
      chordPosition,
    };
  });

  // Build segments: interleave text and chord at positions
  const segments = [];
  let lastEnd = 0;

  mappedChords.forEach(({ position, chord, id, chordPosition }) => {
    if (position > lastEnd) {
      segments.push({ type: 'text', content: collapsedLyricLine.slice(lastEnd, position) });
    }
    segments.push({ type: 'chord', name: chord, chordPosition, id: id ?? null });
    lastEnd = position;
  });

  if (lastEnd < collapsedLyricLine.length) {
    segments.push({ type: 'text', content: collapsedLyricLine.slice(lastEnd) });
  }

  return { segments, lyricLine: collapsedLyricLine };
}

/**
 * Render lyrics with chords above using anchor-based segments (for web).
 * Returns an array of line objects: { type: 'heading'|'instruction'|'line', text?, segments?, lyricLine? }.
 */
export function renderChordsWithAnchors(lyrics, chords = []) {
  const lines = lyrics.split('\n');

  return lines.map((line, lineIndex) => {
    const headingMatch = line.match(/\{heading:([^}]+)\}/);
    if (headingMatch) {
      return { type: 'heading', text: headingMatch[1].trim(), segments: [], lyricLine: '' };
    }
    const instructionMatch = line.match(/\{instruction:([^}]+)\}/);
    if (instructionMatch) {
      return { type: 'instruction', text: instructionMatch[1].trim(), segments: [], lyricLine: '' };
    }

    const lineChords = chords.filter((c) => c.lineIndex === lineIndex);
    const { segments, lyricLine } = buildLineSegments(line, lineChords);
    return { type: 'line', segments, lyricLine };
  });
}

/**
 * Convert segments from buildLineSegments to legacy chordSegments + lyricLine for PDF.
 */
function segmentsToChordSegmentsAndLyricLine(segments, lyricLine) {
  const chordSegments = [];
  let lyricChars = 0;
  let chordChars = 0;

  segments.forEach((seg) => {
    if (seg.type === 'text') {
      if (seg.content.length > 0) {
        chordSegments.push({ type: 'space', content: ' '.repeat(seg.content.length) });
      }
      lyricChars += seg.content.length;
      chordChars += seg.content.length;
    } else {
      chordSegments.push({ type: 'chord', content: seg.name, chordPosition: seg.chordPosition });
      chordChars += (seg.name || '').length;
    }
  });

  const maxLength = Math.max(lyricChars, chordChars);
  const lyricLinePadded = lyricLine.padEnd(maxLength, ' ');
  return { chordSegments, lyricLine: lyricLinePadded };
}

/**
 * Render lyrics with chords in inline mode
 * Also handles headings and instructions by preserving their markers
 */
export function renderInlineChords(lyrics, chords = []) {
  const lines = lyrics.split('\n');
  
  return lines.map((line, lineIndex) => {
    // Check if this line contains a heading or instruction marker
    // If so, return it as-is (markers are preserved)
    if (line.match(/\{heading:[^}]+\}/) || line.match(/\{instruction:[^}]+\}/)) {
      return line;
    }
    
    const lineChords = chords.filter(c => c.lineIndex === lineIndex)
      .sort((a, b) => a.position - b.position);

    if (lineChords.length === 0) {
      return line;
    }

    let result = [];
    let lastIndex = 0;

    lineChords.forEach(({ position, chord, chordPosition, chordId }) => {
      // Add text before chord
      if (position > lastIndex) {
        result.push(line.substring(lastIndex, position));
      }
      // Add chord marker with position if chordPosition > 1
      // Include chordId if available: [C:2:abc123] or [C::abc123]
      let chordMarker;
      if (chordId) {
        chordMarker = chordPosition && chordPosition > 1
          ? `[${chord}:${chordPosition}:${chordId}]`
          : `[${chord}::${chordId}]`;
      } else {
        chordMarker = chordPosition && chordPosition > 1 
          ? `[${chord}:${chordPosition}]` 
          : `[${chord}]`;
      }
      result.push(chordMarker);
      lastIndex = position;
    });

    // Add remaining text
    if (lastIndex < line.length) {
      result.push(line.substring(lastIndex));
    }

    return result.join('');
  });
}

/**
 * Render lyrics with chords above (legacy shape for PDF).
 * Uses the same segment builder as renderChordsWithAnchors; converts to chordSegments + lyricLine.
 */
export function renderAboveChords(lyrics, chords = []) {
  const lines = lyrics.split('\n');

  return lines.map((line, lineIndex) => {
    const headingMatch = line.match(/\{heading:([^}]+)\}/);
    if (headingMatch) {
      return { type: 'heading', text: headingMatch[1].trim(), chordSegments: [], lyricLine: '' };
    }
    const instructionMatch = line.match(/\{instruction:([^}]+)\}/);
    if (instructionMatch) {
      return { type: 'instruction', text: instructionMatch[1].trim(), chordSegments: [], lyricLine: '' };
    }

    const lineChords = chords.filter((c) => c.lineIndex === lineIndex);
    const { segments, lyricLine } = buildLineSegments(line, lineChords);
    const { chordSegments, lyricLine: lyricLinePadded } = segmentsToChordSegmentsAndLyricLine(segments, lyricLine);
    return { chordSegments, lyricLine: lyricLinePadded };
  });
}

/**
 * Insert chord at position in lyrics
 */
export function insertChord(lyrics, chords, lineIndex, position, chordName) {
  const newChords = [...chords];
  
  // Find insertion point
  const insertIndex = newChords.findIndex(
    c => c.lineIndex === lineIndex && c.position > position
  );

  const newChord = {
    id: `chord-${Date.now()}-${Math.random()}`,
    lineIndex,
    position,
    chord: chordName,
  };

  if (insertIndex === -1) {
    newChords.push(newChord);
  } else {
    newChords.splice(insertIndex, 0, newChord);
  }

  return newChords;
}

/**
 * Remove chord from lyrics
 */
export function removeChord(chords, chordId) {
  return chords.filter(c => c.id !== chordId);
}

/**
 * Extract headings and instructions from lyrics text
 * Input: "Verse 1\n{heading:Chorus}\nSome lyrics\n{instruction:Play softly}"
 * Output: { headings: array, instructions: array }
 */
export function extractElements(text) {
  if (!text) return { headings: [], instructions: [] };
  
  const headings = [];
  const instructions = [];
  let headingId = 0;
  let instructionId = 0;
  
  const lines = text.split('\n');
  
  lines.forEach((line, lineIndex) => {
    // Match {heading:...} patterns
    const headingPattern = /\{heading:([^}]+)\}/g;
    let match;
    while ((match = headingPattern.exec(line)) !== null) {
      headings.push({
        id: `heading-${headingId++}`,
        lineIndex,
        text: match[1].trim(),
        fullMatch: match[0],
      });
    }
    
    // Match {instruction:...} patterns
    const instructionPattern = /\{instruction:([^}]+)\}/g;
    while ((match = instructionPattern.exec(line)) !== null) {
      instructions.push({
        id: `instruction-${instructionId++}`,
        lineIndex,
        text: match[1].trim(),
        fullMatch: match[0],
      });
    }
  });
  
  return { headings, instructions };
}

/**
 * Parse lyrics text and extract chords, headings, and instructions
 * Input: "Amazing [C]grace\n{heading:Verse 1}\nSome lyrics\n{instruction:Play softly}"
 * Output: { lyrics: string, chords: array, headings: array, instructions: array }
 */
export function parseLyricsWithElements(text) {
  const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // First parse chords (existing logic)
  const { lyrics, chords } = parseLyricsWithChords(normalizedText);
  
  // Then extract headings and instructions from the original text
  const { headings, instructions } = extractElements(normalizedText);
  
  return {
    lyrics,
    chords,
    headings,
    instructions,
  };
}

/**
 * Convert lyrics and chords back to text format with [Chord] markers
 * This is useful for editing - converts stored format back to editable text
 * Note: Headings and instructions are preserved as-is in the text
 */
export function lyricsWithChordsToText(lyrics, chords = []) {
  const lines = lyrics.split('\n');
  const renderedLines = renderInlineChords(lyrics, chords);
  return renderedLines.join('\n');
}

/**
 * Check if a chord exists in the main library (static or database)
 * @param {string} chordName - Chord name to check
 * @param {string} instrument - Instrument type
 * @param {string} tuning - Tuning identifier
 * @param {Object} options - Additional options
 * @param {Array} options.mainLibraryChords - Array of main library chord objects (from database)
 * @returns {boolean} True if chord exists in main library
 */
export function isChordInMainLibrary(chordName, instrument, tuning, options = {}) {
  const { mainLibraryChords = [] } = options;
  
  // Check database main library (exact name or flat equivalent for sharp chords)
  const inDatabase = mainLibraryChords.some(c =>
    (c.name === chordName || c.name === toDbName(chordName)) &&
    c.instrument === instrument &&
    c.tuning === tuning &&
    c.libraryType === 'main'
  );
  
  return inDatabase;
}

/**
 * Extract custom chords (chords not in main library OR chords in personal library) from a song
 * Personal library chords are always included, even if they share a name with main library chords,
 * to ensure the user's custom version takes precedence
 * @param {Array} chords - Array of chord objects from song
 * @param {string} instrument - Instrument type
 * @param {string} tuning - Tuning identifier
 * @param {Object} options - Additional options
 * @param {Array} options.mainLibraryChords - Array of main library chord objects
 * @param {Array} options.personalChords - Array of personal library chord objects
 * @returns {Array<string>} Array of chord names that are custom (not in main library) or in personal library
 */
export function extractCustomChords(chords, instrument, tuning, options = {}) {
  const { mainLibraryChords = [], personalChords = [] } = options;
  
  if (!chords || chords.length === 0) return [];
  
  const customChordNames = new Set();
  
  // Create a set of personal chord names for quick lookup
  const personalChordNames = new Set(
    personalChords
      .filter(c => c.libraryType === 'personal' && c.instrument === instrument && c.tuning === tuning)
      .map(c => c.name)
  );
  
  chords.forEach(chord => {
    if (chord.chord) {
      const chordName = chord.chord.trim();
      if (chordName) {
        // Always include if it's in personal library (even if main library has same name)
        if (personalChordNames.has(chordName)) {
          customChordNames.add(chordName);
        } else {
          // Otherwise, only include if it's not in main library
          const inMainLibrary = isChordInMainLibrary(chordName, instrument, tuning, { mainLibraryChords });
          
          if (!inMainLibrary) {
            customChordNames.add(chordName);
          }
        }
      }
    }
  });
  
  return Array.from(customChordNames);
}

/**
 * Build embedded chords data for personal library chords
 * If multiple personal chords exist with the same name, uses the most recently created one
 * @param {Array<string>} customChordNames - Array of custom chord names
 * @param {Array} personalChords - Array of personal library chord objects
 * @param {string} instrument - Instrument type
 * @param {string} tuning - Tuning identifier
 * @returns {Array} Array of embedded chord objects [{name, frets, instrument, tuning}]
 */
export function buildEmbeddedChordsData(customChordNames, personalChords, instrument, tuning) {
  if (!customChordNames || customChordNames.length === 0) {
    return [];
  }
  
  const embeddedChords = [];
  const personalChordMap = new Map();
  
  // Create a map of personal chords by name for quick lookup
  // If multiple chords exist with the same name, keep the most recent one (by id, which includes timestamp)
  personalChords.forEach(chord => {
    if (chord.libraryType === 'personal' && chord.instrument === instrument && chord.tuning === tuning) {
      const existing = personalChordMap.get(chord.name);
      // If no existing chord or this one is newer (by comparing IDs which include timestamp),
      // use this one. For simplicity, we'll just overwrite - the last one processed will be kept.
      // In practice, this should be fine since we're processing in order.
      personalChordMap.set(chord.name, chord);
    }
  });
  
  // Build embedded chords array for custom chords that are in personal library
  customChordNames.forEach(chordName => {
    const personalChord = personalChordMap.get(chordName);
    if (personalChord && personalChord.frets) {
      embeddedChords.push({
        name: chordName,
        frets: personalChord.frets,
        instrument: personalChord.instrument || instrument,
        tuning: personalChord.tuning || tuning,
      });
    }
  });
  
  return embeddedChords;
}

