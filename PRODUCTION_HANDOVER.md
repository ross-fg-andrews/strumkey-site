# Production Deployment Handover

## 🚀 Quick Reference

**What needs to be done**:
1. Deploy code changes (removes static chord system)
2. Run database migration script in production (imports 2114 chords)
3. Verify migration success
4. Test app functionality

**Primary migration script**: `scripts/migrate-chords-http-api.js`

**Critical**: Production database needs migration - current state is unknown (likely 0 chords)

---

## Overview
This document outlines the changes made to remove the static seed chord system and migrate to a database-only chord library, plus deployment steps for production.

**⚠️ IMPORTANT**: Read this entire document before deploying. Two major changes need to be deployed together:
1. **Code changes** - Remove static chord system
2. **Database migration** - Import 2114 chords to production database

**Status**:
- ✅ Code changes: Complete and ready for deployment
- ✅ Staging/Dev migration: Complete (2114 chords imported)
- ⚠️ Production migration: **NOT DONE** - Needs to be run after code deploy

## Changes Made

### 1. Removed Static Seed Chord System
- **Deleted**: `src/data/chord-seed.js` (147 static chords)
- **Removed**: All references to `CHORD_SEED_DATA` and `getAllChords()`
- **Result**: App now uses only database chords (main library + personal library)

### 2. Files Modified
- `src/utils/chord-library.js` - Removed static chord logic
- `src/components/StyledChordEditor.jsx` - Removed static chord display and 📚 icon
- `src/components/ChordAutocomplete.jsx` - Removed static chord display and 📚 icon
- `src/components/CustomChordModal.jsx` - Updated to use database chords for suggestions
- `src/utils/chord-detection.js` - Updated to use database chords
- `src/utils/lyrics-helpers.js` - Removed static chord check
- `src/pages/SongSheet.jsx` - Updated comment
- `src/utils/setup-utils.js` - Updated comment

### 3. Database Migration Status
- ✅ **Staging/Dev**: All 2114 chords successfully migrated via HTTP API
- ⚠️ **Production**: Migration needed (see steps below)

## Production Deployment Steps

### Step 1: Verify Current Production State

Check the current chord count in production database:
```bash
# Connect to production and query chord count
# You'll need production credentials
```

Expected:
- Main library chords: 0 or some partial count
- Personal library chords: User-created custom chords

### Step 2: Backup Production Database

**CRITICAL**: Before making any changes, ensure you have:
- Database backup
- Ability to rollback if needed
- Verification of production environment variables

### Step 3: Deploy Code Changes

1. **Verify environment variables are set**:
   ```bash
   # Production should have:
   VITE_INSTANTDB_APP_ID=<production-app-id>
   INSTANTDB_ADMIN_TOKEN=<production-admin-token>
   ```

2. **Deploy code changes**:
   - Push code changes to production branch
   - Run build/verification steps
   - Deploy frontend

### Step 4: Run Production Database Migration

**IMPORTANT**: The migration script clears existing main library chords first, then imports all 2114 chords.

#### Option A: HTTP API Script (Recommended)

```bash
# Ensure you're in the production environment
cd /path/to/production/deployment

# Verify environment variables
echo $VITE_INSTANTDB_APP_ID
echo $INSTANTDB_ADMIN_TOKEN

# Run the migration
node scripts/migrate-chords-http-api.js
```

**Expected Output**:
```
🚀 Starting chord migration via HTTP API...
📥 Fetching chords-db data...
✅ Fetched data
🔄 Transforming data...
✅ Transformed 2114 chord position(s)
🗑️  Clearing existing main library chords...
📤 Importing chords via HTTP API...
  ✅ Batch 1/5 (500 chords) - Total: 500/2114
  ✅ Batch 2/5 (500 chords) - Total: 1000/2114
  ✅ Batch 3/5 (500 chords) - Total: 1500/2114
  ✅ Batch 4/5 (500 chords) - Total: 2000/2114
  ✅ Batch 5/5 (114 chords) - Total: 2114/2114
🔍 Verifying import...
✅ Found 2114 main library chord(s) in database
🎉 All chords imported successfully!
```

#### Option B: If HTTP API Script Fails

Fall back to the bulk script:
```bash
# This creates chords-import.json and attempts import
node scripts/migrate-chords-bulk.js
```

#### Option C: Multiple Runs

If partial import occurs (e.g., only 600-800 chords), run the script multiple times:
```bash
# Each run will add more chords
BATCH_SIZE=50 node scripts/migrate-chords-http-api.js
# Repeat until all 2114 are imported
```

### Step 5: Verify Migration

After migration, verify the database:

1. **Check chord count**:
   - Should show 2114 main library chords in InstantDB dashboard
   - Query: `libraryType: 'main'`

2. **Test in app**:
   - Open chord autocomplete
   - Verify chords appear (should have many more than before)
   - Check that common chords like "C", "Am", "G7" work
   - Verify Bm shows multiple positions

3. **Test chord detection**:
   - Try creating a custom chord
   - Verify suggestions work (uses database chords now)

### Step 6: Monitor

Watch for:
- Errors in logs related to chord lookups
- User reports of missing chords
- Performance issues with chord autocomplete

## Files Needed for Migration

### Migration Scripts
- `scripts/migrate-chords-http-api.js` ⭐ **Use this one**
- `scripts/migrate-chords-bulk.js` (backup)
- `scripts/migrate-chords-incremental.js` (alternative)

### Data File (Optional)
- `chords-import.json` (898KB, 2114 chords) - Created by bulk script if needed

## Environment Variables Required

```bash
# Production .env or environment
VITE_INSTANTDB_APP_ID=<production-app-id>
INSTANTDB_ADMIN_TOKEN=<production-admin-token>
```

**To get admin token**:
1. Go to InstantDB dashboard: https://instantdb.com/dash
2. Navigate to your production app
3. Find Admin Token section
4. Copy token

## Troubleshooting

### Issue: Migration script fails with "parameter-limit-exceeded"
**Solution**: Script automatically falls back to batches of 500. This is expected and fine.

### Issue: Only partial chords imported (e.g., 600 instead of 2114)
**Solution**: 
- Run the script again (it's safe - clears old chords first)
- Or use smaller batches: `BATCH_SIZE=25 node scripts/migrate-chords-http-api.js`

### Issue: "Cannot find module" errors
**Solution**: 
- Ensure all dependencies are installed: `npm install`
- Verify you're in the correct directory
- Check that schema file exists: `src/instant.schema.ts`

### Issue: Query returns 0 chords after import
**Solution**: 
- Wait a few seconds for transactions to commit
- Verify query format (admin SDK returns data directly, not under `.data`)
- Check InstantDB dashboard directly

### Issue: Chords don't appear in app after migration
**Solution**:
- Clear browser cache
- Verify app is using production database (check APP_ID)
- Check browser console for errors
- Verify permissions allow reading main library chords

## Rollback Plan

If issues occur, rollback steps:

1. **Revert code changes**:
   - Deploy previous version of code
   - This restores static seed chord system

2. **Database**:
   - Migration script clears old chords, so previous state is lost
   - If needed, restore from database backup
   - Or re-run migration script (it's idempotent)

3. **Emergency**:
   - If critical issues, can temporarily restore `chord-seed.js` file
   - But this requires reverting all code changes

## Testing Checklist

### Pre-Deployment
- [ ] Code changes reviewed and tested in staging
- [ ] Migration script tested in staging successfully
- [ ] Production environment variables verified
- [ ] Database backup created

### Post-Migration
- [ ] Verify 2114 chords in production database
- [ ] Test chord autocomplete in app
- [ ] Test chord search functionality
- [ ] Test custom chord creation
- [ ] Test chord diagrams render correctly
- [ ] Verify no console errors
- [ ] Test with existing songs that use chords
- [ ] Monitor error logs for 24 hours

## Expected Outcomes

### Before
- ~147 static seed chords (hardcoded)
- 0-600 database chords (partial migration)
- Total: ~147-750 chords available

### After
- 0 static seed chords (removed)
- 2114 database chords (full migration)
- Total: 2114+ chords available (plus user personal chords)

## Key Differences

| Aspect | Before | After |
|--------|--------|-------|
| Chord Source | Static + Database | Database only |
| Total Chords | ~147-750 | 2114+ |
| Format | String frets (`'0003'`) + Array | Array only (`[0,0,0,3]`) |
| Source Indicator | 📚 icon for static | No indicator (all database) |
| Maintainability | Two sources to sync | Single source |

## Support Files

### Documentation
- `CHORDS_MIGRATION_STATUS.md` - Full migration history and status
- `CHORDS_IMPORT_INSTRUCTIONS.md` - Import method details
- `PRODUCTION_HANDOVER.md` - This document

### Scripts Location
All migration scripts are in: `scripts/`
- `migrate-chords-http-api.js` - **Primary script (use this)**
- `migrate-chords-bulk.js` - Alternative with JSON export
- `migrate-chords-incremental.js` - Incremental import option
- `migrate-chords-db.js` - Original script (less reliable)

## Success Criteria

✅ **Migration Complete When**:
1. Production database shows 2114 main library chords
2. Chord autocomplete shows many more chords than before
3. App functions normally (no errors)
4. Users can access all chord variations
5. Custom chord creation still works

## Contact & Notes

**Previous Implementation**:
- Static seed chords were in `src/data/chord-seed.js`
- Function `getAllChords()` accessed static chords
- Static chords shown with 📚 icon

**New Implementation**:
- All chords from database (`libraryType: 'main'`)
- Personal chords from database (`libraryType: 'personal'`)
- No static fallback

**Important Notes**:
- The migration script is **safe to run multiple times** (clears old chords first)
- The app will work even if migration partially succeeds (uses whatever is in database)
- No breaking changes - app gracefully handles missing chords
- Users' personal custom chords are not affected

## Quick Start Checklist

For the new agent taking over:

- [ ] **Step 1**: Review this entire document
- [ ] **Step 2**: Verify you have production access:
  - [ ] InstantDB dashboard access
  - [ ] Production APP_ID
  - [ ] Production ADMIN_TOKEN
  - [ ] Deployment access (git, CI/CD, or manual)
- [ ] **Step 3**: Test migration script locally (optional but recommended):
  ```bash
  # Test with staging credentials if available
  node scripts/migrate-chords-http-api.js
  ```
- [ ] **Step 4**: Deploy code changes to production
- [ ] **Step 5**: Run production database migration:
  ```bash
  # Set production credentials
  export VITE_INSTANTDB_APP_ID=<production-app-id>
  export INSTANTDB_ADMIN_TOKEN=<production-admin-token>
  
  # Run migration
  node scripts/migrate-chords-http-api.js
  ```
- [ ] **Step 6**: Verify migration:
  - [ ] Check InstantDB dashboard shows 2114 main library chords
  - [ ] Test app - chord autocomplete should show many chords
  - [ ] Verify no console errors
- [ ] **Step 7**: Monitor production for 24 hours

## Critical Information

**⚠️ DO NOT deploy code without running database migration!**

If you deploy the code changes but don't run the migration:
- App will try to use database chords only
- Production database might have 0 chords (or partial)
- Users will see fewer chords than before
- App will still function, but chord library will be incomplete

**Recommended Order**:
1. Deploy code changes first (app can handle missing chords gracefully)
2. Then run database migration (adds all 2114 chords)
3. This minimizes downtime risk

## Migration Script Options

### Primary: HTTP API Script ⭐
```bash
node scripts/migrate-chords-http-api.js
```
- Attempts bulk import, falls back to batches of 500
- Most reliable, tested and working
- **Use this for production**

### Backup: Bulk Script
```bash
node scripts/migrate-chords-bulk.js
```
- Creates JSON file and attempts import
- Good for verification or manual import

### Alternative: Incremental Script
```bash
node scripts/migrate-chords-incremental.js
```
- Imports in smaller chunks
- Good if hitting rate limits

## Emergency Contacts

If issues occur during deployment:
1. Check troubleshooting section above
2. Verify environment variables are correct
3. Check InstantDB dashboard for errors
4. Review migration script output for specific errors

## Files Reference

- `PRODUCTION_HANDOVER.md` - This document
- `CHORDS_MIGRATION_STATUS.md` - Detailed migration history
- `CHORDS_IMPORT_INSTRUCTIONS.md` - Import method details
- `scripts/migrate-chords-http-api.js` - **Primary migration script**

Good luck! 🚀
