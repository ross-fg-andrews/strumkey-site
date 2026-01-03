/**
 * Get string labels for an instrument and tuning
 * @param {string} instrument - Instrument type (e.g., 'ukulele')
 * @param {string} tuning - Tuning identifier (e.g., 'ukulele_standard')
 * @returns {Array<string>} Array of string labels
 */
function getStringLabels(instrument, tuning) {
  const configs = {
    'ukulele': {
      'ukulele_standard': ['G', 'C', 'E', 'A'],
      'ukulele_baritone': ['D', 'G', 'B', 'E'],
      'ukulele_low_g': ['G', 'C', 'E', 'A'], // Same as standard, just different octave
    },
    // Add more instruments as needed
    // 'guitar': {
    //   'guitar_standard': ['E', 'A', 'D', 'G', 'B', 'E'],
    // },
  };
  
  return configs[instrument]?.[tuning] || ['G', 'C', 'E', 'A']; // Default to ukulele standard
}

/**
 * ChordDiagram Component
 * Renders an SVG diagram of a chord for any instrument
 * 
 * @param {string} frets - Fret positions as string, e.g., "0003" for C chord
 * @param {string} chordName - Name of the chord, e.g., "C"
 * @param {string} instrument - Instrument type (default: 'ukulele')
 * @param {string} tuning - Tuning identifier (default: 'ukulele_standard')
 */
export default function ChordDiagram({ 
  frets, 
  chordName, 
  instrument = 'ukulele',
  tuning = 'ukulele_standard'
}) {
  if (!frets) {
    return null;
  }

  const stringLabels = getStringLabels(instrument, tuning);
  const stringCount = stringLabels.length;

  // Validate frets match string count
  if (frets.length !== stringCount) {
    console.warn(`Fret notation "${frets}" doesn't match ${stringCount} strings for ${instrument} ${tuning}`);
    return null;
  }

  const fretArray = frets.split('').map(f => {
    if (f === 'x' || f === 'X') return 'muted';
    if (f === '0') return 'open';
    return parseInt(f, 10);
  });

  const numericFrets = fretArray.filter(f => typeof f === 'number');
  const maxFret = numericFrets.length > 0 ? Math.max(...numericFrets) : 0;

  // Calculate dimensions (smaller size)
  const stringSpacing = 12;
  const fretSpacing = 15;
  const startX = 10;
  const topPadding = 12; // Space above nut for open string symbols
  const startY = 10; // Start Y position (nut position)
  const width = Math.max(50, stringCount * stringSpacing + 20); // Adjust width based on string count
  const baseHeight = maxFret > 3 ? (maxFret + 1) * fretSpacing + 15 : 60; // Base height without top padding
  const height = baseHeight + topPadding; // Total height includes top padding

  return (
    <div className="flex flex-col items-center">
      <svg
        width={width}
        height={height}
        viewBox={`0 -${topPadding} ${width} ${height}`}
        className="flex-shrink-0"
      >
        {/* Strings (vertical lines) */}
        {Array.from({ length: stringCount }, (_, i) => i).map((stringIndex) => (
          <line
            key={`string-${stringIndex}`}
            x1={startX + stringIndex * stringSpacing}
            y1={startY}
            x2={startX + stringIndex * stringSpacing}
            y2={height - 10}
            stroke="#666"
            strokeWidth="1"
          />
        ))}

        {/* Frets (horizontal lines) */}
        {[0, 1, 2, 3, 4, 5].map((fretIndex) => (
          <line
            key={`fret-${fretIndex}`}
            x1={startX - 3}
            y1={startY + fretIndex * fretSpacing}
            x2={startX + (stringCount - 1) * stringSpacing + 3}
            y2={startY + fretIndex * fretSpacing}
            stroke="#666"
            strokeWidth={fretIndex === 0 ? "1.5" : "0.8"}
          />
        ))}

        {/* Finger positions */}
        {fretArray.map((fret, stringIndex) => {
          const x = startX + stringIndex * stringSpacing;
          
          if (fret === 'muted') {
            // Draw X for muted string
            return (
              <g key={`muted-${stringIndex}`}>
                <line
                  x1={x - 3}
                  y1={startY - 5}
                  x2={x + 3}
                  y2={startY - 1}
                  stroke="#666"
                  strokeWidth="1.2"
                />
                <line
                  x1={x - 3}
                  y1={startY - 1}
                  x2={x + 3}
                  y2={startY - 5}
                  stroke="#666"
                  strokeWidth="1.2"
                />
              </g>
            );
          }
          
          if (fret === 'open') {
            // Draw circle for open string (with space above the nut)
            return (
              <circle
                key={`open-${stringIndex}`}
                cx={x}
                cy={startY - 8}
                r="2.5"
                fill="none"
                stroke="#666"
                strokeWidth="1"
              />
            );
          }
          
          // Draw filled circle for fretted position
          return (
            <circle
              key={`fret-${stringIndex}`}
              cx={x}
              cy={startY + (fret - 1) * fretSpacing + fretSpacing / 2}
              r="3"
              fill="#333"
            />
          );
        })}
      </svg>
      {chordName && (
        <div className="text-center mt-1 text-xs font-semibold">{chordName}</div>
      )}
    </div>
  );
}

