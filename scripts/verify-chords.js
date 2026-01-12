/**
 * Simple script to verify chords in the database
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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

const APP_ID = process.env.VITE_INSTANTDB_APP_ID || getEnvVar('VITE_INSTANTDB_APP_ID');
const ADMIN_TOKEN = process.env.INSTANTDB_ADMIN_TOKEN || getEnvVar('INSTANTDB_ADMIN_TOKEN');

if (!APP_ID || !ADMIN_TOKEN) {
  console.error('Error: VITE_INSTANTDB_APP_ID and INSTANTDB_ADMIN_TOKEN must be set');
  process.exit(1);
}

const API_BASE = 'https://api.instantdb.com';

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

async function verifyChords() {
  try {
    console.log(`🔍 Verifying chords in database...`);
    console.log(`📋 App ID: ${APP_ID}`);
    console.log(`🔑 Admin Token: ${ADMIN_TOKEN.substring(0, 8)}...`);
    console.log('');
    
    // Query all chords
    console.log('📥 Querying all chords...');
    const allChordsQuery = await httpQuery({
      chords: {
        $: {},
      },
    });
    
    const allChords = allChordsQuery?.chords || allChordsQuery?.data?.chords || [];
    console.log(`✅ Found ${allChords.length} total chord(s)`);
    
    // Query main library chords
    console.log('\n📥 Querying main library chords...');
    const mainChordsQuery = await httpQuery({
      chords: {
        $: {
          where: { libraryType: 'main' },
        },
      },
    });
    
    const mainChords = mainChordsQuery?.chords || mainChordsQuery?.data?.chords || [];
    console.log(`✅ Found ${mainChords.length} main library chord(s)`);
    
    // Query personal library chords
    console.log('\n📥 Querying personal library chords...');
    const personalChordsQuery = await httpQuery({
      chords: {
        $: {
          where: { libraryType: 'personal' },
        },
      },
    });
    
    const personalChords = personalChordsQuery?.chords || personalChordsQuery?.data?.chords || [];
    console.log(`✅ Found ${personalChords.length} personal library chord(s)`);
    
    // Show first few chords as examples
    if (mainChords.length > 0) {
      console.log('\n📋 Sample main library chords (first 5):');
      mainChords.slice(0, 5).forEach((chord, i) => {
        console.log(`  ${i + 1}. ${chord.name} (${chord.instrument}, ${chord.tuning}) - ID: ${chord.id}`);
      });
    }
    
    console.log('\n📊 Summary:');
    console.log(`  Total chords: ${allChords.length}`);
    console.log(`  Main library: ${mainChords.length}`);
    console.log(`  Personal library: ${personalChords.length}`);
    console.log(`  Unknown/other: ${allChords.length - mainChords.length - personalChords.length}`);
    
  } catch (error) {
    console.error('\n❌ Verification failed:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

verifyChords();
