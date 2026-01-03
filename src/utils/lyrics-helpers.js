/**
 * Parse lyrics text into lines and extract chords
 * Input: "Amazing [C]grace how [G]sweet the [Am]sound\nThat saved a [F]wretch like [C]me"
 * Output: { lyrics: string, chords: array }
 */
export function parseLyricsWithChords(text) {
  const lines = text.split('\n');
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
      
      chords.push({
        id: `chord-${chordId++}`,
        lineIndex,
        position,
        chord: chordName,
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
 */
export function lyricsWithChordsToText(lyrics, chords = []) {
  const lines = lyrics.split('\n');
  const renderedLines = renderInlineChords(lyrics, chords);
  return renderedLines.join('\n');
}

