import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { resolve } from 'path';

const CHROME_COOKIE_DB = `${homedir()}/Library/Application Support/Google/Chrome/Default/Cookies`;
const COOKIES_CACHE = resolve('cookies.json');

// Python script for Chrome v10 cookie decryption (macOS)
const PYTHON_SCRIPT = `
import sqlite3, json, os, subprocess, sys, base64, hashlib

db_path = sys.argv[1]

try:
    raw_key = subprocess.check_output(
        ['security', 'find-generic-password', '-w', '-s', 'Chrome Safe Storage'],
        stderr=subprocess.DEVNULL
    ).decode().strip()
except:
    print(json.dumps([]))
    sys.exit(0)

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    from cryptography.hazmat.backends import default_backend
except ImportError:
    print(json.dumps([]))
    sys.exit(0)

# Try multiple key derivation approaches
password = raw_key.encode('utf8')
keys = [
    # Approach 1: PBKDF2-SHA1 with saltysalt (standard Chrome v10 macOS)
    hashlib.pbkdf2_hmac('sha1', password, b'saltysalt', 1003, dklen=16),
    # Approach 2: Direct key (base64 decoded)
    base64.b64decode(raw_key + '==' )[:16],
    # Approach 3: SHA256 of password
    hashlib.sha256(password).digest()[:16],
]

conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute(
    "SELECT name, encrypted_value, host_key, path, expires_utc, is_secure, is_httponly "
    "FROM cookies WHERE host_key LIKE '%twitter.com%' OR host_key LIKE '%x.com%'"
)

cookies = []
for name, enc_val, host, path, expires, secure, httponly in cursor:
    if not enc_val or len(enc_val) < 4:
        continue

    prefix = enc_val[:3]
    decrypted = None

    for derived_key in keys:
        try:
            if prefix == b'v10' or prefix == b'v11':
                # AES-128-CBC with IV = 16 spaces
                iv = b' ' * 16
                ciphertext = enc_val[3:]
                cipher = Cipher(algorithms.AES(derived_key), modes.CBC(iv), backend=default_backend())
                decryptor = cipher.decryptor()
                plain = decryptor.update(ciphertext) + decryptor.finalize()
                # Remove PKCS7 padding
                pad_len = plain[-1]
                if 0 < pad_len <= 16:
                    plain = plain[:-pad_len]
                decrypted = plain.decode('utf8')
                break
        except:
            continue

        try:
            if prefix == b'v10' or prefix == b'v11':
                # AES-128-GCM with nonce from bytes 3:15
                aes = AESGCM(derived_key)
                nonce = enc_val[3:15]
                decrypted = aes.decrypt(nonce, enc_val[3:], None).decode('utf8')
                break
        except:
            continue

    if decrypted:
        cookies.append({
            "name": name,
            "value": decrypted,
            "domain": host,
            "path": path,
            "secure": bool(secure),
            "httpOnly": bool(httponly),
            "expires": expires / 1e6 - 11644473600 if expires > 0 else -1,
        })

conn.close()
print(json.dumps(cookies))
`;

// Alternative: Use Chrome remote debugging to get cookies
export async function extractCookiesViaCDP(port = 9222) {
  try {
    const resp = await fetch(`http://127.0.0.1:${port}/json`);
    const targets = await resp.json();
    const browserTarget = targets.find(t => t.type === 'page');
    if (!browserTarget) throw new Error('No Chrome target found');

    // Connect via WebSocket and get cookies
    const wsUrl = browserTarget.webSocketDebuggerUrl;
    const ws = await import('ws');
    const socket = new ws.default(wsUrl);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('CDP timeout')), 10000);
      socket.on('open', () => {
        socket.send(JSON.stringify({
          id: 1,
          method: 'Network.getCookies',
          params: { urls: ['https://x.com', 'https://twitter.com'] }
        }));
      });
      socket.on('message', (data) => {
        clearTimeout(timeout);
        const msg = JSON.parse(data.toString());
        socket.close();
        const cookies = (msg.result?.cookies || []).map(c => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          secure: c.secure,
          httpOnly: c.httpOnly || false,
          expires: c.expires || -1,
        }));
        resolve(cookies);
      });
      socket.on('error', reject);
    });
  } catch {
    return [];
  }
}

export async function extractTwitterCookies(cookiePath) {
  // Use cached cookies if fresh (< 1 hour)
  if (existsSync(COOKIES_CACHE)) {
    const cached = JSON.parse(readFileSync(COOKIES_CACHE, 'utf8'));
    if (cached.timestamp && Date.now() - cached.timestamp < 3600000) {
      console.log(`Using ${cached.cookies.length} cached cookies`);
      return cached.cookies;
    }
  }

  // Method 1: Try extracting from Python script
  const dbPath = cookiePath || CHROME_COOKIE_DB;
  const tmpDb = `${homedir()}/.x-auto-cookies.db`;

  try {
    execSync(`cp "${dbPath}" "${tmpDb}"`, { stdio: 'pipe' });
  } catch {
    throw new Error(`Cannot copy Chrome cookie database from ${dbPath}`);
  }

  const { mkdtempSync } = await import('fs');
  const { tmpdir } = await import('os');
  const { join } = await import('path');
  const tmpDir = mkdtempSync(join(tmpdir(), 'x-auto-'));
  const scriptPath = join(tmpDir, 'extract.py');
  writeFileSync(scriptPath, PYTHON_SCRIPT);

  try {
    const result = execSync(
      `/Users/nick/.browser-use-env/bin/python3 "${scriptPath}" "${tmpDb}"`,
      { encoding: 'utf8', timeout: 15000 }
    );
    const cookies = JSON.parse(result);
    if (cookies.length > 0) {
      writeFileSync(COOKIES_CACHE, JSON.stringify({ timestamp: Date.now(), cookies }));
      console.log(`Extracted ${cookies.length} cookies from Chrome`);
      return cookies;
    }
  } catch {
    // Fallback
  } finally {
    execSync(`rm -rf "${tmpDir}" "${tmpDb}"`, { stdio: 'pipe' });
  }

  // Method 2: Manual cookie input
  console.log('Could not extract cookies automatically.');
  console.log('Please create cookies.json manually or use: node scripts/setup-cookies.js');
  return [];
}

export function toPlaywrightCookies(cookies) {
  return cookies.map(c => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    secure: c.secure,
    httpOnly: c.httpOnly,
    expires: c.expires || -1,
  }));
}
