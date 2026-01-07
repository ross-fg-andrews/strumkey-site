import { CHORD_SEED_DATA } from '../data/chord-seed';

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
    // Match [ChordName] or [ChordName|variation:frets:libraryType] patterns
    // Backward compatible: [ChordName] still works
    const chordPattern = /\[([^\]]+)\]/g;
    let match;
    let removedLength = 0; // Track cumulative length of removed chord markers
    const cleanLine = line.replace(chordPattern, (matchStr, chordContent, offset) => {
      // offset is the position in the ORIGINAL string
      // We need the position in the CLEANED string (after removing previous markers)
      const position = offset - removedLength;
      
      // Parse chord content: could be "ChordName" or "ChordName|variation:frets:libraryType"
      let chordName = chordContent.trim();
      let variation = 'standard';
      let frets = null;
      let libraryType = null;
      
      // Check if we have variation info (format: ChordName|variation:frets:libraryType)
      if (chordName.includes('|')) {
        const parts = chordName.split('|');
        chordName = parts[0].trim();
        if (parts[1]) {
          const metaParts = parts[1].split(':');
          if (metaParts[0]) variation = metaParts[0].trim() || 'standard';
          if (metaParts[1]) frets = metaParts[1].trim() || null;
          if (metaParts[2]) libraryType = metaParts[2].trim() || null;
        }
      }
      
      chords.push({
        id: `chord-${chordId++}`,
        lineIndex,
        position,
        chord: chordName,
        variation,
        ...(frets && { frets }),
        ...(libraryType && { libraryType }),
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
 * Render lyrics with chords in inline mode
 */
export function renderInlineChords(lyrics, chords = []) {
  const lines = lyrics.split('\n');
  
  return lines.map((line, lineIndex) => {
    const lineChords = chords.filter(c => c.lineIndex === lineIndex)
      .sort((a, b) => a.position - b.position);

    if (lineChords.length === 0) {
      return line;
    }

    let result = [];
    let lastIndex = 0;

    lineChords.forEach(({ position, chord }) => {
      // Add text before chord
      if (position > lastIndex) {
        result.push(line.substring(lastIndex, position));
      }
      // Add chord marker
      result.push(`[${chord}]`);
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
 * Render lyrics with chords above
 */
export function renderAboveChords(lyrics, chords = []) {
  const lines = lyrics.split('\n');
  
  return lines.map((line, lineIndex) => {
    const lineChords = chords.filter(c => c.lineIndex === lineIndex)
      .sort((a, b) => a.position - b.position);

    if (lineChords.length === 0) {
      // Trim leading spaces from lines without chords
      const trimmedLine = line.replace(/^\s+/, '');
      return { chordSegments: [], lyricLine: trimmedLine };
    }

    // Find leading spaces to trim
    const leadingSpacesMatch = line.match(/^\s+/);
    const leadingSpacesCount = leadingSpacesMatch ? leadingSpacesMatch[0].length : 0;
    
    // Trim leading spaces from the line
    const trimmedLine = line.substring(leadingSpacesCount);
    
    // Adjust chord positions by subtracting leading spaces
    const adjustedChords = lineChords.map(({ position, chord, id }) => ({
      position: Math.max(0, position - leadingSpacesCount),
      chord,
      id,
    })).filter(({ position }) => position >= 0); // Remove chords that were in leading spaces

    if (adjustedChords.length === 0) {
      return { chordSegments: [], lyricLine: trimmedLine };
    }

    // Collapse multiple consecutive spaces to single spaces in the lyric line
    // This fixes double spaces where chord markers were removed between words
    // We need to adjust chord positions accordingly to maintain alignment
    let collapsedLyricLine = '';
    const positionMap = new Map(); // Maps old position to new position after space collapsing
    let newPos = 0;
    let inSpaceRun = false;
    
    for (let oldPos = 0; oldPos < trimmedLine.length; oldPos++) {
      const char = trimmedLine[oldPos];
      if (char === ' ') {
        if (!inSpaceRun) {
          // First space in a run - keep it and map position
          collapsedLyricLine += ' ';
          positionMap.set(oldPos, newPos);
          newPos++;
          inSpaceRun = true;
        } else {
          // Subsequent space in a run - skip it, map to same position as first space
          positionMap.set(oldPos, newPos - 1);
        }
      } else {
        inSpaceRun = false;
        collapsedLyricLine += char;
        positionMap.set(oldPos, newPos);
        newPos++;
      }
    }
    
    // Adjust chord positions based on space collapsing
    const adjustedChordsForCollapsed = adjustedChords.map(({ position, chord, id }) => {
      const newPosition = positionMap.get(position) ?? position;
      return { position: newPosition, chord, id };
    });

    // Build the chord line by placing each chord at its exact position
    // The position represents where the chord was inserted in the lyrics
    // We want to place the chord starting at that position (above the character at that index)
    const lineLength = collapsedLyricLine.length;
    // Make sure we have enough space for chords that might extend beyond the line
    const maxLength = Math.max(
      lineLength,
      ...adjustedChordsForCollapsed.map(({ position, chord }) => (position || 0) + (chord?.length || 0))
    );
    const chordLineArray = new Array(maxLength).fill(' ');
    
    adjustedChordsForCollapsed.forEach(({ position, chord }) => {
      // Validate position and chord
      if (position === undefined || position === null || isNaN(position) || !chord || chord.length === 0) {
        return;
      }
      
      // The position represents where the chord marker was in the cleaned string
      // In standard chord notation, chords appear above the character that follows the insertion point
      // So we place the chord starting at the stored position
      const startPos = Math.max(0, position);
      
      // Place each character of the chord at the correct position
      for (let i = 0; i < chord.length; i++) {
        const charPos = startPos + i;
        if (charPos < chordLineArray.length) {
          chordLineArray[charPos] = chord[i];
        }
      }
    });

    // Ensure both lines are the same length for proper alignment
    const lyricLinePadded = collapsedLyricLine.padEnd(maxLength, ' ');
    
    // Convert chord line array into structured segments
    const chordSegments = [];
    let currentSegment = null;
    
    for (let i = 0; i < chordLineArray.length; i++) {
      const char = chordLineArray[i];
      if (char === ' ') {
        // Space character
        if (currentSegment && currentSegment.type === 'space') {
          // Extend existing space segment
          currentSegment.content += ' ';
        } else {
          // Start new space segment
          if (currentSegment) {
            chordSegments.push(currentSegment);
          }
          currentSegment = { type: 'space', content: ' ', startPos: i };
        }
      } else {
        // Chord character
        if (currentSegment && currentSegment.type === 'chord') {
          // Extend existing chord segment
          currentSegment.content += char;
        } else {
          // Start new chord segment
          if (currentSegment) {
            chordSegments.push(currentSegment);
          }
          currentSegment = { type: 'chord', content: char, startPos: i };
        }
      }
    }
    
    // Push the last segment
    if (currentSegment) {
      chordSegments.push(currentSegment);
    }

    return {
      chordSegments,
      lyricLine: lyricLinePadded,
    };
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
 * Convert lyrics and chords back to text format with [Chord] markers
 * This is useful for editing - converts stored format back to editable text
 * Includes variation info if present: [ChordName|variation:frets:libraryType]
 */
export function lyricsWithChordsToText(lyrics, chords = []) {
  const lines = lyrics.split('\n');
  
  return lines.map((line, lineIndex) => {
    const lineChords = chords
      .filter(c => c.lineIndex === lineIndex)
      .sort((a, b) => a.position - b.position);

    if (lineChords.length === 0) {
      return line;
    }

    let result = [];
    let lastIndex = 0;

    lineChords.forEach(({ position, chord, variation, frets, libraryType }) => {
      // Add text before chord
      if (position > lastIndex) {
        result.push(line.substring(lastIndex, position));
      }
      
      // Build chord marker with variation info if present
      let chordMarker = `[${chord}`;
      if (variation && variation !== 'standard') {
        chordMarker += `|${variation}`;
        if (frets) chordMarker += `:${frets}`;
        if (libraryType) chordMarker += `:${libraryType}`;
      } else if (frets || libraryType) {
        // Even if variation is standard, include frets/libraryType if available
        chordMarker += `|standard`;
        if (frets) chordMarker += `:${frets}`;
        if (libraryType) chordMarker += `:${libraryType}`;
      }
      chordMarker += ']';
      
      result.push(chordMarker);
      lastIndex = position;
    });

    // Add remaining text
    if (lastIndex < line.length) {
      result.push(line.substring(lastIndex));
    }

    return result.join('');
  }).join('\n');
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
  
  // Check static seed data (imported at top level)
  try {
    const inStatic = CHORD_SEED_DATA.some(c => 
      c.name === chordName &&
      c.instrument === instrument &&
      c.tuning === tuning
    );
    if (inStatic) return true;
  } catch (e) {
    console.warn('Error checking static library:', e);
  }
  
  // Check database main library
  const inDatabase = mainLibraryChords.some(c =>
    c.name === chordName &&
    c.instrument === instrument &&
    c.tuning === tuning &&
    c.libraryType === 'main'
  );
  
  return inDatabase;
}

/**
 * Extract custom chords (chords not in main library) from a song
 * @param {Array} chords - Array of chord objects from song
 * @param {string} instrument - Instrument type
 * @param {string} tuning - Tuning identifier
 * @param {Object} options - Additional options
 * @param {Array} options.mainLibraryChords - Array of main library chord objects
 * @param {Array} options.personalChords - Array of personal library chord objects
 * @returns {Array<string>} Array of chord names that are custom (not in main library)
 */
export function extractCustomChords(chords, instrument, tuning, options = {}) {
  const { mainLibraryChords = [], personalChords = [] } = options;
  
  if (!chords || chords.length === 0) return [];
  
  const customChordNames = new Set();
  
  chords.forEach(chord => {
    if (chord.chord) {
      const chordName = chord.chord.trim();
      if (chordName) {
        // Check if it's in main library
        const inMainLibrary = isChordInMainLibrary(chordName, instrument, tuning, { mainLibraryChords });
        
        if (!inMainLibrary) {
          customChordNames.add(chordName);
        }
      }
    }
  });
  
  return Array.from(customChordNames);
}

/**
 * Build embedded chords data for personal library chords
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
  personalChords.forEach(chord => {
    if (chord.libraryType === 'personal' && chord.instrument === instrument && chord.tuning === tuning) {
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

