/**
 * Format chord name for display
 * Converts "minor" to "m" while preserving other parts of chord names
 * 
 * Examples:
 * - "C Minor" → "Cm"
 * - "A Minor" → "Am"
 * - "C# Minor" → "C#m"
 * - "Bb Minor" → "Bbm"
 * - "Am7" → "Am7" (already has "m", no change)
 * - "C Minor:2" → "Cm:2" (preserves position)
 * 
 * @param {string} chordName - Chord name to format (e.g., "C Minor", "Am7")
 * @returns {string} Formatted chord name (e.g., "Cm", "Am7")
 */
export function formatChordNameForDisplay(chordName) {
  if (!chordName || typeof chordName !== 'string') {
    return chordName;
  }

  // Split by colon to preserve position numbers (e.g., "C Minor:2" → ["C Minor", "2"])
  const parts = chordName.split(':');
  const baseName = parts[0].trim();
  const position = parts.length > 1 ? parts.slice(1).join(':') : null;

  // Replace "minor" (case-insensitive) with "m"
  // Handle both formats: "C Minor" (with space) and "Cminor" (no space)
  // This handles:
  // - "C Minor" → "Cm" (space before, optional space after or end of string)
  // - "Cminor" → "Cm" (no space, directly attached)
  // - "Am7" → "Am7" (already has "m", won't match)
  // First handle no-space format (directly attached to note)
  let formatted = baseName.replace(/([A-Ga-g][#b]?)minor/gi, '$1m'); // "Cminor" → "Cm", "Aminor" → "Am"
  // Then handle space format (space before, optional space after or end)
  formatted = formatted.replace(/\s+minor(\s|$)/gi, 'm$1'); // "C Minor" → "Cm", "C Minor " → "Cm "

  // Reconstruct with position if it existed
  if (position !== null) {
    return `${formatted}:${position}`;
  }

  return formatted;
}
