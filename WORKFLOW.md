# Development Workflow Guide

This guide explains the recommended workflows for developing, testing, and deploying changes to Strumkey.

## Overview

Strumkey uses a hybrid workflow approach that combines single-change and batch deployment strategies depending on the nature of your work. This provides both safety for critical changes and efficiency for related feature work.

## Workflow Selection Guide

### When to Use Single-Change Workflow

Use this workflow for:
- ✅ Bug fixes
- ✅ Small, isolated features
- ✅ UI tweaks that don't depend on other changes
- ✅ Critical fixes that need immediate production deployment
- ✅ When you want to test each change individually on staging

### When to Use Batch Workflow

Use this workflow for:
- ✅ Multiple related features being developed together
- ✅ Large features split into multiple commits
- ✅ UI changes that span multiple components
- ✅ Changes that need to be deployed together
- ✅ When you want to test feature integration before production

## Workflow 1: Single-Change (Current Workflow)

**Best for:** Independent changes, bug fixes, small features

### Steps

1. **Make your change**
   ```bash
   # Ensure you're on develop branch
   git checkout develop
   
   # Work with agent to make changes
   # Test locally with npm run dev
   ```

2. **Test locally**
   - Test thoroughly on local development environment
   - Verify functionality works as expected
   - Check for any errors or issues

3. **Commit your change**
   ```bash
   git add .
   git commit -m "Descriptive commit message"
   ```

4. **Deploy to staging**
   ```bash
   npm run deploy:staging
   # OR use the command: /deploy-to-staging
   ```
   - This pushes `develop` branch and triggers Vercel staging deployment

5. **Test on staging**
   - Visit your staging URL (from Vercel dashboard)
   - Verify the change works correctly in staging environment
   - Test all related functionality

6. **Deploy to production** (if staging tests pass)
   ```bash
   npm run deploy:production
   # OR use the command: /deploy-to-production
   ```
   - This merges `develop` into `main` and triggers Vercel production deployment

### Advantages

- ✅ Each change gets immediate staging verification
- ✅ Easy to isolate issues (problems likely from the last change)
- ✅ Small, low-risk deployments
- ✅ Clear deployment history

### Example

```bash
# Fix a bug
git checkout develop
# ... make bug fix ...
npm run dev  # test locally
git add .
git commit -m "Fix chord display issue in editor"
npm run deploy:staging  # test on staging
# ... verify on staging ...
npm run deploy:production  # deploy to production
```

## Workflow 2: Batch Deployment

**Best for:** Related features, large changes, coordinated releases

### Steps

1. **Make first change**
   ```bash
   git checkout develop
   # Work with agent on feature 1
   # Test locally
   git add .
   git commit -m "Add user profile editing feature"
   ```

2. **Make additional related changes**
   ```bash
   # Work with agent on feature 2 (related to feature 1)
   # Test locally
   git add .
   git commit -m "Add profile image upload"
   
   # Continue for other related changes...
   git add .
   git commit -m "Update profile display component"
   ```

3. **Deploy batch to staging**
   ```bash
   npm run deploy:staging
   ```
   - This deploys all committed changes to staging

4. **Test full batch on staging**
   - Test all changes together
   - Verify feature integration works correctly
   - Check for any conflicts or issues between changes

5. **Deploy to production** (if staging tests pass)
   ```bash
   npm run deploy:production
   ```
   - This merges all changes from `develop` into `main`

### Best Practices for Batch Workflow

1. **Commit each change separately**
   - Don't combine multiple features in one commit
   - Use clear, descriptive commit messages
   - Makes it easier to identify issues later

2. **Test each change locally before committing**
   - Ensure each individual change works
   - Reduces likelihood of broken code in batch

3. **Only batch related changes**
   - Don't mix unrelated features
   - Group changes that depend on each other

4. **Test the full integration on staging**
   - Verify all changes work together
   - Check for any conflicts or integration issues

5. **Use feature branches for very large batches** (optional)
   - If working on a large feature, consider a feature branch
   - Merge feature branch into `develop` when ready
   - Then deploy to staging as normal

### Advantages

- ✅ Faster development (work on multiple features before deploying)
- ✅ Better for testing feature integration
- ✅ Fewer deployments overall
- ✅ Can ship coordinated features together

### Example

```bash
# Feature: User profile improvements
git checkout develop

# Change 1: Add profile editing
# ... work with agent ...
git add .
git commit -m "Add profile editing form"

# Change 2: Add profile image upload  
# ... work with agent ...
git add .
git commit -m "Add profile image upload functionality"

# Change 3: Update profile display
# ... work with agent ...
git add .
git commit -m "Update profile display to show new fields"

# Deploy all together
npm run deploy:staging
# ... test all features together on staging ...

# If tests pass, deploy to production
npm run deploy:production
```

## Quick Reference

### Commands

| Action | Command |
|--------|---------|
| Check current branch | `git branch --show-current` |
| Switch to develop | `git checkout develop` |
| Deploy to staging | `npm run deploy:staging` or `/deploy-to-staging` |
| Deploy to production | `npm run deploy:production` or `/deploy-to-production` |

### Workflow Decision Tree

```
Is this a single, independent change?
├─ YES → Use Single-Change Workflow
│   └─ Change → Test → Commit → Deploy Staging → Test → Deploy Production
│
└─ NO → Are these related features/changes?
    ├─ YES → Use Batch Workflow
    │   └─ Multiple Changes → Commit Each → Deploy Staging → Test All → Deploy Production
    │
    └─ NO → Treat as separate single changes
        └─ Use Single-Change Workflow for each
```

## Important Reminders

### Always Work on `develop` Branch

- ✅ All development work happens on `develop`
- ✅ Never commit directly to `main`
- ✅ `main` is only updated via `deploy:production` command

### Testing Requirements

1. **Local testing is mandatory**
   - Always test locally before committing
   - Use `npm run dev` for local development
   - Verify functionality works as expected

2. **Staging testing is required**
   - Always test on staging before production
   - Verify in staging environment matches expectations
   - Check for environment-specific issues

3. **Production deployment requires staging approval**
   - Only deploy to production after successful staging tests
   - Never skip staging testing

### Database Environments

- **Local development:** Uses staging database (default `.env`)
- **Staging deployment:** Uses staging database
- **Production deployment:** Uses production database
- Staging and production databases are completely separate

### Rollback Strategy

If something goes wrong in production:

1. **Immediate fix:** Create a hotfix on `develop`, test, and deploy
2. **Revert commit:** Use `git revert` on the problematic commit
3. **Check deployment logs:** Review Vercel dashboard for errors

## Common Scenarios

### Scenario 1: Urgent Bug Fix

**Use:** Single-Change Workflow
```bash
git checkout develop
# Fix bug immediately
git add .
git commit -m "Hotfix: Fix critical authentication issue"
npm run deploy:staging
# Quick test on staging
npm run deploy:production  # Deploy immediately after staging verification
```

### Scenario 2: Adding New Feature with Multiple Components

**Use:** Batch Workflow
```bash
git checkout develop
# Component 1
git commit -m "Add feature API endpoint"
# Component 2  
git commit -m "Add feature UI component"
# Component 3
git commit -m "Add feature integration"
npm run deploy:staging
# Test full feature on staging
npm run deploy:production
```

### Scenario 3: Multiple Unrelated Small Fixes

**Use:** Single-Change Workflow for each
```bash
git checkout develop
# Fix 1
git commit -m "Fix typo in welcome message"
npm run deploy:staging
npm run deploy:production

# Fix 2 (separate deployment cycle)
git commit -m "Update button color"
npm run deploy:staging  
npm run deploy:production
```

### Scenario 4: Large Feature Rollout

**Use:** Batch Workflow
```bash
git checkout develop
# Multiple commits for large feature
git commit -m "Add feature: Part 1 - Database schema"
git commit -m "Add feature: Part 2 - Backend logic"
git commit -m "Add feature: Part 3 - Frontend UI"
git commit -m "Add feature: Part 4 - Integration"
npm run deploy:staging
# Thorough testing on staging
npm run deploy:production
```

## Summary

- **Choose workflow based on change type:** Single for independent changes, Batch for related features
- **Always test locally first:** Verify each change works before committing
- **Always test on staging:** Never skip staging testing before production
- **Commit each change separately:** Even in batches, keep commits granular
- **Work on `develop` branch only:** Never commit directly to `main`

Both workflows are valid and supported. Choose the one that best fits your current work!
