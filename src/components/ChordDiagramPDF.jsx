import React from 'react';
import { View, Text, Svg, Line, Circle, G } from '@react-pdf/renderer';
import { formatChordNameForDisplay } from '../utils/chord-formatting';

/**
 * Get string labels for an instrument and tuning (same as ChordDiagram)
 */
function getStringLabels(instrument, tuning) {
  const configs = {
    ukulele: {
      ukulele_standard: ['G', 'C', 'E', 'A'],
      ukulele_baritone: ['D', 'G', 'B', 'E'],
      ukulele_low_g: ['G', 'C', 'E', 'A'],
    },
  };
  return configs[instrument]?.[tuning] || ['G', 'C', 'E', 'A'];
}

/**
 * ChordDiagramPDF - Renders a chord diagram using @react-pdf/renderer Svg primitives.
 * Same layout logic as ChordDiagram.jsx (stringSpacing, fretSpacing, dotRadius, etc.).
 *
 * @param {string|Array} frets - Fret positions as string (e.g. "0003") or array
 * @param {string} chordName - Name of the chord
 * @param {number} baseFret - Optional base fret number
 * @param {number} position - Optional position number (1 = most common)
 * @param {string} instrument - Instrument type (default 'ukulele')
 * @param {string} tuning - Tuning identifier (default 'ukulele_standard')
 * @param {number} scale - Optional scale factor for diagram size (default 1)
 */
export default function ChordDiagramPDF({
  frets,
  chordName,
  baseFret: providedBaseFret,
  position,
  instrument = 'ukulele',
  tuning = 'ukulele_standard',
  scale = 1,
}) {
  if (!frets) return null;

  const stringLabels = getStringLabels(instrument, tuning);
  const stringCount = stringLabels.length;

  let fretArray;
  if (Array.isArray(frets)) {
    if (frets.length !== stringCount) return null;
    fretArray = frets.map((f) => {
      if (f === null || f === undefined) return 'muted';
      if (typeof f === 'string' && (f === 'x' || f === 'X')) return 'muted';
      const num = typeof f === 'number' ? f : parseInt(f, 10);
      if (isNaN(num)) return 'muted';
      if (num === 0) return 'open';
      return num;
    });
  } else if (typeof frets === 'string') {
    if (frets.length !== stringCount) return null;
    fretArray = frets.split('').map((f) => {
      if (f === 'x' || f === 'X') return 'muted';
      if (f === '0') return 'open';
      return parseInt(f, 10);
    });
  } else {
    return null;
  }

  if (providedBaseFret !== undefined && providedBaseFret !== null && providedBaseFret > 0) {
    fretArray = fretArray.map((fret) => {
      if (fret === 'open' || fret === 'muted' || fret === 0) return fret;
      if (typeof fret === 'number' && fret > 0) return providedBaseFret + (fret - 1);
      return fret;
    });
  }

  const numericFrets = fretArray.filter((f) => typeof f === 'number');
  const maxFret = numericFrets.length > 0 ? Math.max(...numericFrets) : 0;
  const minFret = numericFrets.length > 0 ? Math.min(...numericFrets) : 0;
  const baseFret =
    providedBaseFret !== undefined && providedBaseFret !== null ? providedBaseFret : minFret;

  let fretCount;
  let startFret;
  let showNut;
  if (maxFret <= 4) {
    showNut = true;
    startFret = 0;
    fretCount = 5;
  } else {
    showNut = false;
    startFret = baseFret;
    const chordSpan = maxFret - baseFret + 1;
    fretCount = Math.max(5, chordSpan + 1);
  }

  const stringSpacing = 12 * scale;
  const fretSpacing = 12 * scale;
  const dotRadius = 4.5 * scale;
  const leftPadding = 5 * scale;
  const rightPadding = 5 * scale;
  const BOTTOM_PADDING = 8 * scale;
  const svgStartX = leftPadding;
  const width = leftPadding + (stringCount - 1) * stringSpacing + rightPadding;
  const sideContainerWidth = 14 * scale;
  const startY = 6 * scale;
  const height = startY + (fretCount - 1) * fretSpacing + 3 * scale + BOTTOM_PADDING;
  const labelContainerWidth = sideContainerWidth + width + sideContainerWidth;
  const fretNumberY =
    !showNut && baseFret > 0
      ? startY + (baseFret - startFret) * fretSpacing + fretSpacing / 2
      : null;

  const styles = {
    wrapper: { flexDirection: 'column', alignItems: 'center', width: labelContainerWidth },
    labelRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 2 },
    labelText: { fontSize: 9 * scale, fontFamily: 'Helvetica', fontWeight: 'bold' },
    row: { flexDirection: 'row', alignItems: 'flex-start', height },
    leftCol: {
      width: sideContainerWidth,
      height,
      paddingTop: fretNumberY != null ? fretNumberY - 5 : 0,
      alignItems: 'center',
    },
    fretNumber: { fontSize: 8 * scale, fontFamily: 'Helvetica' },
  };

  return (
    <View style={styles.wrapper}>
      {chordName && (
        <View style={styles.labelRow}>
          <Text style={styles.labelText}>
            {formatChordNameForDisplay(chordName)}
            {position > 1 ? ` ${position}` : ''}
          </Text>
        </View>
      )}
      <View style={styles.row}>
        <View style={styles.leftCol}>
          {!showNut && fretNumberY != null && (
            <Text style={styles.fretNumber}>{baseFret}</Text>
          )}
        </View>
        <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          {Array.from({ length: stringCount }, (_, i) => i).map((stringIndex) => (
            <Line
              key={`string-${stringIndex}`}
              x1={svgStartX + stringIndex * stringSpacing}
              y1={startY}
              x2={svgStartX + stringIndex * stringSpacing}
              y2={startY + (fretCount - 1) * fretSpacing + 3 * scale}
              stroke="#666"
              strokeWidth={1}
            />
          ))}
          {Array.from({ length: fretCount }, (_, i) => {
            const absoluteFret = startFret + i;
            const isNut = showNut && absoluteFret === 0;
            const x1 = isNut ? svgStartX - 3 * scale : svgStartX;
            const x2 =
              isNut
                ? svgStartX + (stringCount - 1) * stringSpacing + 3 * scale
                : svgStartX + (stringCount - 1) * stringSpacing;
            return (
              <Line
                key={`fret-${absoluteFret}`}
                x1={x1}
                y1={startY + i * fretSpacing}
                x2={x2}
                y2={startY + i * fretSpacing}
                stroke="#666"
                strokeWidth={isNut ? 1.5 : 0.8}
              />
            );
          })}
          {fretArray.map((fret, stringIndex) => {
            const x = svgStartX + stringIndex * stringSpacing;
            if (fret === 'muted') {
              const muteY = startY + fretSpacing / 2;
              return (
                <G key={`muted-${stringIndex}`}>
                  <Line
                    x1={x - 3 * scale}
                    y1={muteY - 3 * scale}
                    x2={x + 3 * scale}
                    y2={muteY + 3 * scale}
                    stroke="#666"
                    strokeWidth={1.2}
                  />
                  <Line
                    x1={x - 3 * scale}
                    y1={muteY + 3 * scale}
                    x2={x + 3 * scale}
                    y2={muteY - 3 * scale}
                    stroke="#666"
                    strokeWidth={1.2}
                  />
                </G>
              );
            }
            if (fret === 'open') return null;
            const cy =
              startFret === 0
                ? startY + (fret - 1) * fretSpacing + fretSpacing / 2
                : startY + (fret - startFret) * fretSpacing + fretSpacing / 2;
            return (
              <Circle
                key={`fret-${stringIndex}`}
                cx={x}
                cy={cy}
                r={dotRadius}
                fill="#0ea5e9"
              />
            );
          })}
        </Svg>
        <View style={{ width: sideContainerWidth, height }} />
      </View>
    </View>
  );
}

