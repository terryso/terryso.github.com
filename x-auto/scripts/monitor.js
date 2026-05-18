#!/usr/bin/env node
import { searchTweets, disconnect } from '../lib/twitter.js';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const query = process.argv.slice(2).join(' ') || 'AI agent';

const configFile = resolve('config.json');
let config = {};
try { config = JSON.parse(readFileSync(configFile, 'utf8')); } catch {}

const keywords = query === 'config'
  ? (config.monitor?.keywords || ['AI'])
  : [query];

async function main() {
  for (const kw of keywords) {
    console.log(`\n=== Monitoring: "${kw}" ===\n`);
    const tweets = await searchTweets(kw, 15);

    for (const tweet of tweets) {
      const time = tweet.time ? new Date(tweet.time).toLocaleString() : '';
      console.log(`[${time}] ${tweet.user}`);
      console.log(`  ${tweet.text?.slice(0, 120)}`);
      console.log(`  ${tweet.link}`);
      console.log('');
    }
  }

  // Save report
  const report = { timestamp: new Date().toISOString(), keywords, tweets: [] };
  // Could aggregate all tweets here
  const reportFile = resolve(`monitor-${Date.now()}.json`);
  console.log(`Report saved hints: ${reportFile}`);
}

try {
  await main();
} catch (e) {
  console.error('Error:', e.message);
} finally {
  await disconnect();
}
