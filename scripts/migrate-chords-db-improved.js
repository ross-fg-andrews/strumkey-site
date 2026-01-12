/**
 * Improved migration script with batch verification and retry logic
 * 
 * This version:
 * 1. Verifies each batch actually persisted
 * 2. Retries failed batches up to 3 times
 * 3. Uses smaller default batch size (15)
 * 4. Tracks progress more accurately
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { init, id } from '@instantdb/admin';
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

// Retry function with exponential backoff
async function fetchWithRetry(url, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      if (attempt === maxRetries - 1) {
        throw error;
      }
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`  Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Format chord name from key and suffix
function formatChordName(key, suffix) {
  if (suffix === 'major' || suffix === '') {
    return key;
  }
  return key + suffix;
}

// Transform chords-db data to InstantDB format
function transformChordData(chordsDbData) {
  const transformedChords = [];
  let skippedCount = 0;
  
  const chords = chordsDbData.chords || chordsDbData;
  
  for (const chordKey in chords) {
    const chordVariations = chords[chordKey];
    
    if (!Array.isArray(chordVariations)) {
      continue;
    }
    
    chordVariations.forEach((chord) => {
      const { key, suffix, positions } = chord;
      
      if (!positions || !Array.isArray(positions) || positions.length === 0) {
        return;
      }
      
      positions.forEach((position, index) => {
        if (!position.frets || !Array.isArray(position.frets) || position.frets.length !== 4) {
          skippedCount++;
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
  
  if (skippedCount > 0) {
    console.log(`\n⚠️  Skipped ${skippedCount} invalid chord position(s)`);
  }
  
  return transformedChords;
}

// Verify a batch actually persisted
async function verifyBatch(chordIds, expectedCount) {
  try {
    await new Promise(resolve => setTimeout(resolve, 500)); // Wait for commit
    
    const query = await db.query({
      chords: {
        $: {
          where: {
            libraryType: 'main',
            id: { $in: chordIds },
          },
        },
      },
    });
    
    const chords = query?.chords || query?.data?.chords || [];
    return chords.length;
  } catch (error) {
    console.error(`  ⚠️  Verification query failed:`, error.message);
    return 0;
  }
}

async function migrateChords() {
  try {
    console.log('🚀 Starting improved chords-db migration...\n');
    
    // Step 1: Fetch chords-db data
    console.log('📥 Fetching chords-db data from CDN...');
    const chordsDbUrl = 'https://cdn.jsdelivr.net/npm/@tombatossals/chords-db@latest/lib/ukulele.json';
    const chordsDbData = await fetchWithRetry(chordsDbUrl);
    console.log('✅ Successfully fetched chords-db data\n');
    
    // Step 2: Transform data
    console.log('🔄 Transforming data to InstantDB format...');
    const transformedChords = transformChordData(chordsDbData);
    console.log(`✅ Transformed ${transformedChords.length} chord position(s)\n`);
    
    if (transformedChords.length === 0) {
      console.log('⚠️  No chords to import. Exiting.');
      return;
    }
    
    // Step 3: Check existing chords
    console.log('🔍 Checking existing main library chords...');
    const existingQuery = await db.query({
      chords: {
        $: {
          where: { libraryType: 'main' },
        },
      },
    });
    const existingChords = existingQuery?.chords || existingQuery?.data?.chords || [];
    console.log(`  Found ${existingChords.length} existing main library chord(s)`);
    
    if (existingChords.length > 0) {
      console.log('🗑️  Clearing existing main library chords...');
      const DELETE_BATCH_SIZE = 50;
      const deleteTransactions = existingChords.map(chord => 
        db.tx.chords[chord.id].delete()
      );
      
      for (let i = 0; i < deleteTransactions.length; i += DELETE_BATCH_SIZE) {
        const batch = deleteTransactions.slice(i, i + DELETE_BATCH_SIZE);
        await db.transact(...batch);
        console.log(`  Deleted batch ${Math.floor(i / DELETE_BATCH_SIZE) + 1} of ${Math.ceil(deleteTransactions.length / DELETE_BATCH_SIZE)}`);
      }
      console.log('✅ Cleared existing main library chords\n');
    } else {
      console.log('  No existing chords to clear\n');
    }
    
    // Step 4: Import new chords with verification
    console.log('📤 Importing new chord data...');
    const BATCH_SIZE = parseInt(process.env.BATCH_SIZE) || 15; // Smaller default
    const MAX_RETRIES = 3;
    let importedCount = 0;
    let verifiedCount = 0;
    let errorCount = 0;
    const failedBatches = [];
    const retryBatches = [];
    
    for (let i = 0; i < transformedChords.length; i += BATCH_SIZE) {
      const batch = transformedChords.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(transformedChords.length / BATCH_SIZE);
      
      let success = false;
      let retries = 0;
      const chordIds = batch.map(() => id());
      
      while (!success && retries < MAX_RETRIES) {
        try {
          const transactions = batch.map((chord, idx) => {
            return db.tx.chords[chordIds[idx]].update(chord);
          });
          
          const result = await db.transact(...transactions);
          
          if (result && result.error) {
            throw new Error(`Transaction error: ${result.error}`);
          }
          
          // Verify batch actually persisted
          const verified = await verifyBatch(chordIds, batch.length);
          
          if (verified === batch.length) {
            success = true;
            importedCount += batch.length;
            verifiedCount += verified;
            
            if (batchNumber % 20 === 0 || batchNumber === totalBatches) {
              console.log(`  ✅ Batch ${batchNumber}/${totalBatches} (${batch.length} chords) - Verified: ${verified}/${batch.length} - Total: ${importedCount}/${transformedChords.length}`);
            }
          } else {
            retries++;
            if (retries < MAX_RETRIES) {
              console.warn(`  ⚠️  Batch ${batchNumber} only persisted ${verified}/${batch.length} chords. Retrying... (${retries}/${MAX_RETRIES})`);
              await new Promise(resolve => setTimeout(resolve, 1000 * retries));
            } else {
              console.error(`  ❌ Batch ${batchNumber} failed after ${MAX_RETRIES} retries (${verified}/${batch.length} persisted)`);
              errorCount += (batch.length - verified);
              failedBatches.push({ batchNumber, persisted: verified, expected: batch.length });
            }
          }
        } catch (error) {
          retries++;
          if (retries < MAX_RETRIES) {
            console.warn(`  ⚠️  Batch ${batchNumber} error: ${error.message}. Retrying... (${retries}/${MAX_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, 1000 * retries));
          } else {
            console.error(`  ❌ Batch ${batchNumber} failed after ${MAX_RETRIES} retries: ${error.message}`);
            errorCount += batch.length;
            failedBatches.push({ batchNumber, error: error.message });
          }
        }
      }
      
      // Delay between batches
      if (batchNumber < totalBatches) {
        await new Promise(resolve => setTimeout(resolve, 400));
      }
    }
    
    // Step 5: Final verification
    console.log('\n⏳ Waiting for final transactions to commit...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('🔍 Final verification...');
    const finalQuery = await db.query({
      chords: {
        $: {
          where: { libraryType: 'main' },
        },
      },
    });
    const actualCount = finalQuery?.chords?.length || finalQuery?.data?.chords?.length || 0;
    
    console.log('\n📊 Migration Summary:');
    console.log(`  📥 Attempted to import: ${transformedChords.length} chord position(s)`);
    console.log(`  ✅ Reported successful: ${importedCount} chord position(s)`);
    console.log(`  ✓ Verified persisted: ${verifiedCount} chord position(s)`);
    console.log(`  🔍 Actual count in database: ${actualCount} chord position(s)`);
    if (errorCount > 0) {
      console.log(`  ❌ Failed: ${errorCount} chord position(s)`);
    }
    console.log(`  📈 Expected: ${transformedChords.length} chord positions`);
    
    if (failedBatches.length > 0 && failedBatches.length <= 20) {
      console.log(`\n  Failed batches: ${failedBatches.map(b => `#${b.batchNumber}`).join(', ')}`);
    }
    
    if (actualCount < transformedChords.length) {
      const missing = transformedChords.length - actualCount;
      const percent = ((actualCount / transformedChords.length) * 100).toFixed(1);
      console.log(`\n⚠️  Progress: ${actualCount}/${transformedChords.length} (${percent}%)`);
      console.log(`\n💡 To continue: Run the script again (it's safe - clears old chords first)`);
    } else {
      console.log('\n🎉 All chords successfully imported!');
    }
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message || error);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Run the migration
migrateChords();
