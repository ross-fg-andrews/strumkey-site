/**
 * Bulk chord migration script
 * 
 * Strategy:
 * 1. Download chords-db data
 * 2. Transform to InstantDB format
 * 3. Save to JSON file for dashboard import OR
 * 4. Attempt single large transaction (if supported)
 * 
 * Usage:
 *   node scripts/migrate-chords-bulk.js [--file-only]
 * 
 * Options:
 *   --file-only: Only create JSON file, don't attempt import
 */

import { readFileSync, writeFileSync } from 'fs';
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
const FILE_ONLY = process.argv.includes('--file-only');

function formatChordName(key, suffix) {
  if (suffix === 'major' || suffix === '') {
    return key;
  }
  return key + suffix;
}

function transformChordData(chordsDbData) {
  const transformedChords = [];
  const chords = chordsDbData.chords || chordsDbData;
  
  for (const chordKey in chords) {
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

async function migrateChords() {
  try {
    console.log('🚀 Starting bulk chord migration...\n');
    
    // Step 1: Fetch data
    console.log('📥 Fetching chords-db data from CDN...');
    const response = await fetch('https://cdn.jsdelivr.net/npm/@tombatossals/chords-db@latest/lib/ukulele.json');
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
    }
    const chordsDbData = await response.json();
    console.log('✅ Successfully fetched data\n');
    
    // Step 2: Transform
    console.log('🔄 Transforming data to InstantDB format...');
    const transformedChords = transformChordData(chordsDbData);
    console.log(`✅ Transformed ${transformedChords.length} chord position(s)\n`);
    
    if (transformedChords.length === 0) {
      console.log('⚠️  No chords to import');
      return;
    }
    
    // Step 3: Save to JSON file
    const outputFile = join(__dirname, '..', 'chords-import.json');
    const importData = {
      chords: transformedChords.map(chord => ({
        id: id(), // Generate IDs for import
        ...chord,
      })),
    };
    
    console.log(`💾 Saving to ${outputFile}...`);
    writeFileSync(outputFile, JSON.stringify(importData, null, 2), 'utf-8');
    console.log(`✅ Saved ${transformedChords.length} chords to ${outputFile}\n`);
    
    if (FILE_ONLY) {
      console.log('📋 File created. Next steps:');
      console.log('  1. Go to your InstantDB dashboard');
      console.log('  2. Navigate to the Data/Import section');
      console.log('  3. Upload the file: chords-import.json');
      console.log('  4. Map the fields to your schema');
      return;
    }
    
    // Step 4: Attempt bulk import via admin SDK
    if (!APP_ID || !ADMIN_TOKEN) {
      console.log('⚠️  APP_ID or ADMIN_TOKEN not set. File saved, but cannot import via script.');
      console.log('   Use --file-only flag or set credentials to import via dashboard.');
      return;
    }
    
    console.log('📤 Attempting bulk import via admin SDK...');
    const db = init({ appId: APP_ID, adminToken: ADMIN_TOKEN, schema });
    
    // Clear existing main library chords first
    console.log('🗑️  Clearing existing main library chords...');
    try {
      const existingQuery = await db.query({
        chords: {
          $: {
            where: { libraryType: 'main' },
          },
        },
      });
      const existing = existingQuery?.chords || existingQuery?.data?.chords || [];
      
      if (existing.length > 0) {
        console.log(`  Found ${existing.length} existing chords to delete...`);
        const DELETE_BATCH = 100;
        for (let i = 0; i < existing.length; i += DELETE_BATCH) {
          const batch = existing.slice(i, i + DELETE_BATCH);
          const deleteTx = batch.map(chord => db.tx.chords[chord.id].delete());
          await db.transact(...deleteTx);
          console.log(`  Deleted batch ${Math.floor(i / DELETE_BATCH) + 1} of ${Math.ceil(existing.length / DELETE_BATCH)}`);
        }
        console.log('✅ Cleared existing chords\n');
      } else {
        console.log('  No existing chords to clear\n');
      }
    } catch (error) {
      console.error('⚠️  Could not clear existing chords:', error.message);
      console.log('  Continuing with import...\n');
    }
    
    // Try importing in batches (smaller batches are more reliable)
    console.log('📤 Importing chords...');
    const MAX_BATCH = parseInt(process.env.BATCH_SIZE) || 100; // Smaller batches are more reliable
    
    // Create all transactions
    const transactions = importData.chords.map(chord => {
      return db.tx.chords[chord.id].update({
        name: chord.name,
        key: chord.key,
        suffix: chord.suffix,
        frets: chord.frets,
        fingers: chord.fingers,
        baseFret: chord.baseFret,
        barres: chord.barres,
        position: chord.position,
        instrument: chord.instrument,
        tuning: chord.tuning,
        libraryType: chord.libraryType,
      });
    });
    
    console.log(`  Created ${transactions.length} transactions`);
    console.log(`  Attempting import in batches of ${MAX_BATCH}...`);
    
    let imported = 0;
    let errors = 0;
    
    // Import in large batches
    for (let i = 0; i < transactions.length; i += MAX_BATCH) {
      const batch = transactions.slice(i, i + MAX_BATCH);
      const batchNum = Math.floor(i / MAX_BATCH) + 1;
      const totalBatches = Math.ceil(transactions.length / MAX_BATCH);
      
      try {
        console.log(`  Importing batch ${batchNum}/${totalBatches} (${batch.length} chords)...`);
        const result = await db.transact(...batch);
        
        if (result && result.error) {
          throw new Error(`Transaction error: ${result.error}`);
        }
        
        imported += batch.length;
        console.log(`  ✅ Batch ${batchNum} completed`);
        
        // Small delay between batches
        if (i + MAX_BATCH < transactions.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        errors += batch.length;
        console.error(`  ❌ Batch ${batchNum} failed: ${error.message}`);
        
        // If large batch fails, try smaller batches
        if (batch.length > 50) {
          console.log(`  Retrying with smaller batches (50)...`);
          const SMALL_BATCH = 50;
          for (let j = 0; j < batch.length; j += SMALL_BATCH) {
            const smallBatch = batch.slice(j, j + SMALL_BATCH);
            try {
              await db.transact(...smallBatch);
              imported += smallBatch.length;
              errors -= smallBatch.length;
              console.log(`    ✅ Small batch ${Math.floor(j / SMALL_BATCH) + 1} succeeded`);
            } catch (smallError) {
              console.error(`    ❌ Small batch ${Math.floor(j / SMALL_BATCH) + 1} failed: ${smallError.message}`);
            }
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }
      }
    }
    
    // Verify
    console.log('\n⏳ Waiting for commits...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('🔍 Verifying import...');
    const verifyQuery = await db.query({
      chords: {
        $: {
          where: { libraryType: 'main' },
        },
      },
    });
    const actualCount = verifyQuery?.chords?.length || verifyQuery?.data?.chords?.length || 0;
    
    console.log('\n📊 Summary:');
    console.log(`  Attempted: ${transactions.length} chords`);
    console.log(`  Reported success: ${imported} chords`);
    console.log(`  Errors: ${errors} chords`);
    console.log(`  Actual in database: ${actualCount} chords`);
    console.log(`  Progress: ${actualCount}/2114 (${((actualCount/2114)*100).toFixed(1)}%)`);
    
    if (actualCount < transformedChords.length) {
      console.log('\n💡 If import is incomplete:');
      console.log('  1. Check the JSON file: chords-import.json');
      console.log('  2. Try importing via InstantDB dashboard');
      console.log('  3. Or run the script again to continue');
    } else {
      console.log('\n🎉 All chords imported successfully!');
    }
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

migrateChords();
