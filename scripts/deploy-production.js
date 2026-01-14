#!/usr/bin/env node

/**
 * Production Deployment Script
 * 
 * Safely deploys to production by:
 * 1. Checking current branch
 * 2. Merging develop into main
 * 3. Pushing to main (triggers Vercel production deployment)
 * 4. Optionally switching back to develop
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import readline from 'readline';

const execAsync = promisify(exec);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function getCurrentBranch() {
  try {
    const { stdout } = await execAsync('git branch --show-current');
    return stdout.trim();
  } catch (error) {
    console.error('❌ Error getting current branch:', error.message);
    process.exit(1);
  }
}

async function checkUncommittedChanges() {
  try {
    const { stdout } = await execAsync('git status --porcelain');
    return stdout.trim().length > 0;
  } catch (error) {
    console.error('❌ Error checking git status:', error.message);
    process.exit(1);
  }
}

async function runCommand(command, description) {
  console.log(`\n🔄 ${description}...`);
  try {
    const { stdout, stderr } = await execAsync(command);
    if (stdout) console.log(stdout);
    if (stderr && !stderr.includes('warning')) console.error(stderr);
    return true;
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    if (error.stdout) console.error(error.stdout);
    if (error.stderr) console.error(error.stderr);
    return false;
  }
}

async function main() {
  console.log('🚀 Production Deployment Script\n');

  // Check for uncommitted changes
  const hasUncommitted = await checkUncommittedChanges();
  if (hasUncommitted) {
    console.log('⚠️  Warning: You have uncommitted changes.');
    console.log('   Please commit or stash them before deploying.\n');
    const proceed = await question('Continue anyway? (yes/no): ');
    if (proceed.toLowerCase() !== 'yes') {
      console.log('❌ Deployment cancelled.');
      rl.close();
      process.exit(0);
    }
  }

  // Get current branch
  const currentBranch = await getCurrentBranch();
  console.log(`📋 Current branch: ${currentBranch}\n`);

  // Fetch latest changes
  const fetchSuccess = await runCommand(
    'git fetch origin',
    'Fetching latest changes from remote'
  );
  if (!fetchSuccess) {
    console.log('❌ Failed to fetch changes. Aborting.');
    rl.close();
    process.exit(1);
  }

  // Confirm deployment
  console.log('\n⚠️  This will deploy to PRODUCTION (main branch).');
  console.log('   Make sure you have:');
  console.log('   1. Tested changes on staging');
  console.log('   2. Verified staging deployment works correctly');
  console.log('   3. All changes are committed\n');

  const confirm = await question('Continue with production deployment? (yes/no): ');
  if (confirm.toLowerCase() !== 'yes') {
    console.log('❌ Deployment cancelled.');
    rl.close();
    process.exit(0);
  }

  // Checkout main
  const checkoutSuccess = await runCommand(
    'git checkout main',
    'Checking out main branch'
  );
  if (!checkoutSuccess) {
    console.log('❌ Failed to checkout main branch.');
    rl.close();
    process.exit(1);
  }

  // Pull latest main (in case of remote changes)
  await runCommand(
    'git pull origin main',
    'Pulling latest main branch'
  );

  // Merge develop into main
  const mergeSuccess = await runCommand(
    'git merge develop --no-ff -m "Merge develop into main for production deployment"',
    'Merging develop into main'
  );
  if (!mergeSuccess) {
    console.log('\n❌ Merge failed. You may have merge conflicts.');
    console.log('   Resolve conflicts, then run: git push origin main\n');
    rl.close();
    process.exit(1);
  }

  // Push to main (triggers Vercel production deployment)
  const pushSuccess = await runCommand(
    'git push origin main',
    'Pushing to main (triggers production deployment)'
  );
  if (!pushSuccess) {
    console.log('❌ Failed to push to main.');
    rl.close();
    process.exit(1);
  }

  console.log('\n✅ Successfully pushed to main branch!');
  console.log('🚀 Vercel will automatically deploy to production.\n');

  // Ask if user wants to switch back to develop
  const switchBack = await question('Switch back to develop branch? (yes/no): ');
  if (switchBack.toLowerCase() === 'yes') {
    await runCommand(
      'git checkout develop',
      'Switching back to develop branch'
    );
  }

  console.log('\n✅ Production deployment initiated!');
  console.log('   Check Vercel dashboard for deployment status.\n');

  rl.close();
}

main().catch((error) => {
  console.error('❌ Unexpected error:', error);
  rl.close();
  process.exit(1);
});
