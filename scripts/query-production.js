/**
 * Simple script to query production database directly
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const APP_ID = process.env.VITE_INSTANTDB_APP_ID || 'f5937544-d918-4dc7-bb05-5f4a8cae65b3';
const ADMIN_TOKEN = process.env.INSTANTDB_ADMIN_TOKEN || 'bc5a1bb1-894d-467f-b200-e537ab92a8c3';

const API_BASE = 'https://api.instantdb.com';

async function queryDB() {
  try {
    console.log(`🔍 Querying production database...`);
    console.log(`📋 App ID: ${APP_ID}`);
    console.log(`🔑 Admin Token: ${ADMIN_TOKEN.substring(0, 8)}...\n`);
    
    // Query all chords
    const response = await fetch(`${API_BASE}/admin/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'App-Id': APP_ID,
      },
      body: JSON.stringify({
        query: {
          chords: {
            $: {},
          },
        },
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }
    
    const data = await response.json();
    console.log('📊 Full Response:');
    console.log(JSON.stringify(data, null, 2));
    
    const chords = data?.chords || data?.data?.chords || [];
    console.log(`\n✅ Found ${chords.length} total chord(s)`);
    
    if (chords.length > 0) {
      console.log('\n📋 All Chords:');
      chords.forEach((chord, i) => {
        console.log(`  ${i + 1}. ${chord.name || 'Unnamed'} (${chord.libraryType || 'unknown'}) - ID: ${chord.id}`);
      });
    }
    
  } catch (error) {
    console.error('\n❌ Query failed:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

queryDB();
