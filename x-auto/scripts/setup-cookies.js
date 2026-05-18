#!/usr/bin/env node
// Extract X/Twitter cookies from Chrome for Obscura
// Usage: node scripts/setup-cookies.js
//
// Requires: Chrome to be closed (this will restart it temporarily)

import { chromium } from 'playwright-core';
import { writeFileSync, existsSync, mkdirSync, cpSync } from 'fs';
import { homedir } from 'os';
import { execSync, spawn } from 'child_process';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME_DATA = `${homedir()}/Library/Application Support/Google/Chrome`;
const TEMP_PROFILE = '/tmp/x-auto-chrome-profile';
const DEBUG_PORT = 9223;
const COOKIES_FILE = 'cookies.json';

async function main() {
  // Check if Chrome is running
  try {
    const result = execSync('pgrep -x "Google Chrome"', { encoding: 'utf8' });
    if (result.trim()) {
      console.log('Chrome is running. Please close Chrome first, then re-run this script.');
      console.log('  Run: pkill -a "Google Chrome"');
      process.exit(1);
    }
  } catch {
    // Chrome not running - good
  }

  // Prepare temp profile with cookies from default Chrome profile
  console.log('Setting up temp Chrome profile with your cookies...');
  mkdirSync(`${TEMP_PROFILE}/Default`, { recursive: true });

  const filesToCopy = [
    ['Default/Cookies', 'Cookies'],
    ['Default/Login Data', 'Login Data'],
    ['Local State', 'Local State'],
    ['First Run', 'First Run'],
  ];

  for (const [src, dst] of filesToCopy) {
    const srcPath = `${CHROME_DATA}/${src}`;
    if (existsSync(srcPath)) {
      cpSync(srcPath, `${TEMP_PROFILE}/${dst}`);
    }
  }

  // Launch Chrome with temp profile
  console.log('Starting Chrome with debugging...');
  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${TEMP_PROFILE}`,
    '--no-first-run',
    '--disable-extensions',
    'https://x.com/home',
  ], { detached: true, stdio: 'ignore' });
  chromeProc.unref();

  // Wait for Chrome to start
  console.log('Waiting for Chrome...');
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const resp = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
      if (resp.ok) break;
    } catch {
      if (i === 9) {
        console.error('Failed to connect to Chrome.');
        process.exit(1);
      }
    }
  }

  // Connect and extract cookies
  console.log('Connected! Extracting cookies...');
  const browser = await chromium.connectOverCDP({ endpointURL: `http://127.0.0.1:${DEBUG_PORT}` });
  const context = browser.contexts()[0];

  // Wait for X to load
  await new Promise(r => setTimeout(r, 3000));

  const cookies = await context.cookies(['https://x.com', 'https://twitter.com']);
  const auth = cookies.find(c => c.name === 'auth_token');
  const ct0 = cookies.find(c => c.name === 'ct0');

  if (!auth) {
    console.log('\nNot logged into X. Please log in to x.com in Chrome first, then re-run.');
    await browser.close().catch(() => {});
    process.exit(1);
  }

  console.log(`Found ${cookies.length} cookies`);
  console.log(`  auth_token: ${auth.value.slice(0, 10)}...`);
  console.log(`  ct0: ${ct0 ? ct0.value.slice(0, 10) + '...' : 'NOT FOUND'}`);

  // Save cookies
  const ourCookies = cookies.map(c => ({
    name: c.name, value: c.value, domain: c.domain,
    path: c.path, secure: c.secure, httpOnly: c.httpOnly || false, expires: c.expires || -1,
  }));
  writeFileSync(COOKIES_FILE, JSON.stringify({ timestamp: Date.now(), cookies: ourCookies }, null, 2));
  console.log(`\nSaved to ${COOKIES_FILE}`);

  // Cleanup
  await browser.close().catch(() => {});
  execSync('pkill -a "Google Chrome" 2>/dev/null', { stdio: 'pipe' });
  console.log('Done! Chrome closed. You can now use x-auto scripts.');
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
