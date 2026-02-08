import React from 'react';
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from '@react-pdf/renderer';
import { renderInlineChords, renderAboveChords, parseChordMarker } from '../utils/lyrics-helpers';
import { formatChordNameForDisplay } from '../utils/chord-formatting';
import ChordDiagramPDF from './ChordDiagramPDF';

// Use built-in fonts only - custom fonts (e.g. Alice woff2) can trigger DataView
// subsetting errors in react-pdf. Helvetica is a clean serif-like default for titles.
const fontFamily = 'Helvetica';
const fontFamilyMono = 'Courier';
const fontFamilyTitle = 'Helvetica';

// Page size configs (width, height in points; 72 pt = 1 inch)
const PAGE_WIDTHS = {
  A4: 595.28,
  LETTER: 612,
  TABLET_IPAD: 419,
  TABLET_ANDROID: 450,
};
const PAGE_SIZES = {
  A4: { size: 'A4', margin: 54 }, // 0.75 inch = 54 pt
  LETTER: { size: 'LETTER', margin: 54 },
  TABLET_IPAD: { size: [419, 559], margin: 18 }, // 4:3 portrait, 0.25 in
  TABLET_ANDROID: { size: [450, 720], margin: 18 }, // 16:10 portrait
};

function getPageConfig(pageSize) {
  return PAGE_SIZES[pageSize] || PAGE_SIZES.A4;
}

function getContentWidth(pageSize, margin) {
  const w = PAGE_WIDTHS[pageSize];
  return w != null ? w - 2 * margin : undefined;
}

export default function SongPDFDocument({
  song,
  chords = [],
  chordDiagrams = [],
  pageSize = 'A4',
  chordDisplayMode = 'inline',
  chordDiagramPlacement = 'top',
  fitToOnePage = false,
  lyricsFontSize = 11,
  diagramScale = 1,
}) {
  if (!song || !song.lyrics) return null;

  const config = getPageConfig(pageSize);
  const margin = config.margin;
  const contentWidth = getContentWidth(pageSize, margin);

  const styles = StyleSheet.create({
    page: {
      padding: margin,
      fontFamily: fontFamily,
      fontSize: 11,
    },
    title: {
      fontFamily: fontFamilyTitle,
      fontSize: 28,
      fontWeight: 'bold',
      marginBottom: 4,
      color: '#111',
    },
    artist: {
      fontFamily: fontFamilyTitle,
      fontSize: 14,
      marginBottom: 16,
      color: '#374151',
    },
    lyricsBlock: {
      marginTop: 8,
    },
    line: {
      fontFamily: fontFamilyMono,
      fontSize: lyricsFontSize,
      lineHeight: 1.4,
      marginBottom: 4,
      color: '#111',
    },
    lineAboveChord: {
      fontFamily: fontFamilyMono,
      fontSize: lyricsFontSize,
      lineHeight: 1.2,
      marginBottom: 2,
      color: '#111',
      whiteSpace: 'pre',
    },
    lineLyric: {
      fontFamily: fontFamilyMono,
      fontSize: lyricsFontSize,
      lineHeight: 1.4,
      marginBottom: 8,
      whiteSpace: 'pre',
      color: '#111',
    },
    lineBlock: {
      fontFamily: fontFamilyMono,
      fontSize: lyricsFontSize,
      whiteSpace: 'pre',
      marginBottom: 8,
    },
    heading: {
      fontFamily: fontFamily,
      fontSize: 16,
      fontWeight: 'bold',
      marginTop: 12,
      marginBottom: 6,
      color: '#1f2937',
    },
    instruction: {
      fontFamily: fontFamily,
      fontSize: 11,
      fontStyle: 'italic',
      marginBottom: 6,
      paddingLeft: 8,
      borderLeftWidth: 2,
      borderLeftColor: '#d1d5db',
      color: '#4b5563',
    },
    chordInline: {
      fontFamily: fontFamilyMono,
      fontSize: lyricsFontSize,
      fontWeight: 'bold',
      color: '#0369a1',
    },
    chordAbove: {
      fontFamily: fontFamilyMono,
      fontSize: lyricsFontSize,
      fontWeight: 'bold',
      color: '#0369a1',
    },
    diagramsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 4,
      marginBottom: 12,
      alignItems: 'flex-start',
    },
    diagramsSide: {
      position: 'absolute',
      right: 0,
      top: 0,
      width: 100,
    },
    mainContent: {
      flexDirection: 'row',
      flex: 1,
      width: chordDiagramPlacement === 'side' ? (contentWidth ?? '100%') : undefined,
      position: chordDiagramPlacement === 'side' ? 'relative' : undefined,
    },
    lyricsColumn: {
      flex: chordDiagramPlacement === 'side' ? 1 : undefined,
      flexGrow: chordDiagramPlacement === 'side' ? 1 : undefined,
      width: chordDiagramPlacement === 'side' ? undefined : '100%',
      minWidth: 0,
      marginRight: chordDiagramPlacement === 'side' ? 110 : undefined,
    },
  });

  const lyrics = song.lyrics || '';
  const renderedInline = chordDisplayMode === 'inline'
    ? renderInlineChords(lyrics, chords)
    : null;
  const renderedAbove = chordDisplayMode === 'above'
    ? renderAboveChords(lyrics, chords)
    : null;

  const hasDiagrams = chordDiagramPlacement !== 'none' && chordDiagrams.length > 0;

  const renderLyricsContent = () => {
    if (chordDisplayMode === 'inline' && Array.isArray(renderedInline)) {
      return renderedInline.map((line, i) => {
        const headingMatch = line.match(/\{heading:([^}]+)\}/);
        if (headingMatch) {
          return (
            <Text key={i} style={styles.heading}>
              {headingMatch[1].trim()}
            </Text>
          );
        }
        const instructionMatch = line.match(/\{instruction:([^}]+)\}/);
        if (instructionMatch) {
          return (
            <Text key={i} style={styles.instruction}>
              {instructionMatch[1].trim()}
            </Text>
          );
        }
        const parts = line.split(/\[([^\]]+)\]/);
        return (
          <Text key={i} style={styles.line}>
            {parts.map((part, j) => {
              if (j % 2 === 1) {
                const { chordName, chordPosition } = parseChordMarker(part);
                return (
                  <Text key={j} style={styles.chordInline}>
                    {formatChordNameForDisplay(chordName)}
                    {chordPosition > 1 ? chordPosition : ''}
                  </Text>
                );
              }
              return part;
            })}
          </Text>
        );
      });
    }

    if (chordDisplayMode === 'above' && Array.isArray(renderedAbove)) {
      return renderedAbove.map((lineData, i) => {
        if (lineData.type === 'heading') {
          return (
            <Text key={i} style={styles.heading}>
              {lineData.text}
            </Text>
          );
        }
        if (lineData.type === 'instruction') {
          return (
            <Text key={i} style={styles.instruction}>
              {lineData.text}
            </Text>
          );
        }
        const { chordSegments, lyricLine } = lineData;
        const chordLineStr =
          chordSegments && chordSegments.length > 0
            ? chordSegments.map((s) => s.content).join('')
            : '';
        const lyricDisplay = lyricLine === '' ? '\u00A0' : lyricLine;
        return (
          <Text key={i} style={styles.lineBlock}>
            {chordLineStr ? (
              <>
                <Text style={[styles.lineAboveChord, styles.chordAbove]}>{chordLineStr}</Text>
                {'\n'}
              </>
            ) : null}
            <Text style={styles.lineLyric}>{lyricDisplay}</Text>
          </Text>
        );
      });
    }

    return null;
  };

  const renderDiagramsTop = () => {
    if (!hasDiagrams || chordDiagramPlacement !== 'top') return null;
    const minDiagramWidth = 50;
    const diagramCount = chordDiagrams.length;
    const totalWidth = diagramCount * (74 * diagramScale);
    const oneRow = totalWidth <= 400;
    return (
      <View style={styles.diagramsRow}>
        {chordDiagrams.map((d, idx) => (
          <ChordDiagramPDF
            key={`${d.name}-${d.position}-${idx}`}
            frets={d.frets}
            chordName={d.name}
            baseFret={d.baseFret}
            position={d.position}
            instrument={d.instrument || 'ukulele'}
            tuning={d.tuning || 'ukulele_standard'}
            scale={diagramScale}
          />
        ))}
      </View>
    );
  };

  const renderDiagramsSide = () => {
    if (!hasDiagrams || chordDiagramPlacement !== 'side') return null;
    return (
      <View style={styles.diagramsSide}>
        {chordDiagrams.map((d, idx) => (
          <View key={`${d.name}-${d.position}-${idx}`} style={{ marginBottom: 4 }}>
            <ChordDiagramPDF
              frets={d.frets}
              chordName={d.name}
              baseFret={d.baseFret}
              position={d.position}
              instrument={d.instrument || 'ukulele'}
              tuning={d.tuning || 'ukulele_standard'}
              scale={diagramScale * 0.9}
            />
          </View>
        ))}
      </View>
    );
  };

  return (
    <Document>
      <Page size={config.size} style={styles.page} wrap={!fitToOnePage}>
        <View style={styles.mainContent}>
          <View style={styles.lyricsColumn}>
            <Text style={styles.title}>{song.title || 'Untitled'}</Text>
            {song.artist ? (
              <Text style={styles.artist}>{song.artist}</Text>
            ) : null}

            {chordDiagramPlacement === 'top' && renderDiagramsTop()}

            <View style={styles.lyricsBlock}>{renderLyricsContent()}</View>
          </View>
          {chordDiagramPlacement === 'side' && renderDiagramsSide()}
        </View>
      </Page>
    </Document>
  );
}
