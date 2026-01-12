/**
 * Migration script to import chords-db library data into InstantDB
 * 
 * This script:
 * 1. Fetches chords-db data from CDN (with retry logic)
 * 2. Transforms data to match new schema
 * 3. Validates data (frets array length = 4)
 * 4. Clears existing main library chords
 * 5. Imports new chord data in batches
 * 
 * Usage: 
 *   node scripts/migrate-chords-db.js
 * 
 * Requirements:
 *   - VITE_INSTANTDB_APP_ID must be set in .env file
 *   - INSTANTDB_ADMIN_TOKEN must be set in .env file
 * 
 * To get your admin token:
 *   1. Go to https://instantdb.com/dashboard
 *   2. Navigate to your app settings
 *   3. Find the Admin Token section
 *   4. Copy the token and add it to your .env file
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
  console.error('\nTo get your admin token:');
  console.error('1. Go to your InstantDB dashboard: https://instantdb.com/dashboard');
  console.error('2. Navigate to your app settings');
  console.error('3. Find the Admin Token section');
  console.error('4. Copy the token and add it to your .env file as: INSTANTDB_ADMIN_TOKEN=your_token_here');
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
      const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 1s, 2s, 4s
      console.log(`  Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Format chord name from key and suffix
function formatChordName(key, suffix) {
  if (suffix === 'major' || suffix === '') {
    return key; // Just use key for major chords (e.g., "C" not "Cmajor")
  }
  return key + suffix; // Combine for others (e.g., "Cmaj7", "Bm7b5")
}

// Transform chords-db data to InstantDB format
function transformChordData(chordsDbData) {
  const transformedChords = [];
  let skippedCount = 0;
  
  // The chords-db structure has a 'chords' key containing the actual chord data
  // Each key (like "A", "B") maps to an array of chord objects
  const chords = chordsDbData.chords || chordsDbData;
  
  // Iterate over each chord key (e.g., "A", "B", "C")
  for (const chordKey in chords) {
    const chordVariations = chords[chordKey];
    
    // Each key maps to an array of chord variations (different suffixes)
    if (!Array.isArray(chordVariations)) {
      continue;
    }
    
    // Process each chord variation (e.g., A major, A minor, A7, etc.)
    chordVariations.forEach((chord) => {
      const { key, suffix, positions } = chord;
      
      if (!positions || !Array.isArray(positions) || positions.length === 0) {
        return;
      }
      
      // Process each position as a separate chord entry
      positions.forEach((position, index) => {
        // Validate frets array length = 4 (for ukulele)
        if (!position.frets || !Array.isArray(position.frets) || position.frets.length !== 4) {
          skippedCount++;
          console.warn(`  Skipping invalid chord: ${key} ${suffix} (position ${index + 1}) - frets array length is not 4`);
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
          position: index + 1, // Sequential position number (1, 2, 3...)
          instrument: 'ukulele',
          tuning: 'ukulele_standard',
          libraryType: 'main',
          // createdBy is not set for main library chords
        });
      });
    });
  }
  
  if (skippedCount > 0) {
    console.log(`\n⚠️  Skipped ${skippedCount} invalid chord position(s)`);
  }
  
  return transformedChords;
}

async function migrateChords() {
  try {
    console.log('🚀 Starting chords-db migration...\n');
    
    // Step 1: Fetch chords-db data
    console.log('📥 Fetching chords-db data from CDN...');
    const chordsDbUrl = 'https://cdn.jsdelivr.net/npm/@tombatossals/chords-db@latest/lib/ukulele.json';
    let chordsDbData;
    try {
      chordsDbData = await fetchWithRetry(chordsDbUrl);
      console.log('✅ Successfully fetched chords-db data\n');
    } catch (error) {
      console.error('❌ Failed to fetch chords-db data:', error.message);
      console.error('\nTroubleshooting:');
      console.error('1. Check your internet connection');
      console.error('2. Verify the CDN URL is accessible');
      console.error('3. Try running the script again (it will retry automatically)');
      process.exit(1);
    }
    
    // Step 2: Transform data
    console.log('🔄 Transforming data to InstantDB format...');
    const transformedChords = transformChordData(chordsDbData);
    console.log(`✅ Transformed ${transformedChords.length} chord position(s)\n`);
    
    if (transformedChords.length === 0) {
      console.log('⚠️  No chords to import. Exiting.');
      return;
    }
    
    // Step 3: Clear existing main library chords
    console.log('🗑️  Clearing existing main library chords...');
    try {
      const existingChords = await db.query({
        chords: {
          $: {
            where: { libraryType: 'main' },
          },
        },
      });
      
      // Admin SDK returns data directly, not under .data
      const chordsToDelete = existingChords?.chords || existingChords?.data?.chords || [];
      
      if (chordsToDelete.length > 0) {
        console.log(`  Found ${chordsToDelete.length} existing main library chord(s) to delete`);
        
        // Delete in batches
        const DELETE_BATCH_SIZE = 50;
        const deleteTransactions = chordsToDelete.map(chord => 
          db.tx.chords[chord.id].delete()
        );
        
        for (let i = 0; i < deleteTransactions.length; i += DELETE_BATCH_SIZE) {
          const batch = deleteTransactions.slice(i, i + DELETE_BATCH_SIZE);
          await db.transact(...batch);
          console.log(`  Deleted batch ${Math.floor(i / DELETE_BATCH_SIZE) + 1} of ${Math.ceil(deleteTransactions.length / DELETE_BATCH_SIZE)}`);
        }
        
        console.log('✅ Cleared existing main library chords\n');
      } else {
        console.log('  No existing main library chords to clear\n');
      }
    } catch (error) {
      console.error('⚠️  Warning: Could not clear existing chords:', error.message);
      console.error('  Continuing with import anyway...\n');
    }
    
    // Step 4: Import new chords
    console.log('📤 Importing new chord data...');
    // Use smaller batch size to avoid transaction limits
    // Can be reduced further if needed (try 25 or 10)
    const BATCH_SIZE = parseInt(process.env.BATCH_SIZE) || 50;
    let importedCount = 0;
    let errorCount = 0;
    const failedBatches = [];
    
    for (let i = 0; i < transformedChords.length; i += BATCH_SIZE) {
      const batch = transformedChords.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(transformedChords.length / BATCH_SIZE);
      
      try {
        // Create transactions for this batch
        const transactions = batch.map(chord => {
          const chordId = id();
          return db.tx.chords[chordId].update(chord);
        });
        
        const result = await db.transact(...transactions);
        
        // Log transaction result for debugging (first batch only)
        if (batchNumber === 1) {
          console.log(`  🔍 Transaction result for batch 1:`, JSON.stringify(result, null, 2));
          // Test query immediately after first batch
          try {
            const testQuery = await db.query({
              chords: {
                $: {
                  where: { libraryType: 'main' },
                },
              },
            });
            // Admin SDK returns data directly, not under .data
            const chords = testQuery?.chords || testQuery?.data?.chords || [];
            const testCount = chords.length;
            console.log(`  🔍 Test query after batch 1: Found ${testCount} chords`);
            if (testCount > 0 && chords.length > 0) {
              const sample = chords[0];
              console.log(`  📋 Sample chord:`, {
                id: sample.id,
                name: sample.name,
                libraryType: sample.libraryType,
              });
            }
          } catch (testError) {
            console.error(`  ⚠️  Test query failed:`, testError.message);
          }
        }
        
        // Verify the transaction succeeded - check for errors more thoroughly
        if (result && result.error) {
          const errorMsg = Array.isArray(result.error) 
            ? result.error.join(', ') 
            : String(result.error);
          throw new Error(`Transaction error: ${errorMsg}`);
        }
        
        // Additional check: verify result structure
        if (result === null || result === undefined) {
          console.warn(`  ⚠️  Batch ${batchNumber} returned null/undefined result - may have failed silently`);
        }
        
        importedCount += batch.length;
        
        // Log progress every 10 batches or on last batch
        if (batchNumber % 10 === 0 || batchNumber === totalBatches) {
          console.log(`  ✅ Imported batch ${batchNumber}/${totalBatches} (${batch.length} chords) - Total: ${importedCount}/${transformedChords.length}`);
        }
        
        // Add a delay between batches to avoid overwhelming the database
        if (batchNumber < totalBatches) {
          await new Promise(resolve => setTimeout(resolve, 300)); // Increased delay to 300ms
        }
      } catch (error) {
        errorCount += batch.length;
        failedBatches.push({ batchNumber, error: error.message });
        console.error(`  ❌ Error importing batch ${batchNumber}/${totalBatches}:`, error.message);
        if (error.stack) {
          console.error('  Stack:', error.stack);
        }
        // Continue with next batch
        // Add longer delay after error
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    // Step 5: Verify actual count in database
    // Wait a moment for transactions to fully commit
    console.log('\n⏳ Waiting for transactions to commit...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('🔍 Verifying imported chords in database...');
    let actualCount = 0;
    try {
      const verificationQuery = await db.query({
        chords: {
          $: {
            where: { libraryType: 'main' },
          },
        },
      });
      // Admin SDK returns data directly, not under .data
      actualCount = verificationQuery?.chords?.length || verificationQuery?.data?.chords?.length || 0;
      console.log(`  ✅ Found ${actualCount} main library chord(s) in database`);
      
      // If still 0, try querying without filter to see total chords
      if (actualCount === 0) {
        const allChordsQuery = await db.query({
          chords: {
            $: {},
          },
        });
        // Admin SDK returns data directly
        const totalChords = allChordsQuery?.chords?.length || allChordsQuery?.data?.chords?.length || 0;
        console.log(`  ℹ️  Total chords in database (all types): ${totalChords}`);
        
        // Check a few sample chords to see what's there
        const chords = allChordsQuery?.chords || allChordsQuery?.data?.chords || [];
        if (totalChords > 0 && chords.length > 0) {
          const sample = chords.slice(0, 3);
          console.log(`  📋 Sample chords:`, sample.map(c => ({
            id: c.id,
            name: c.name,
            libraryType: c.libraryType,
            instrument: c.instrument,
            tuning: c.tuning
          })));
        }
      }
    } catch (error) {
      console.error('  ⚠️  Could not verify chord count:', error.message);
      if (error.stack) {
        console.error('  Stack:', error.stack);
      }
    }
    
    console.log('\n📊 Migration Summary:');
    console.log(`  📥 Attempted to import: ${transformedChords.length} chord position(s)`);
    console.log(`  ✅ Reported successful: ${importedCount} chord position(s)`);
    console.log(`  🔍 Actual count in database: ${actualCount} chord position(s)`);
    if (errorCount > 0) {
      console.log(`  ❌ Failed batches: ${errorCount} chord position(s)`);
      if (failedBatches.length > 0 && failedBatches.length <= 10) {
        console.log(`  Failed batch numbers: ${failedBatches.map(b => b.batchNumber).join(', ')}`);
      }
    }
    console.log(`  📈 Expected: ${transformedChords.length} chord positions`);
    
    if (actualCount < transformedChords.length) {
      const missing = transformedChords.length - actualCount;
      console.log(`\n⚠️  Warning: Only ${actualCount} of ${transformedChords.length} chords are in the database (${missing} missing)`);
      console.log('\n💡 Suggestions:');
      console.log('  1. Run the migration script again (it\'s safe - clears old chords first)');
      console.log('  2. Try reducing batch size: BATCH_SIZE=25 node scripts/migrate-chords-db.js');
      console.log('  3. Check InstantDB dashboard for rate limits or errors');
      console.log('  4. Verify admin token has proper permissions');
    }
    
    if (importedCount > 0) {
      console.log('\n✅ Migration script completed!');
      if (actualCount === transformedChords.length) {
        console.log('🎉 All chords successfully imported!');
      }
    } else {
      console.log('\n⚠️  Migration completed with no chords imported. Please check the errors above.');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message || error);
    console.error('\nTroubleshooting:');
    console.error('1. Make sure VITE_INSTANTDB_APP_ID is set correctly in .env');
    console.error('2. Verify INSTANTDB_ADMIN_TOKEN is valid');
    console.error('3. Check that you have proper permissions to write to the database');
    console.error('4. Verify the schema has been updated with the new chord fields');
    process.exit(1);
  }
}

// Run the migration
migrateChords();
