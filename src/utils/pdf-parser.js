/**
 * PDF parsing utilities for extracting song data from PDF files
 */

import * as pdfjsLib from 'pdfjs-dist';

// Set worker source for pdfjs-dist
// This is required for pdfjs-dist to work properly
// Use the worker file from public directory (copied from node_modules)
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

/**
 * Extract text content from a PDF file
 * @param {File} file - The PDF file to parse
 * @returns {Promise<string>} - The extracted text content
 */
export async function extractTextFromPDF(file) {
  try {
    // Validate file type
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      throw new Error('File must be a PDF');
    }

    // Read file as array buffer
    const arrayBuffer = await file.arrayBuffer();
    
    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    // Extract text from all pages
    let fullText = '';
    
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      // Combine text items, preserving spacing and line breaks
      let pageText = '';
      let lastY = null;
      
      textContent.items.forEach((item) => {
        // If Y position changed significantly, add newline
        if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
          pageText += '\n';
        }

        // Add text item
        pageText += item.str;
        lastY = item.transform[5];
      });
      
      fullText += pageText + '\n';
    }

    return fullText.trim();
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw new Error(`Failed to extract text from PDF: ${error.message}`);
  }
}

/**
 * Check if PDF appears to be text-based (has extractable text)
 * @param {File} file - PDF file object
 * @returns {Promise<boolean>} True if PDF appears to have extractable text
 */
export async function isTextBasedPDF(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    // Check first page for text content
    const page = await pdf.getPage(1);
    const textContent = await page.getTextContent();
    
    // If we have text items with actual content, it's likely text-based
    return textContent.items.some(item => item.str && item.str.trim().length > 0);
  } catch (error) {
    console.error('Error checking PDF type:', error);
    return false;
  }
}

/**
 * Parse song information from extracted PDF text
 * Attempts to identify title, artist, lyrics, and chords
 * @param {string} text - The extracted text from PDF
 * @returns {Object} - Parsed song data with title, artist, lyrics, and chords
 */
export function parseSongFromText(text) {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  if (lines.length === 0) {
    return {
      title: '',
      artist: '',
      lyrics: '',
      chords: []
    };
  }
  
  // Try to identify title (usually first line, often in caps or title case)
  let title = '';
  let artist = '';
  let lyricsStartIndex = 0;
  
  // Common patterns for title/artist:
  // - "Title" by "Artist"
  // - "Title - Artist"
  // - "Title" (Artist)
  // - First line is title, second is artist
  
  const firstLine = lines[0];
  const secondLine = lines.length > 1 ? lines[1] : '';
  
  // Check for "by" pattern
  const byMatch = firstLine.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) {
    title = byMatch[1].trim();
    artist = byMatch[2].trim();
    lyricsStartIndex = 1;
  }
  // Check for " - " pattern
  else if (firstLine.includes(' - ')) {
    const parts = firstLine.split(' - ');
    title = parts[0].trim();
    artist = parts.slice(1).join(' - ').trim();
    lyricsStartIndex = 1;
  }
  // Check for parentheses pattern
  else if (firstLine.includes('(') && firstLine.includes(')')) {
    const parenMatch = firstLine.match(/^(.+?)\s*\((.+?)\)\s*$/);
    if (parenMatch) {
      title = parenMatch[1].trim();
      artist = parenMatch[2].trim();
      lyricsStartIndex = 1;
    } else {
      title = firstLine;
      lyricsStartIndex = 1;
    }
  }
  // Check if second line looks like an artist (shorter, different case)
  else if (secondLine && secondLine.length < firstLine.length && 
           (secondLine === secondLine.toLowerCase() || secondLine === secondLine.toUpperCase())) {
    title = firstLine;
    artist = secondLine;
    lyricsStartIndex = 2;
  }
  // Otherwise, first line is title, check if second is artist
  else {
    title = firstLine;
    // If second line is short and looks like an artist name, use it
    if (secondLine && secondLine.length < 50 && !secondLine.match(/^[A-Z]/)) {
      artist = secondLine;
      lyricsStartIndex = 2;
    } else {
      lyricsStartIndex = 1;
    }
  }
  
  // Extract lyrics (everything after title/artist)
  let lyricsLines = lines.slice(lyricsStartIndex);
  
  // Remove any remaining instances of title or artist from the beginning of lyrics
  // This handles cases where PDF extraction might have duplicated or split the title/artist
  // We'll check up to the first 2 lines to catch cases where title/artist are on separate lines
  const linesToCheck = Math.min(2, lyricsLines.length);
  for (let i = 0; i < linesToCheck; i++) {
    if (lyricsLines.length === 0) break;
    
    const line = lyricsLines[0].trim();
    if (!line) {
      lyricsLines = lyricsLines.slice(1);
      continue;
    }
    
    // Check if this line exactly matches the title or artist (case-insensitive)
    const exactTitleMatch = title && line.toLowerCase() === title.toLowerCase();
    const exactArtistMatch = artist && line.toLowerCase() === artist.toLowerCase();
    
    // Check for combined patterns like "Title by Artist" or "Title - Artist" in the line
    const hasTitleArtistPattern = title && artist && (
      (line.toLowerCase().includes(title.toLowerCase()) && 
       (line.toLowerCase().includes(' by ') || line.toLowerCase().includes(' - ') || line.toLowerCase().includes('(')) &&
       line.toLowerCase().includes(artist.toLowerCase()))
    );
    
    // Only remove if it's an exact match or a clear title/artist pattern
    // This prevents removing legitimate lyrics that happen to mention the title/artist
    if (exactTitleMatch || exactArtistMatch || hasTitleArtistPattern) {
      lyricsLines = lyricsLines.slice(1);
    } else {
      // Stop checking once we find a line that doesn't match
      break;
    }
  }
  
  let lyrics = lyricsLines.join('\n');
  
  // Try to detect and preserve chord notation
  // Common patterns: [C], (C), C, or chords above lyrics
  // We'll preserve brackets and parentheses as chord markers
  
  // Clean up common PDF extraction artifacts
  lyrics = lyrics
    .replace(/\s+/g, ' ') // Multiple spaces to single
    .replace(/\n\s*\n/g, '\n') // Multiple newlines to single
    .trim();
  
  // Split back into lines for processing
  const processedLines = lyrics.split('\n');
  
  // Try to detect chord patterns and format them
  const formattedLines = processedLines.map(line => {
    // If line looks like it might be chords only (short, all caps, common chord names)
    const chordPattern = /^[A-G][#b]?(m|maj|min|dim|aug|sus|add)?(\d+)?(\/[A-G][#b]?)?\s*$/i;
    if (line.match(chordPattern) && line.length < 50) {
      // This might be a chord line, skip it or format it
      return '';
    }
    
    // Look for chord patterns in brackets or parentheses
    // Convert (C) to [C] for consistency
    line = line.replace(/\(([A-G][#b]?(?:m|maj|min|dim|aug|sus|add)?(?:\d+)?(?:\/[A-G][#b]?)?)\)/gi, '[$1]');
    
    return line;
  }).filter(line => line.length > 0);
  
  lyrics = formattedLines.join('\n');
  
  return {
    title: title || 'Untitled Song',
    artist: artist || '',
    lyrics: lyrics || '',
    chords: [] // Chords will be parsed by parseLyricsWithChords when saving
  };
}

/**
 * Import song from PDF file
 * @param {File} file - The PDF file to import
 * @returns {Promise<Object>} - Parsed song data
 */
export async function importSongFromPDF(file) {
  if (!file || file.type !== 'application/pdf') {
    throw new Error('Please select a valid PDF file');
  }
  
  try {
    // Extract text from PDF
    const text = await extractTextFromPDF(file);
    
    if (!text || text.trim().length === 0) {
      throw new Error('PDF appears to be empty or contains no extractable text');
    }
    
    // Parse song data from text
    const songData = parseSongFromText(text);
    
    return songData;
  } catch (error) {
    console.error('Error importing song from PDF:', error);
    throw error;
  }
}

