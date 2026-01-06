/**
 * Song Parser Utility
 * Parses extracted PDF text to identify song metadata and chords
 * Supports both inline bracket format ([G]) and chord-above format
 */

/**
 * Detect chord notation format
 * @param {string} text - Extracted text from PDF
 * @returns {'brackets'|'chord-above'|'unknown'} Detected format
 */
export function detectChordFormat(text) {
  // Check for bracket format: [G], [C7], etc.
  const bracketPattern = /\[([A-G][#b]?(maj|min|m|M|dim|aug|sus|add)?[0-9]*)\]/gi;
  if (bracketPattern.test(text)) {
    return 'brackets';
  }
  
  // Check for chord-above format
  // Look for lines that contain only chord names and whitespace
  const lines = text.split('\n');
  let chordLineCount = 0;
  let lyricLineCount = 0;
  
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim();
    const nextLine = lines[i + 1].trim();
    
    // Check if current line looks like chords
    const chordPattern = /^[\s]*([A-G][#b]?(maj|min|m|M|dim|aug|sus|add)?[0-9]*[\s]+)+$/;
    const isChordLine = chordPattern.test(line) && line.length < 100;
    
    // Check if next line looks like lyrics (has words, longer)
    const isLyricLine = nextLine.length > 20 && /[a-zA-Z]{3,}/.test(nextLine);
    
    if (isChordLine && isLyricLine) {
      chordLineCount++;
    }
    if (isLyricLine) {
      lyricLineCount++;
    }
  }
  
  // If we found multiple chord-above patterns, it's likely chord-above format
  if (chordLineCount >= 2) {
    return 'chord-above';
  }
  
  return 'unknown';
}

/**
 * Extract title and artist from text
 * @param {string} text - Extracted text from PDF
 * @returns {{title: string, artist: string}} Extracted metadata
 */
export function extractMetadata(text) {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  let title = '';
  let artist = '';
  
  // Filter out common non-song content
  const skipPatterns = [
    /^---.*---$/i,
    /^please note/i,
    /^disclaimer/i,
    /^transcribed by:/i,
    /^produced by/i,
    /^www\./i,
    /^http/i,
    /^\d+\s*bpm/i,
    /^intro:/i,
    /^verse/i,
    /^chorus/i,
    /^bridge/i,
    /^outro/i,
    /^key:/i,
    /^writer:/i,
    /^url:/i,
    /^thanks to/i,
    /^ukulele.*tuning/i,
    /^songbook/i,
  ];
  
  const relevantLines = lines.filter(line => {
    return !skipPatterns.some(pattern => pattern.test(line));
  });
  
  if (relevantLines.length === 0) {
    return { title: '', artist: '' };
  }
  
  // Try to find title and artist in first few lines
  // Look for explicit patterns first, then fall back to heuristics
  for (let i = 0; i < Math.min(15, relevantLines.length); i++) {
    const line = relevantLines[i];
    
    // Pattern: "Song: Title" or "Artist: Name" (check this first for explicit format)
    const colonMatch = line.match(/^(song|artist):\s*(.+)$/i);
    if (colonMatch) {
      if (colonMatch[1].toLowerCase() === 'song') {
        title = colonMatch[2].trim();
      } else if (colonMatch[1].toLowerCase() === 'artist') {
        artist = colonMatch[2].trim();
      }
      continue; // Continue to check for the other field
    }
    
    // Pattern: "artist: Name" (lowercase, like in first PDF - can be part of a longer line)
    // Handle both "artist: Name" and "artist:Name" (with or without space)
    const artistColonMatch = line.match(/artist:\s*([^,\n]+)/i);
    if (artistColonMatch && !artist) {
      artist = artistColonMatch[1].trim();
      continue;
    }
    
    // Pattern: Title followed by metadata on same line (e.g., "Wellerman key:Am, artist:The Longest Johns")
    // Extract title from beginning of line before any colons or commas
    if (!title && line.includes('artist:') && !line.match(/^(song|artist):/i)) {
      const titleMatch = line.match(/^([^,:\n]+?)(?:\s+key:|,\s*artist:)/i);
      if (titleMatch) {
        title = titleMatch[1].trim();
        // Also extract artist from same line if present
        const artistMatch = line.match(/artist:\s*([^,\n]+)/i);
        if (artistMatch && !artist) {
          artist = artistMatch[1].trim();
        }
        continue;
      }
    }
    
    // Pattern: "Title (Artist)" or "Title - Artist"
    const titleArtistMatch = line.match(/^(.+?)\s*[(\-–—]\s*(.+?)\s*[)\-–—]/);
    if (titleArtistMatch) {
      title = titleArtistMatch[1].trim();
      artist = titleArtistMatch[2].trim();
      break;
    }
    
    // Pattern: "Title by Artist"
    const byMatch = line.match(/^(.+?)\s+by\s+(.+)$/i);
    if (byMatch) {
      title = byMatch[1].trim();
      artist = byMatch[2].trim();
      break;
    }
  }
  
  // If we still don't have title/artist, use heuristics on first few lines
  if (!title || !artist) {
    for (let i = 0; i < Math.min(5, relevantLines.length); i++) {
      const line = relevantLines[i];
      
      // Skip if it looks like metadata or is too long
      const isMetadataField = /^[a-z]+:/i.test(line);
      const isTooLong = line.length > 100;
      const startsWithNumber = /^\d/.test(line);
      const hasUrl = /http|www\./i.test(line);
      
      if (isMetadataField || isTooLong || startsWithNumber || hasUrl) {
        continue;
      }
      
      // If no title yet and line looks reasonable, use it as title
      if (!title && line.length > 3 && line.length < 100) {
        title = line;
      }
      // If we have title but no artist, and this line is different and reasonable, use as artist
      else if (title && !artist && line.toLowerCase() !== title.toLowerCase() && line.length > 3 && line.length < 100) {
        artist = line;
        break;
      }
    }
  }
  
  // If we found title but not artist, check next few lines
  if (title && !artist && relevantLines.length > 1) {
    for (let i = 1; i < Math.min(5, relevantLines.length); i++) {
      const line = relevantLines[i];
      // Skip if it's the title again or looks like a chord line
      if (line.toLowerCase() === title.toLowerCase() || /^[A-G][#b]?/.test(line)) {
        continue;
      }
      // If it's a reasonable length and doesn't look like lyrics yet, it might be artist
      if (line.length > 0 && line.length < 100) {
        artist = line;
        break;
      }
    }
  }
  
  return { title: title || '', artist: artist || '' };
}

/**
 * Parse chord-above format and convert to bracket format
 * @param {string} text - Extracted text from PDF
 * @returns {string} Text with chords in bracket format
 */
export function parseChordAboveFormat(text) {
  const lines = text.split('\n');
  const result = [];
  
  let i = 0;
  while (i < lines.length) {
    const currentLine = lines[i];
    const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
    
    // Check if current line is a chord line
    const chordPattern = /^[\s]*([A-G][#b]?(maj|min|m|M|dim|aug|sus|add)?[0-9]*[\s]+)+$/;
    const isChordLine = chordPattern.test(currentLine.trim()) && currentLine.trim().length < 100;
    
    // Check if next line is a lyric line
    const isLyricLine = nextLine.trim().length > 20 && /[a-zA-Z]{3,}/.test(nextLine);
    
    if (isChordLine && isLyricLine) {
      // Parse chord positions
      const chordLine = currentLine;
      const lyricLine = nextLine;
      
      // Extract chords and their positions
      const chordMatches = [];
      const chordRegex = /([A-G][#b]?(maj|min|m|M|dim|aug|sus|add)?[0-9]*)/g;
      let match;
      
      while ((match = chordRegex.exec(chordLine)) !== null) {
        chordMatches.push({
          chord: match[1].trim(), // Trim whitespace from chord name
          position: match.index,
        });
      }
      
      // Map chords to lyric line positions
      // Use relative positioning based on chord line spacing
      let convertedLine = lyricLine;
      let offset = 0;
      
      // Sort chords by position (right to left to avoid index shifting)
      const sortedChords = [...chordMatches].sort((a, b) => b.position - a.position);
      
      for (const chordMatch of sortedChords) {
        // Calculate approximate position in lyric line
        // Use relative position from chord line start
        const relativePos = chordMatch.position / chordLine.length;
        const lyricPos = Math.floor(relativePos * lyricLine.length);
        
        // Find nearest word boundary or space
        let insertPos = lyricPos;
        
        // Look for space or word boundary near the calculated position
        const searchRange = Math.min(10, lyricLine.length - insertPos);
        for (let j = 0; j < searchRange; j++) {
          const pos = insertPos + j;
          if (pos < lyricLine.length && (lyricLine[pos] === ' ' || pos === 0)) {
            insertPos = pos;
            break;
          }
        }
        
        // Insert chord marker
        convertedLine = convertedLine.slice(0, insertPos) + 
                       `[${chordMatch.chord}]` + 
                       convertedLine.slice(insertPos);
      }
      
      result.push(convertedLine);
      i += 2; // Skip both chord and lyric lines
    } else {
      // Not a chord-above pair, add line as-is
      result.push(currentLine);
      i++;
    }
  }
  
  return result.join('\n');
}

/**
 * Clean text by removing metadata and non-song content
 * @param {string} text - Extracted text from PDF
 * @returns {string} Cleaned text
 */
export function cleanSongText(text) {
  const lines = text.split('\n');
  const cleanedLines = [];
  
  let foundSongContent = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines ONLY at the very start (before finding any content)
    if (!foundSongContent && trimmed.length === 0) {
      continue;
    }
    
    // Skip disclaimers and metadata headers
    if (/^---.*---$/i.test(trimmed) ||
        /^please note/i.test(trimmed) ||
        /^disclaimer/i.test(trimmed) ||
        /^transcribed by:/i.test(trimmed) ||
        /^\d+\s*bpm/i.test(trimmed) ||
        /^key:/i.test(trimmed) ||
        /^writer:/i.test(trimmed) ||
        /^url:/i.test(trimmed) ||
        /^thanks to/i.test(trimmed)) {
      continue;
    }
    
    // Skip "Song:" or "Artist:" labels (metadata will be extracted separately)
    if (/^(song|artist):\s*(.+)$/i.test(trimmed)) {
      // Don't mark as song content yet, but don't add to cleaned lines
      continue;
    }
    
    // Skip "Intro:" lines
    if (/^intro:/i.test(trimmed)) {
      continue;
    }
    
    // Once we find actual song content (not metadata), start collecting
    if (trimmed.length > 0) {
      foundSongContent = true;
    }
    
    if (foundSongContent) {
      cleanedLines.push(line); // Preserve original line including empty lines for line breaks
    }
  }
  
  return cleanedLines.join('\n');
}

/**
 * Parse song from extracted PDF text
 * @param {string} text - Extracted text from PDF
 * @returns {{title: string, artist: string, lyricsText: string}} Parsed song data
 */
export function parseSongFromText(text) {
  // Extract metadata FIRST from original text (before cleaning removes metadata lines)
  const { title, artist } = extractMetadata(text);
  
  // Now clean the text (removes metadata lines, disclaimers, etc.)
  const cleanedText = cleanSongText(text);
  
  // Detect format
  const format = detectChordFormat(cleanedText);
  
  let lyricsText = cleanedText;
  
  // Convert chord-above format to bracket format if needed
  if (format === 'chord-above') {
    lyricsText = parseChordAboveFormat(cleanedText);
  }
  
  // If format is unknown or brackets, use text as-is
  // (bracket format is already compatible)
  
  return {
    title,
    artist,
    lyricsText,
  };
}

