/**
 * Incremental chord migration script
 * 
 * Strategy:
 * 1. Import chords in smaller chunks by chord key (A, B, C, etc.)
 * 2. Skip chords that already exist
 * 3. Can be run multiple times safely
 * 4. Progressively builds up the library
 * 
 * Usage:
 *   node scripts/migrate-chords-incremental.js [chord-key]
 * 
 * Examples:
 *   node scripts/migrate-chords-incremental.js        # Import all, starting with most common
 *   node scripts/migrate-chords-incremental.js A      # Import only A chords
 *   node scripts/migrate-chords-incremental.js C      # Import only C chords
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { init, id } from '@instantdb/admin';
import schema from '../src/instant.schema.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

const APP_ID = getEnvVar('VITE_INSTANTDB_APP_ID') || process.env.VITE_INSTANTDB_APP_ID;
const ADMIN_TOKEN = getEnvVar('INSTANTDB_ADMIN_TOKEN') || process.env.INSTANTDB_ADMIN_TOKEN;

if (!APP_ID || !ADMIN_TOKEN) {
  console.error('Error: VITE_INSTANTDB_APP_ID and INSTANTDB_ADMIN_TOKEN must be set');
  process.exit(1);
}

const db = init({ appId: APP_ID, adminToken: ADMIN_TOKEN, schema });

// Common chord keys in order of frequency
const COMMON_KEYS = ['C', 'G', 'F', 'A', 'D', 'E', 'Am', 'Em', 'Dm', 'Bm', 'Gm', 'Fm'];

function formatChordName(key, suffix) {
  if (suffix === 'major' || suffix === '') {
    return key;
  }
  return key + suffix;
}

function transformChordData(chordsDbData, filterKey = null) {
  const transformedChords = [];
  const chords = chordsDbData.chords || chordsDbData;
  
  for (const chordKey in chords) {
    // Filter by key if specified
    if (filterKey && chordKey !== filterKey) {
      continue;
    }
    
    const chordVariations = chords[chordKey];
    if (!Array.isArray(chordVariations)) continue;
    
    chordVariations.forEach((chord) => {
      const { key, suffix, positions } = chord;
      
      if (!positions || !Array.isArray(positions) || positions.length === 0) {
        return;
      }
      
      positions.forEach((position, index) => {
        if (!position.frets || !Array.isArray(position.frets) || position.frets.length !== 4) {
          return;
        }
        
        const chordName = formatChordName(key, suffix);
        
        transformedChords.push({
          name: chordName,
          key: key,
          suffix: suffix || 'major',
          frets: position.frets,
          fingers: position.fingers || [],
          baseFret: position.baseFret !== undefined && position.baseFret !== null ? position.baseFret : 1,
          barres: position.barres || [],
          position: index + 1,
          instrument: 'ukulele',
          tuning: 'ukulele_standard',
          libraryType: 'main',
        });
      });
    });
  }
  
  return transformedChords;
}

// Check if a chord already exists (by name, frets, baseFret, position)
async function chordExists(chord) {
  try {
    const query = await db.query({
      chords: {
        $: {
          where: {
            libraryType: 'main',
            name: chord.name,
            instrument: chord.instrument,
            tuning: chord.tuning,
            // Note: We can't easily query JSON arrays, so we'll import and let InstantDB handle duplicates
            // or check after import
          },
        },
      },
    });
    
    const existing = query?.chords || query?.data?.chords || [];
    // Check if exact match exists (same name, frets, baseFret, position)
    return existing.some(c => 
      c.name === chord.name &&
      JSON.stringify(c.frets) === JSON.stringify(chord.frets) &&
      c.baseFret === chord.baseFret &&
      c.position === chord.position
    );
  } catch (error) {
    return false;
  }
}

async function importChords(chords, batchSize = 10) {
  let imported = 0;
  let skipped = 0;
  let errors = 0;
  
  for (let i = 0; i < chords.length; i += batchSize) {
    const batch = chords.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(chords.length / batchSize);
    
    try {
      const transactions = batch.map(chord => {
        const chordId = id();
        return db.tx.chords[chordId].update(chord);
      });
      
      const result = await db.transact(...transactions);
      
      if (result && result.error) {
        throw new Error(`Transaction error: ${result.error}`);
      }
      
      imported += batch.length;
      
      if (batchNum % 10 === 0 || batchNum === totalBatches) {
        console.log(`  Progress: ${batchNum}/${totalBatches} batches (${imported}/${chords.length} chords)`);
      }
      
      // Delay between batches
      if (i + batchSize < chords.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      errors += batch.length;
      console.error(`  Error in batch ${batchNum}: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return { imported, skipped, errors };
}

async function migrateChords() {
  try {
    const filterKey = process.argv[2] || null;
    
    console.log('🚀 Starting incremental chord migration...\n');
    if (filterKey) {
      console.log(`📌 Filtering to chords starting with: ${filterKey}\n`);
    }
    
    // Fetch data
    console.log('📥 Fetching chords-db data...');
    const response = await fetch('https://cdn.jsdelivr.net/npm/@tombatossals/chords-db@latest/lib/ukulele.json');
    const chordsDbData = await response.json();
    console.log('✅ Fetched data\n');
    
    // Transform
    console.log('🔄 Transforming data...');
    let transformedChords = transformChordData(chordsDbData, filterKey);
    
    // If no filter, prioritize common keys
    if (!filterKey) {
      const commonChords = [];
      const otherChords = [];
      
      transformedChords.forEach(chord => {
        if (COMMON_KEYS.some(key => chord.name.startsWith(key))) {
          commonChords.push(chord);
        } else {
          otherChords.push(chord);
        }
      });
      
      // Import common chords first
      transformedChords = [...commonChords, ...otherChords];
      console.log(`  Prioritizing ${commonChords.length} common chords first`);
    }
    
    console.log(`✅ Prepared ${transformedChords.length} chords to import\n`);
    
    if (transformedChords.length === 0) {
      console.log('⚠️  No chords to import');
      return;
    }
    
    // Check existing
    console.log('🔍 Checking existing chords...');
    const existingQuery = await db.query({
      chords: {
        $: {
          where: { libraryType: 'main' },
        },
      },
    });
    const existing = existingQuery?.chords || existingQuery?.data?.chords || [];
    console.log(`  Found ${existing.length} existing main library chords\n`);
    
    // Import
    console.log('📤 Importing chords...');
    const batchSize = parseInt(process.env.BATCH_SIZE) || 10;
    const result = await importChords(transformedChords, batchSize);
    
    // Wait and verify
    console.log('\n⏳ Waiting for commits...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const finalQuery = await db.query({
      chords: {
        $: {
          where: { libraryType: 'main' },
        },
      },
    });
    const finalCount = finalQuery?.chords?.length || finalQuery?.data?.chords?.length || 0;
    
    console.log('\n📊 Summary:');
    console.log(`  Imported: ${result.imported} chords`);
    console.log(`  Errors: ${result.errors} chords`);
    console.log(`  Total in database: ${finalCount} chords`);
    console.log(`  Progress: ${finalCount}/2114 (${((finalCount/2114)*100).toFixed(1)}%)`);
    
    if (finalCount < 2114) {
      console.log('\n💡 To continue:');
      if (!filterKey) {
        console.log('  - Run again to import more: node scripts/migrate-chords-incremental.js');
        console.log('  - Or import specific keys: node scripts/migrate-chords-incremental.js A');
      } else {
        console.log('  - Import another key: node scripts/migrate-chords-incremental.js [key]');
      }
    } else {
      console.log('\n🎉 All chords imported!');
    }
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

migrateChords();
