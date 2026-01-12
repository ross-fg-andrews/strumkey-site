# Chord Import Instructions

## ✅ Option 1: HTTP API Bulk Import (BEST - Recommended!)

InstantDB's HTTP API supports bulk transactions in a single request. This is the most efficient method:

```bash
node scripts/migrate-chords-http-api.js
```

**Advantages:**
- ✅ Attempts to import all 2114 chords in a single HTTP request
- ✅ Falls back to batches of 500 if single request fails
- ✅ More efficient than SDK approach
- ✅ Uses official Admin HTTP API

## Option 2: Dashboard Import

**Note**: InstantDB does NOT have a dashboard import feature. The HTTP API is the recommended approach.

## Option 3: Script with Smaller Batches

Run the bulk script with smaller batch sizes:

```bash
# Try with batch size 100
BATCH_SIZE=100 node scripts/migrate-chords-bulk.js

# Or even smaller for better reliability
BATCH_SIZE=50 node scripts/migrate-chords-bulk.js

# Or smallest for maximum reliability
BATCH_SIZE=25 node scripts/migrate-chords-bulk.js
```

Run multiple times - each run will add more chords until all 2114 are imported.

## Option 3: Incremental Import

Use the incremental script to import gradually:

```bash
# Import all (prioritizes common chords)
node scripts/migrate-chords-incremental.js

# Or import by key
node scripts/migrate-chords-incremental.js C
node scripts/migrate-chords-incremental.js A
```

## Current Status

- ✅ JSON file created: `chords-import.json` (898KB, 2114 chords)
- ⚠️ Script import: ~612 chords imported (28.9% complete)
- 💡 Best approach: Use dashboard import if available, or run script multiple times with smaller batches
