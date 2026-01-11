# Development Guide

This guide explains how to safely develop and test new functionality without affecting production data.

## Environment Setup

### Local Development (Default: Staging)

By default, your local `.env` file is configured to use the **staging database**. This means:

- ✅ All your local development and testing happens on staging data
- ✅ Production data is completely safe and untouched
- ✅ You can test new features, schema changes, and data modifications freely
- ✅ Waiting list entries, invites, and all test data go to staging

**Current Setup:**
- Local `.env` → Staging database (`fdb09c88-e5eb-4d54-a09c-dd8cc5cef020`)
- Staging deployments (Vercel preview) → Staging database
- Production deployments (Vercel production) → Production database

### Switching Environments

If you need to test against production data (rare), you can switch:

```bash
# Switch to staging (default, safe)
./scripts/switch-env.sh staging

# Switch to production (⚠️ use with caution)
./scripts/switch-env.sh production
```

**⚠️ Important:** Always switch back to staging after testing with production:
```bash
./scripts/switch-env.sh staging
```

## Development Workflow

### 1. Local Development

```bash
# Make sure you're on staging (default)
./scripts/switch-env.sh staging

# Start dev server
npm run dev

# Make your changes, test locally
# All changes go to staging database
```

### 2. Testing on Staging Deployment

```bash
# Commit and push to develop branch
git checkout develop
git add .
git commit -m "Add new feature"
git push origin develop

# Vercel automatically deploys to staging
# Test on staging URL (from Vercel dashboard)
```

### 3. Deploying to Production

```bash
# Only after thorough testing on staging
git checkout main
git merge develop
git push origin main

# Vercel automatically deploys to production
```

## Schema Changes

When you add new entities (like `waitingList` and `invites`), you need to sync the schema:

### Sync to Staging (for testing)

```bash
# Make sure .env is set to staging (default)
./scripts/switch-env.sh staging

# Sync schema
npm run sync-all
```

### Sync to Production (after testing)

```bash
# Switch to production temporarily
./scripts/switch-env.sh production

# Sync schema
npm run sync-all

# Switch back to staging immediately
./scripts/switch-env.sh staging
```

## Database App IDs

- **Staging:** `fdb09c88-e5eb-4d54-a09c-dd8cc5cef020`
- **Production:** `f5937544-d918-4dc7-bb05-5f4a8cae65b3`

## Best Practices

1. ✅ **Always develop on staging** - Your default `.env` uses staging
2. ✅ **Test on staging deployment** - Push to `develop` branch and test on Vercel preview
3. ✅ **Only use production when necessary** - Switch back immediately after
4. ✅ **Sync schema to staging first** - Test schema changes on staging before production
5. ✅ **Verify environment before syncing** - Double-check which App ID is in your `.env`

## Checking Current Environment

You can check which environment you're using:

```bash
./scripts/switch-env.sh
```

Or check your `.env` file:
```bash
cat .env | grep VITE_INSTANTDB_APP_ID
```

- `fdb09c88-e5eb-4d54-a09c-dd8cc5cef020` = Staging ✅
- `f5937544-d918-4dc7-bb05-5f4a8cae65b3` = Production ⚠️

## Troubleshooting

### "I can't see my waiting list entries"

- Check which InstantDB app you're connected to
- If using staging locally, check "Strumkey Staging" in InstantDB dashboard
- If using production, check "Strumkey" (production) in InstantDB dashboard

### "Schema changes aren't showing up"

- Make sure you've synced the schema: `npm run sync-all`
- Verify you're syncing to the correct environment
- Check InstantDB dashboard to confirm entities exist

### "I accidentally used production"

- Switch back to staging immediately: `./scripts/switch-env.sh staging`
- Restart your dev server
- Check InstantDB dashboard to see if any test data was created in production
