#!/usr/bin/env node

/**
 * Smart dev server script that automatically manages cache
 * Clears cache when config files change or when explicitly needed
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const CACHE_DIRS = [
  join(rootDir, '.vite'),
  join(rootDir, 'node_modules', '.vite'),
];

const CONFIG_FILES = [
  join(rootDir, 'vite.config.js'),
  join(rootDir, 'package.json'),
  join(rootDir, 'package-lock.json'),
  join(rootDir, '.env'),
];

function getFileModTime(filePath) {
  try {
    if (existsSync(filePath)) {
      return statSync(filePath).mtimeMs;
    }
  } catch (error) {
    // File doesn't exist or can't be read
  }
  return 0;
}

function getCacheModTime() {
  let maxTime = 0;
  for (const cacheDir of CACHE_DIRS) {
    const time = getFileModTime(cacheDir);
    if (time > maxTime) {
      maxTime = time;
    }
  }
  return maxTime;
}

function shouldClearCache() {
  const cacheTime = getCacheModTime();
  if (cacheTime === 0) {
    // No cache exists, no need to clear
    return false;
  }

  // Check if any config file is newer than cache
  for (const configFile of CONFIG_FILES) {
    const configTime = getFileModTime(configFile);
    if (configTime > cacheTime) {
      console.log(`📝 ${configFile} was modified after cache was created`);
      return true;
    }
  }

  return false;
}

async function clearCache() {
  console.log('🧹 Clearing Vite cache...');
  try {
    await execAsync('npm run clean:cache');
    console.log('✅ Cache cleared');
  } catch (error) {
    console.error('⚠️  Warning: Could not clear cache:', error.message);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const forceClear = args.includes('--clean') || args.includes('-c');

  if (forceClear || shouldClearCache()) {
    await clearCache();
  }

  // Start vite dev server
  console.log('🚀 Starting dev server...\n');
  const viteProcess = exec('vite', {
    cwd: rootDir,
    stdio: 'inherit',
  });

  viteProcess.on('exit', (code) => {
    process.exit(code || 0);
  });

  // Handle termination
  process.on('SIGINT', () => {
    viteProcess.kill('SIGINT');
  });
  process.on('SIGTERM', () => {
    viteProcess.kill('SIGTERM');
  });
}

main().catch((error) => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});

