/**
 * Migration script to backfill chordId for existing songs
 * 
 * This script:
 * 1. Queries all songs with chords
 * 2. For each chord without chordId, looks up the chord by name+position+instrument+tuning
 * 3. If found, adds chordId to the chord object
 * 4. Updates songs in batches
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { init } from '@instantdb/admin';
import schema from '../src/instant.schema.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env file
function getEnvVar(name) {
  try {
    const envPath = join(__dirname, '..', '.env');
    const envContent = readFileSync(envPath, 'utf-8');
    const match = envContent.match(new RegExp(`${name}\\s*=\\s*(.+)`));
    return match ? match[1].trim() : null;
  } catch (error) {
    return null;
  }
}

const APP_ID = getEnvVar('VITE_INSTANTDB_APP_ID') || process.env.VITE_INSTANTDB_APP_ID || process.env.INSTANTDB_APP_ID;
const ADMIN_TOKEN = getEnvVar('INSTANTDB_ADMIN_TOKEN') || process.env.INSTANTDB_ADMIN_TOKEN;

if (!APP_ID) {
  console.error('Error: VITE_INSTANTDB_APP_ID must be set in .env file or environment');
  process.exit(1);
}

if (!ADMIN_TOKEN) {
  console.error('Error: INSTANTDB_ADMIN_TOKEN must be set in .env file or environment');
  process.exit(1);
}

// Initialize database with admin token
const db = init({ appId: APP_ID, adminToken: ADMIN_TOKEN, schema });

// Default instrument and tuning
const DEFAULT_INSTRUMENT = 'ukulele';
const DEFAULT_TUNING = 'ukulele_standard';

/**
 * Find a chord by name, position, instrument, and tuning
 */
function findChordByIdentifiers(chords, chordName, position, instrument, tuning) {
  // Try exact match first
  let chord = chords.find(c => 
    c.name === chordName &&
    c.instrument === instrument &&
    c.tuning === tuning &&
    c.position === position
  );
  
  // If not found with specific position, try position 1
  if (!chord && position !== 1) {
    chord = chords.find(c => 
      c.name === chordName &&
      c.instrument === instrument &&
      c.tuning === tuning &&
      c.position === 1
    );
  }
  
  // Case-insensitive fallback
  if (!chord) {
    chord = chords.find(c => 
      c.name.toLowerCase() === chordName.toLowerCase() &&
      c.instrument === instrument &&
      c.tuning === tuning
    );
  }
  
  return chord;
}

async function migrateChordIds() {
  console.log('Starting chordId migration...\n');
  
  try {
    // Fetch all chords from database
    console.log('Fetching all chords from database...');
    const chordsResult = await db.query({
      chords: {
        $: {
          where: {
            instrument: DEFAULT_INSTRUMENT,
            tuning: { $in: [DEFAULT_TUNING, 'standard'] }, // Support both tuning values
          },
        },
      },
    });
    
    const allChords = chordsResult.data?.chords || [];
    console.log(`Found ${allChords.length} chords in database\n`);
    
    if (allChords.length === 0) {
      console.log('No chords found. Exiting.');
      return;
    }
    
    // Fetch all songs
    console.log('Fetching all songs...');
    const songsResult = await db.query({
      songs: {},
    });
    
    const songs = songsResult.data?.songs || [];
    console.log(`Found ${songs.length} songs\n`);
    
    if (songs.length === 0) {
      console.log('No songs found. Exiting.');
      return;
    }
    
    // Process each song
    let songsUpdated = 0;
    let chordsUpdated = 0;
    let songsSkipped = 0;
    const batchSize = 20;
    const updates = [];
    
    for (const song of songs) {
      if (!song.chords) {
        songsSkipped++;
        continue;
      }
      
      let chords;
      try {
        chords = JSON.parse(song.chords);
      } catch (e) {
        console.error(`Error parsing chords for song ${song.id}:`, e.message);
        songsSkipped++;
        continue;
      }
      
      if (!Array.isArray(chords) || chords.length === 0) {
        songsSkipped++;
        continue;
      }
      
      let songNeedsUpdate = false;
      const updatedChords = chords.map(chord => {
        // Skip if chord already has chordId
        if (chord.chordId) {
          return chord;
        }
        
        if (!chord.chord) {
          return chord;
        }
        
        const chordName = chord.chord.trim();
        if (!chordName) {
          return chord;
        }
        
        const position = chord.chordPosition || 1;
        
        // Look up chord in database
        const foundChord = findChordByIdentifiers(
          allChords,
          chordName,
          position,
          DEFAULT_INSTRUMENT,
          DEFAULT_TUNING
        );
        
        if (foundChord && foundChord.id) {
          songNeedsUpdate = true;
          chordsUpdated++;
          return {
            ...chord,
            chordId: foundChord.id,
          };
        }
        
        return chord;
      });
      
      if (songNeedsUpdate) {
        updates.push({
          id: song.id,
          chords: JSON.stringify(updatedChords),
        });
        songsUpdated++;
        
        // Process in batches
        if (updates.length >= batchSize) {
          console.log(`Updating batch of ${updates.length} songs...`);
          await db.transact(
            updates.map(update => 
              db.tx.songs[update.id].update({ chords: update.chords })
            )
          );
          console.log(`Updated ${updates.length} songs\n`);
          updates.length = 0;
        }
      } else {
        songsSkipped++;
      }
    }
    
    // Process remaining updates
    if (updates.length > 0) {
      console.log(`Updating final batch of ${updates.length} songs...`);
      await db.transact(
        updates.map(update => 
          db.tx.songs[update.id].update({ chords: update.chords })
        )
      );
      console.log(`Updated ${updates.length} songs\n`);
    }
    
    console.log('\nMigration complete!');
    console.log(`- Songs updated: ${songsUpdated}`);
    console.log(`- Chords updated: ${chordsUpdated}`);
    console.log(`- Songs skipped: ${songsSkipped}`);
    
  } catch (error) {
    console.error('Error during migration:', error);
    throw error;
  }
}

// Run migration
migrateChordIds()
  .then(() => {
    console.log('\nMigration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nMigration failed:', error);
    process.exit(1);
  });
