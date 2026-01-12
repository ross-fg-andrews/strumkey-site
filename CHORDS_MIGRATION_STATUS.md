# Chords-db Migration Status

## Current Status
- ✅ Schema updated with new fields (key, suffix, fingers, baseFret, barres, position)
- ✅ All components updated to handle array format and baseFret
- ✅ Migration script created and working
- ✅ Permissions updated to allow main library chord creation
- ✅ Query fix applied to handle both 'standard' and 'ukulele_standard' tuning values
- ✅ **MIGRATION COMPLETE**: All 2114 chords successfully imported! (100%)
- ✅ **STATIC CHORD SYSTEM REMOVED**: App now uses database-only chords

## What's Working
1. **Schema**: Updated in `src/instant.schema.ts` with all new fields
2. **Components**: All updated to handle array format and baseFret prop
3. **Queries**: Fixed to find chords with both tuning values
4. **Migration Script**: `scripts/migrate-chords-db.js` successfully runs and reports importing all 2114 chords
5. **App Functionality**: New chords are visible in autocomplete (e.g., Bm shows multiple positions)

## ✅ Migration Complete!

**All 2114 chords have been successfully imported using the HTTP API approach!**

The final solution used:
- ✅ **HTTP API bulk import** (`migrate-chords-http-api.js`)
- ✅ Attempts single bulk request, falls back to batches of 500
- ✅ Successfully imported all 2114 chords in 5 batches
- ✅ 100% complete - verified in database

**Key improvements made:**
- ✅ Fixed query format (admin SDK returns data directly, not under `.data`)
- ✅ Created HTTP API script for more efficient bulk imports
- ✅ Automatic fallback to batches if single request fails
- ✅ Verification step that queries the database after import

## Files Modified

### Migration-Related
- `src/instant.schema.ts` - Updated chord entity schema
- `src/components/ChordDiagram.jsx` - Handles array format and baseFret
- `src/components/CustomChordModal.jsx` - Creates chords with new schema
- `src/db/mutations.js` - Updated createPersonalChord and createMainLibraryChord
- `src/db/queries.js` - Fixed to handle both tuning values
- `src/instant.perms.ts` - Updated to allow main library chord creation
- `scripts/migrate-chords-http-api.js` - **Primary migration script**
- `scripts/migrate-chords-bulk.js` - Alternative migration script
- `scripts/migrate-chords-incremental.js` - Incremental migration script
- `scripts/migrate-chords-db.js` - Original migration script

### Static Chord Removal
- `src/utils/chord-library.js` - Removed static chord logic, removed `getAllChords()`
- `src/utils/chord-detection.js` - Updated to use database chords instead of static
- `src/utils/lyrics-helpers.js` - Removed static chord check
- `src/components/StyledChordEditor.jsx` - Removed static chords, removed 📚 icon
- `src/components/ChordAutocomplete.jsx` - Removed static chords, removed 📚 icon
- `src/components/CustomChordModal.jsx` - Updated to pass database chords for suggestions
- `src/pages/SongSheet.jsx` - Updated comment
- `src/utils/setup-utils.js` - Updated comment
- `src/data/chord-seed.js` - **DELETED** (no longer needed)

## Environment Setup
- `.env` file has:
  - `VITE_INSTANTDB_APP_ID=fdb09c88-e5eb-4d54-a09c-dd8cc5cef020`
  - `INSTANTDB_ADMIN_TOKEN=6050698e-8eaf-4d4a-b161-2ad2c62aa023` (staging)

## Better Migration Strategy

### Recommended: Incremental Migration Script

I've created a new **incremental migration script** (`migrate-chords-incremental.js`) that's much better suited for this task:

**Advantages:**
- ✅ Imports in smaller, manageable chunks (default: 10 per batch)
- ✅ Can import by chord key (A, B, C, etc.) for targeted imports
- ✅ Prioritizes common chords first
- ✅ Safe to run multiple times
- ✅ Better progress tracking
- ✅ More resilient to rate limits

**Usage:**

```bash
# Import all chords (prioritizes common ones first)
node scripts/migrate-chords-incremental.js

# Import specific chord key (e.g., all A chords)
node scripts/migrate-chords-incremental.js A

# Import with custom batch size
BATCH_SIZE=5 node scripts/migrate-chords-incremental.js
```

**Strategy:**
1. Run the script multiple times - each run will add more chords
2. Start with common chords (C, G, F, A, etc.) - they're imported first
3. Gradually build up the library over time
4. The app already works with static seed chords, so this is supplementary

### Alternative: Original Scripts

**Option 1: Improved Script**
```bash
BATCH_SIZE=10 node scripts/migrate-chords-db-improved.js
```

**Option 2: Original Script (Multiple Runs)**
```bash
BATCH_SIZE=25 node scripts/migrate-chords-db.js
# Repeat until complete
```

### Option 3: Check for Unique Constraints
Verify if InstantDB has any unique constraints that might be causing deduplication. The schema doesn't define unique constraints, but InstantDB might have defaults.

### Option 4: Import in Smaller Chunks
Modify the script to:
- Import chords alphabetically (A chords, then B chords, etc.)
- Add verification after each chunk
- Pause between chunks

### Option 5: Use InstantDB Dashboard Import
If InstantDB dashboard has a bulk import feature, export the transformed data as JSON and import through the UI.

## Testing
- ✅ Bm shows multiple positions (new database chords visible)
- ⚠️ A7sus4 should appear but may not be imported yet
- ✅ Query fix working (finds chords with both tuning values)

## Notes
- The migration script can be run safely multiple times (it clears old main library chords first)
- Chords with `tuning: 'standard'` and `tuning: 'ukulele_standard'` are both supported
- New database chords don't show the 📚 icon (only static seed chords do)
- All 2114 chord positions should eventually be imported

## Commands

### ✅ Recommended: HTTP API Migration (COMPLETED)
```bash
# This successfully imported all 2114 chords!
node scripts/migrate-chords-http-api.js
```

### Alternative Scripts (for reference)
```bash
# Original SDK script
node scripts/migrate-chords-db.js

# Bulk script (creates JSON file + attempts import)
node scripts/migrate-chords-bulk.js

# Incremental script (imports by chord key)
node scripts/migrate-chords-incremental.js
```

### Schema/Permissions Sync
```bash
# Sync schema (if schema changes)
npm run sync-schema

# Sync permissions (if permission changes)
npm run sync-perms
```

## Final Solution

The **HTTP API approach** (`migrate-chords-http-api.js`) was the winning solution:
- ✅ Uses `POST /admin/transact` for bulk transactions
- ✅ Attempts single request for all 2114 chords
- ✅ Automatically falls back to batches of 500 if needed
- ✅ Successfully imported all chords in 5 batches
- ✅ 100% complete - all 2114 chords verified in database
