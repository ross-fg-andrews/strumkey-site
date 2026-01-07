// Chord library data
// This is the central source of truth for all chord definitions
// Chords are matched by instrument, tuning, and variation

export const CHORD_SEED_DATA = [
  // Major Chords
  { name: 'C', frets: '0003', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'C', frets: '5433', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'barre' },
  { name: 'D', frets: '2220', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'E', frets: '4442', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'F', frets: '2010', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'G', frets: '0232', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'A', frets: '2100', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'B', frets: '4322', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  
  // Sharp Major Chords
  { name: 'C#', frets: '1114', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'D#', frets: '3331', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'F#', frets: '3121', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'G#', frets: '1343', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'A#', frets: '3211', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  
  // Flat Major Chords
  { name: 'Db', frets: '1114', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Eb', frets: '3331', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Gb', frets: '3121', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Ab', frets: '1343', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Bb', frets: '3211', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  
  // Minor Chords
  { name: 'Am', frets: '2000', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Bm', frets: '4222', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Cm', frets: '0333', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Dm', frets: '2210', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Em', frets: '0432', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Fm', frets: '1013', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Gm', frets: '0231', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  
  // Sharp Minor Chords
  { name: 'A#m', frets: '3111', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'C#m', frets: '1444', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'D#m', frets: '3321', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'F#m', frets: '2124', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'G#m', frets: '1342', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  
  // Flat Minor Chords
  { name: 'Bbm', frets: '3111', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Ebm', frets: '3321', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Abm', frets: '1342', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  
  // 7th Chords (Dominant)
  { name: 'C7', frets: '0001', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'D7', frets: '2020', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'E7', frets: '1202', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'F7', frets: '2310', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'G7', frets: '0212', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'A7', frets: '0100', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'B7', frets: '2322', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  
  // Major 7th Chords
  { name: 'Cmaj7', frets: '0002', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Dmaj7', frets: '2224', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Fmaj7', frets: '2410', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Gmaj7', frets: '0222', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Amaj7', frets: '2104', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  
  // Minor 7th Chords
  { name: 'Am7', frets: '0000', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Bm7', frets: '2222', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Dm7', frets: '2210', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Em7', frets: '0432', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Gm7', frets: '0211', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  
  // Suspended Chords
  { name: 'Csus4', frets: '0013', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Dsus4', frets: '2200', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Fsus4', frets: '3010', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Gsus4', frets: '0233', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Asus4', frets: '2200', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  
  // Diminished Chords
  { name: 'Cdim', frets: '0101', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Ddim', frets: '1212', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  
  // Augmented Chords
  { name: 'Caug', frets: '1003', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Faug', frets: '3012', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  
  // 6th Chords
  { name: 'C6', frets: '0000', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'D6', frets: '2222', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'E6', frets: '4444', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'F6', frets: '2013', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'G6', frets: '0202', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'A6', frets: '2102', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'B6', frets: '4324', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  
  // Minor 6th Chords
  { name: 'Am6', frets: '2002', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Dm6', frets: '2212', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Em6', frets: '0434', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  
  // 9th Chords (Dominant)
  { name: 'C9', frets: '0201', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'D9', frets: '2022', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'E9', frets: '1204', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'F9', frets: '2312', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'G9', frets: '0214', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'A9', frets: '0102', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'B9', frets: '2324', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  
  // Minor 9th Chords
  { name: 'Am9', frets: '2002', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Dm9', frets: '2212', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Em9', frets: '0434', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Gm9', frets: '0213', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  
  // 11th Chords
  { name: 'C11', frets: '0013', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'D11', frets: '2020', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'F11', frets: '2010', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'G11', frets: '0212', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  
  // 13th Chords
  { name: 'C13', frets: '0001', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'D13', frets: '2020', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'G13', frets: '0212', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  
  // add9 Chords
  { name: 'Cadd9', frets: '0203', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Dadd9', frets: '2222', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Eadd9', frets: '4444', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Fadd9', frets: '2013', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Gadd9', frets: '0232', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Aadd9', frets: '2102', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  
  // sus2 Chords
  { name: 'Csus2', frets: '0233', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Dsus2', frets: '2200', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Esus2', frets: '4422', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Fsus2', frets: '2011', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Gsus2', frets: '0230', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  { name: 'Asus2', frets: '2200', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
  
  // Test chord requiring fret number (maxFret > 4)
  { name: 'Bm5', frets: '5775', instrument: 'ukulele', tuning: 'ukulele_standard', variation: 'standard' },
];

