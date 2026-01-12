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
 * @param {string|Array} frets - Fret positions as string (e.g., "0003") or array (e.g., [0,0,0,3])
 * @param {string} chordName - Name of the chord, e.g., "C"
 * @param {string} instrument - Instrument type (default: 'ukulele')
 * @param {string} tuning - Tuning identifier (default: 'ukulele_standard')
 * @param {number} baseFret - Optional base fret number (if provided, used instead of calculating from frets)
 */
export default function ChordDiagram({ 
  frets, 
  chordName, 
  instrument = 'ukulele',
  tuning = 'ukulele_standard',
  baseFret: providedBaseFret
}) {
  if (!frets) {
    return null;
  }

  const stringLabels = getStringLabels(instrument, tuning);
  const stringCount = stringLabels.length;

  // Handle both string and array formats for backward compatibility
  let fretArray;
  if (Array.isArray(frets)) {
    // New format: array of numbers
    if (frets.length !== stringCount) {
      console.warn(`Fret array length ${frets.length} doesn't match ${stringCount} strings for ${instrument} ${tuning}`);
      return null;
    }
    fretArray = frets.map(f => {
      if (f === null || f === undefined) return 'muted';
      if (typeof f === 'string' && (f === 'x' || f === 'X')) return 'muted';
      const num = typeof f === 'number' ? f : parseInt(f, 10);
      if (isNaN(num)) return 'muted';
      if (num === 0) return 'open';
      return num;
    });
  } else if (typeof frets === 'string') {
    // Legacy format: string like "0003"
    if (frets.length !== stringCount) {
      console.warn(`Fret notation "${frets}" doesn't match ${stringCount} strings for ${instrument} ${tuning}`);
      return null;
    }
    fretArray = frets.split('').map(f => {
      if (f === 'x' || f === 'X') return 'muted';
      if (f === '0') return 'open';
      return parseInt(f, 10);
    });
  } else {
    console.warn(`Invalid frets format: ${typeof frets}`);
    return null;
  }

  const numericFrets = fretArray.filter(f => typeof f === 'number');
  const maxFret = numericFrets.length > 0 ? Math.max(...numericFrets) : 0;
  const minFret = numericFrets.length > 0 ? Math.min(...numericFrets) : 0;
  
  // Use provided baseFret if available, otherwise calculate from minFret
  const baseFret = providedBaseFret !== undefined && providedBaseFret !== null 
    ? providedBaseFret 
    : minFret;

  // Calculate number of frets to show
  // If maxFret <= 4: show nut, frets 0-4 (5 frets total), no fret number
  // If maxFret > 4: no nut, show fret number = baseFret, show frets from baseFret to maxFret
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
    startFret = baseFret; // Use baseFret (either provided or calculated)
    const chordSpan = maxFret - baseFret + 1;
    // Always show at least 4 fret spaces (which requires 5 fret lines)
    // For example: frets 5-8 need lines at 5,6,7,8,9 to show spaces 5-6, 6-7, 7-8, 8-9
    fretCount = Math.max(5, chordSpan + 1);
  }

  // Calculate dimensions
  const stringSpacing = 12;
  const fretSpacing = 12; // Square fret spaces (same as string spacing)
  const containerWidth = 60;
  const sideContainerWidth = 14; // Fixed width for left (fret number) and right (empty) containers
  const dotRadius = 4.5; // Finger position dot radius
  const leftPadding = 5; // Padding to accommodate dot radius and prevent cropping
  const rightPadding = 5; // Padding to accommodate dot radius and prevent cropping
  const nutExtension = 3; // How much the nut extends beyond strings
  const svgStartX = leftPadding; // Internal SVG X start position for strings
  const stringsWidth = (stringCount - 1) * stringSpacing; // Width spanned by strings
  // SVG width: left padding + strings width + right padding = 5 + 36 + 5 = 46px for 4 strings
  const width = leftPadding + stringsWidth + rightPadding;
  // Label container width: 14px (left) + 46px (SVG) + 14px (right) = 74px total
  const labelContainerWidth = sideContainerWidth + width + sideContainerWidth;
  const startY = 6; // Start Y position (first fret line position)
  const height = fretCount * fretSpacing + 20; // Height based on fret count
  
  // Calculate Y position for fret number (centered at baseFret position)
  const fretNumberY = !showNut && baseFret > 0
    ? startY + (baseFret - startFret) * fretSpacing + fretSpacing / 2
    : null;
  
  return (
    <div className="flex flex-col items-center" style={{ width: labelContainerWidth }}>
      {/* Chord label above diagram - centered over SVG width (68px for 4 strings) */}
      {chordName && (
        <div className="flex justify-center mb-0.5 w-full">
          <div className="inline-block px-2 py-1 bg-primary-100 text-primary-700 rounded text-sm font-medium">
            {chordName}
          </div>
        </div>
      )}
      {/* Flexbox container with three sections for consistent centering */}
      <div className="flex items-center w-full" style={{ height: height, overflow: 'visible' }}>
        {/* Left container: fixed width, contains fret number or empty */}
        <div 
          className="flex-shrink-0 relative" 
          style={{ width: sideContainerWidth, height: height }}
        >
          {!showNut && fretNumberY !== null && (
            <span 
              className="absolute text-xs font-medium text-gray-700 leading-none"
              style={{ top: fretNumberY, left: '50%', transform: 'translate(-50%, -50%)' }}
            >
              {baseFret}
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
          {Array.from({ length: stringCount }, (_, i) => i).map((stringIndex) => {
            const bottomFretY = startY + (fretCount - 1) * fretSpacing;
            return (
              <line
                key={`string-${stringIndex}`}
                x1={svgStartX + stringIndex * stringSpacing}
                y1={startY}
                x2={svgStartX + stringIndex * stringSpacing}
                y2={bottomFretY + 3}
                stroke="#666"
                strokeWidth="1"
              />
            );
          })}

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
                r={dotRadius}
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

