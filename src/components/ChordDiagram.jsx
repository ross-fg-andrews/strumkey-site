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
  const minFret = numericFrets.length > 0 ? Math.min(...numericFrets) : 0;

  // Calculate number of frets to show
  // If maxFret <= 4: show nut, frets 0-4 (5 frets total), no fret number
  // If maxFret > 4: no nut, show fret number = minFret, show frets from minFret to maxFret
  let fretCount;
  let startFret;
  let showNut;
  
  if (maxFret <= 4) {
    // Chord fits in default 0-4 range - show nut
    showNut = true;
    startFret = 0;
    fretCount = 5; // Always show 5 frets (0-4) when showing nut
  } else {
    // Chord doesn't fit in 0-4 - don't show nut, show fret number
    showNut = false;
    startFret = minFret;
    const chordSpan = maxFret - minFret + 1;
    fretCount = Math.max(4, chordSpan); // Show at least 4 frets, or actual span if more
  }

  // Calculate dimensions
  const stringSpacing = 12;
  const fretSpacing = 15;
  const containerWidth = 60;
  const sideContainerWidth = 14; // Fixed width for left (fret number) and right (empty) containers
  const leftPadding = 2; // Minimal left padding inside SVG to bring diagram closer to fret number
  const rightPadding = 2; // Minimal right padding inside SVG
  const nutExtension = 3; // How much the nut extends beyond strings
  const svgStartX = leftPadding; // Internal SVG X start position for strings
  const stringsWidth = (stringCount - 1) * stringSpacing; // Width spanned by strings
  // SVG width: left padding + strings width + right padding = 2 + 36 + 2 = 40px for 4 strings
  const width = leftPadding + stringsWidth + rightPadding;
  // Label container width: 14px (left) + 40px (SVG) + 14px (right) = 68px total
  const labelContainerWidth = sideContainerWidth + width + sideContainerWidth;
  const startY = 10; // Start Y position (first fret line position)
  const height = fretCount * fretSpacing + 20; // Height based on fret count
  
  return (
    <div className="flex flex-col items-center" style={{ width: labelContainerWidth }}>
      {/* Chord label above diagram - centered over SVG width (68px for 4 strings) */}
      {chordName && (
        <div className="flex justify-center mb-1 w-full">
          <div className="inline-block px-2 py-1 bg-primary-100 text-primary-700 rounded text-sm font-medium">
            {chordName}
          </div>
        </div>
      )}
      {/* Flexbox container with three sections for consistent centering */}
      <div className="flex items-center w-full" style={{ height: height, overflow: 'visible' }}>
        {/* Left container: fixed width, contains fret number or empty */}
        <div 
          className="flex items-center justify-center flex-shrink-0" 
          style={{ width: sideContainerWidth, height: height }}
        >
          {!showNut && (
            <span className="text-xs font-medium text-gray-700 leading-none">
              {minFret}
            </span>
          )}
        </div>
        
        {/* Middle container: flex-1, centers the SVG diagram */}
        <div 
          className="flex-1 flex items-center justify-center" 
          style={{ height: height, overflow: 'visible' }}
        >
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="flex-shrink-0"
          >
          {/* Strings (vertical lines) */}
          {Array.from({ length: stringCount }, (_, i) => i).map((stringIndex) => (
            <line
              key={`string-${stringIndex}`}
              x1={svgStartX + stringIndex * stringSpacing}
              y1={startY}
              x2={svgStartX + stringIndex * stringSpacing}
              y2={height - 10}
              stroke="#666"
              strokeWidth="1"
            />
          ))}

          {/* Frets (horizontal lines) - dynamically render based on fretCount */}
          {Array.from({ length: fretCount }, (_, i) => {
            const absoluteFret = startFret + i;
            const isNut = showNut && absoluteFret === 0;
            // Nut extends beyond strings, other frets stop at string edges
            const x1 = isNut ? svgStartX - 3 : svgStartX;
            const x2 = isNut ? svgStartX + (stringCount - 1) * stringSpacing + 3 : svgStartX + (stringCount - 1) * stringSpacing;
            return (
              <line
                key={`fret-${absoluteFret}`}
                x1={x1}
                y1={startY + i * fretSpacing}
                x2={x2}
                y2={startY + i * fretSpacing}
                stroke="#666"
                strokeWidth={isNut ? "1.5" : "0.8"}
              />
            );
          })}

          {/* Finger positions */}
          {fretArray.map((fret, stringIndex) => {
            const x = svgStartX + stringIndex * stringSpacing;
            
            if (fret === 'muted') {
              // Draw X on first fret position (relative to startFret)
              const muteY = startY + fretSpacing / 2;
              return (
                <g key={`muted-${stringIndex}`}>
                  <line
                    x1={x - 3}
                    y1={muteY - 3}
                    x2={x + 3}
                    y2={muteY + 3}
                    stroke="#666"
                    strokeWidth="1.2"
                  />
                  <line
                    x1={x - 3}
                    y1={muteY + 3}
                    x2={x + 3}
                    y2={muteY - 3}
                    stroke="#666"
                    strokeWidth="1.2"
                  />
                </g>
              );
            }
            
            // Open strings: no indicator (inferred)
            if (fret === 'open') {
              return null;
            }
            
            // Draw filled circle for fretted position with primary color
            // Calculate position relative to startFret
            // Dots are centered in the space BETWEEN fret lines
            // When startFret=0 (showing nut): startY is nut position, dots centered between frets
            // When startFret>0 (no nut): startY is first fret line, dots centered between frets
            const cy = startFret === 0
              ? startY + (fret - 1) * fretSpacing + fretSpacing / 2  // Between nut and fret 1, or between frets
              : startY + (fret - startFret) * fretSpacing + fretSpacing / 2; // Between fret lines starting from startFret
            return (
              <circle
                key={`fret-${stringIndex}`}
                cx={x}
                cy={cy}
                r="3"
                fill="#0ea5e9" // primary-500
              />
            );
          })}
          </svg>
        </div>
        
        {/* Right container: fixed width, always empty for symmetry */}
        <div 
          className="flex-shrink-0" 
          style={{ width: sideContainerWidth, height: height }}
        />
      </div>
    </div>
  );
}

