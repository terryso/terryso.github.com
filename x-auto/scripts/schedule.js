#!/usr/bin/env node
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';

const configFile = resolve('config.json');
let config = {};
try { config = JSON.parse(readFileSync(configFile, 'utf8')); } catch {}

const postTimes = config.schedule?.postTimes || ['09:00', '13:00', '18:00'];
const engageInterval = config.schedule?.engageIntervalMinutes || 60;
const nodeBin = process.argv[0];

function schedulePost(time) {
  const [h, m] = time.split(':').map(Number);
  const now = new Date();
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);

  const delay = target - now;
  console.log(`Scheduled post at ${time} (in ${Math.round(delay / 60000)} min)`);

  setTimeout(() => {
    // Find the most recent unposted blog post and post it
    console.log('Executing scheduled post...');
    try {
      execSync(`${nodeBin} scripts/post-blog.js --latest thread`, {
        cwd: resolve('.'),
        stdio: 'inherit',
      });
    } catch (e) {
      console.error('Scheduled post failed:', e.message);
    }
    // Schedule next day
    schedulePost(time);
  }, delay);
}

function scheduleEngage() {
  console.log(`Engagement running every ${engageInterval} minutes`);

  setInterval(() => {
    console.log('Running auto-engage...');
    try {
      execSync(`${nodeBin} scripts/engage.js auto`, {
        cwd: resolve('.'),
        stdio: 'inherit',
        timeout: 300000,
      });
    } catch (e) {
      console.error('Engage failed:', e.message);
    }
  }, engageInterval * 60000);
}

console.log('X Auto Scheduler starting...');
console.log(`Post times: ${postTimes.join(', ')}`);
console.log(`Engage interval: ${engageInterval} min\n`);

for (const time of postTimes) {
  schedulePost(time);
}
scheduleEngage();
