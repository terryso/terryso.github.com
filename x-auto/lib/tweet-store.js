import { readFileSync, writeFileSync, existsSync } from 'fs';

const STORE_FILE = 'tweets.json';

function load() {
  if (!existsSync(STORE_FILE)) return [];
  try {
    return JSON.parse(readFileSync(STORE_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function save(records) {
  writeFileSync(STORE_FILE, JSON.stringify(records, null, 2), 'utf8');
}

export function addTweetRecord({ url, text, type = 'tweet', source = '' }) {
  const records = load();
  records.unshift({
    id: Date.now().toString(36),
    url,
    text: text.slice(0, 200),
    type,
    source,
    postedAt: new Date().toISOString(),
  });
  save(records);
  return records[0];
}

export function listTweetRecords(limit = 50) {
  return load().slice(0, limit);
}

export function findTweetRecord(query) {
  const records = load();
  if (query.startsWith('http')) {
    return records.filter(r => r.url === query);
  }
  return records.filter(r =>
    r.text.includes(query) || r.source.includes(query)
  );
}

export function removeTweetRecord(url) {
  const records = load();
  const idx = records.findIndex(r => r.url === url);
  if (idx >= 0) {
    records.splice(idx, 1);
    save(records);
    return true;
  }
  return false;
}
