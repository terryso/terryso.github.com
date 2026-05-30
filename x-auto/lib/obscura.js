import { chromium } from 'playwright-core';
import { spawn } from 'child_process';
import { extractTwitterCookies, toPlaywrightCookies } from './cookies.js';

const DEFAULT_PORT = 9222;

let browser = null;
let obscuraProcess = null;

export async function startObscura(port = DEFAULT_PORT, opts = {}) {
  const args = ['serve', '--port', String(port)];
  if (opts.stealth !== false) args.push('--stealth');
  if (opts.proxy) args.push('--proxy', opts.proxy);

  obscuraProcess = spawn('/usr/local/bin/obscura', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  // Wait for Obscura to be ready
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Obscura startup timeout')), 10000);
    obscuraProcess.stderr.on('data', (data) => {
      if (data.toString().includes('Listening') || data.toString().includes('9222')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    // Fallback: just wait a moment
    setTimeout(() => { clearTimeout(timeout); resolve(); }, 2000);
  });

  return obscuraProcess;
}

export async function connect(port = DEFAULT_PORT, opts = {}) {
  if (browser) return browser;

  // Start Obscura if not running
  try {
    await startObscura(port, opts);
  } catch {
    // Might already be running
  }

  const endpointURL = `http://127.0.0.1:${port}`;
  browser = await chromium.connectOverCDP({ endpointURL });

  // Inject cookies
  const cookies = await extractTwitterCookies();
  if (cookies.length > 0) {
    const context = browser.contexts()[0] || await browser.newContext();
    await context.addCookies(toPlaywrightCookies(cookies));
  }

  return browser;
}

export async function getPage() {
  const b = await connect();
  const context = b.contexts()[0] || await b.newContext();
  const pages = context.pages();
  if (pages.length > 0) return pages[0];
  return await context.newPage();
}

export async function disconnect() {
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
  }
  if (obscuraProcess) {
    obscuraProcess.kill();
    obscuraProcess = null;
  }
}
