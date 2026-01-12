/**
 * Chord migration using InstantDB HTTP API
 * 
 * This uses the Admin HTTP API which supports bulk transactions
 * in a single request, potentially more efficient than the SDK approach.
 * 
 * Usage:
 *   node scripts/migrate-chords-http-api.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';

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

const API_BASE = 'https://api.instantdb.com';

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
          id: randomUUID(),
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

async function httpQuery(query) {
  const response = await fetch(`${API_BASE}/admin/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ADMIN_TOKEN}`,
      'App-Id': APP_ID,
    },
    body: JSON.stringify({ query }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HTTP ${response.status}: ${error}`);
  }
  
  return response.json();
}

async function httpTransact(steps) {
  const response = await fetch(`${API_BASE}/admin/transact`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ADMIN_TOKEN}`,
      'App-Id': APP_ID,
    },
    body: JSON.stringify({ steps }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HTTP ${response.status}: ${error}`);
  }
  
  return response.json();
}

async function migrateChords() {
  try {
    console.log('🚀 Starting chord migration via HTTP API...\n');
    
    // Step 1: Fetch data
    console.log('📥 Fetching chords-db data...');
    const response = await fetch('https://cdn.jsdelivr.net/npm/@tombatossals/chords-db@latest/lib/ukulele.json');
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }
    const chordsDbData = await response.json();
    console.log('✅ Fetched data\n');
    
    // Step 2: Transform
    console.log('🔄 Transforming data...');
    const transformedChords = transformChordData(chordsDbData);
    console.log(`✅ Transformed ${transformedChords.length} chord position(s)\n`);
    
    if (transformedChords.length === 0) {
      console.log('⚠️  No chords to import');
      return;
    }
    
    // Step 3: Clear existing
    console.log('🗑️  Clearing existing main library chords...');
    try {
      const existingQuery = await httpQuery({
        chords: {
          $: {
            where: { libraryType: 'main' },
          },
        },
      });
      
      const existing = existingQuery?.chords || existingQuery?.data?.chords || [];
      
      if (existing.length > 0) {
        console.log(`  Found ${existing.length} existing chords to delete...`);
        
        // Create delete steps
        const deleteSteps = existing.map(chord => [
          'delete',
          'chords',
          chord.id,
        ]);
        
        // Delete in batches of 500
        const DELETE_BATCH = 500;
        for (let i = 0; i < deleteSteps.length; i += DELETE_BATCH) {
          const batch = deleteSteps.slice(i, i + DELETE_BATCH);
          await httpTransact(batch);
          console.log(`  Deleted batch ${Math.floor(i / DELETE_BATCH) + 1} of ${Math.ceil(deleteSteps.length / DELETE_BATCH)}`);
        }
        console.log('✅ Cleared existing chords\n');
      } else {
        console.log('  No existing chords to clear\n');
      }
    } catch (error) {
      console.error('⚠️  Could not clear existing chords:', error.message);
      console.log('  Continuing with import...\n');
    }
    
    // Step 4: Import via HTTP API
    console.log('📤 Importing chords via HTTP API...');
    
    // Convert to HTTP API format: ["update", "chords", id, {...data}]
    const steps = transformedChords.map(chord => {
      const { id, ...data } = chord;
      return [
        'update',
        'chords',
        id,
        data,
      ];
    });
    
    console.log(`  Created ${steps.length} transaction steps`);
    console.log(`  Attempting bulk import in single request...`);
    
    try {
      // Try importing all at once
      const result = await httpTransact(steps);
      console.log('✅ Bulk import completed!');
      console.log('  Result:', JSON.stringify(result, null, 2));
    } catch (error) {
      console.error(`❌ Bulk import failed: ${error.message}`);
      console.log('\n💡 Trying smaller batches...');
      
      // Fallback to smaller batches
      const BATCH_SIZE = parseInt(process.env.BATCH_SIZE) || 500;
      let imported = 0;
      
      for (let i = 0; i < steps.length; i += BATCH_SIZE) {
        const batch = steps.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(steps.length / BATCH_SIZE);
        
        try {
          await httpTransact(batch);
          imported += batch.length;
          console.log(`  ✅ Batch ${batchNum}/${totalBatches} (${batch.length} chords) - Total: ${imported}/${steps.length}`);
          
          // Small delay between batches
          if (i + BATCH_SIZE < steps.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        } catch (batchError) {
          console.error(`  ❌ Batch ${batchNum} failed: ${batchError.message}`);
        }
      }
    }
    
    // Step 5: Verify
    console.log('\n⏳ Waiting for commits...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('🔍 Verifying import...');
    const verifyQuery = await httpQuery({
      chords: {
        $: {
          where: { libraryType: 'main' },
        },
      },
    });
    
    const actualCount = verifyQuery?.chords?.length || verifyQuery?.data?.chords?.length || 0;
    
    console.log('\n📊 Summary:');
    console.log(`  Attempted: ${transformedChords.length} chords`);
    console.log(`  Actual in database: ${actualCount} chords`);
    console.log(`  Progress: ${actualCount}/2114 (${((actualCount/2114)*100).toFixed(1)}%)`);
    
    if (actualCount === transformedChords.length) {
      console.log('\n🎉 All chords imported successfully!');
    } else if (actualCount > 0) {
      console.log(`\n⚠️  Partial import: ${actualCount}/${transformedChords.length} chords`);
      console.log('💡 Run the script again to import remaining chords');
    } else {
      console.log('\n⚠️  No chords were imported. Check errors above.');
    }
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

migrateChords();
