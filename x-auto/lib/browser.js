import { chromium } from 'playwright-core';
import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { homedir } from 'os';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME_DATA = `${homedir()}/Library/Application Support/Google/Chrome`;
const TEMP_PROFILE = '/tmp/x-auto-chrome-profile';
const DEBUG_PORT = 9223;
const COOKIES_FILE = 'cookies.json';

let browser = null;
let chromeProcess = null;

async function ensureChrome() {
  // Try connecting to existing Chrome with debugging
  try {
    const resp = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    if (resp.ok) {
      browser = await chromium.connectOverCDP({ endpointURL: `http://127.0.0.1:${DEBUG_PORT}` });
      return;
    }
  } catch {}

  // Start Chrome with temp profile + cookies
  console.log('Starting Chrome for X automation...');
  mkdirSync(`${TEMP_PROFILE}/Default`, { recursive: true });

  const filesToCopy = [
    ['Default/Cookies', 'Cookies'],
    ['Default/Login Data', 'Login Data'],
    ['Local State', 'Local State'],
    ['First Run', 'First Run'],
  ];
  for (const [src, dst] of filesToCopy) {
    if (existsSync(`${CHROME_DATA}/${src}`)) {
      // Use sqlite3 to safely copy while Chrome may be running
      try {
        execSync(`sqlite3 "${CHROME_DATA}/${src}" ".backup '${TEMP_PROFILE}/${dst}'" 2>/dev/null`);
      } catch {
        // Fallback to plain copy (may get slightly stale data, but works)
        execSync(`cp "${CHROME_DATA}/${src}" "${TEMP_PROFILE}/${dst}" 2>/dev/null`);
      }
    }
  }

  chromeProcess = spawn(CHROME_PATH, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${TEMP_PROFILE}`,
    '--no-first-run',
    '--disable-background-networking',
    '--disable-extensions',
    '--disable-sync',
    '--no-default-browser-check',
    'about:blank',
  ], { detached: true, stdio: 'ignore' });
  chromeProcess.unref();

  // Wait for Chrome to be ready
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const resp = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
      if (resp.ok) {
        browser = await chromium.connectOverCDP({ endpointURL: `http://127.0.0.1:${DEBUG_PORT}` });
        return;
      }
    } catch {}
  }
  throw new Error('Failed to start Chrome');
}

export async function connect() {
  if (browser) return browser;
  await ensureChrome();

  // Inject cookies if available
  if (existsSync(COOKIES_FILE)) {
    const data = JSON.parse(readFileSync(COOKIES_FILE, 'utf8'));
    if (data.cookies?.length) {
      const context = browser.contexts()[0] || await browser.newContext();
      await context.addCookies(data.cookies.map(c => ({
        name: c.name, value: c.value, domain: c.domain,
        path: c.path, secure: c.secure, httpOnly: c.httpOnly, expires: c.expires || -1,
      })));
    }
  }

  return browser;
}

export async function getPage() {
  const b = await connect();
  const context = b.contexts()[0] || await b.newContext();
  const pages = context.pages();
  return pages.length > 0 ? pages[0] : await context.newPage();
}

export async function disconnect() {
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
  }
  if (chromeProcess) {
    try { process.kill(chromeProcess.pid); } catch {}
    chromeProcess = null;
  }
}
