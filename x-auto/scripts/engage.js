#!/usr/bin/env node
import { searchTweets, likeTweet, retweet, followUser, replyToTweet, disconnect } from '../lib/twitter.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const action = process.argv[2];
const arg = process.argv[3];

const configFile = resolve('config.json');
let config = {};
try { config = JSON.parse(readFileSync(configFile, 'utf8')); } catch {}
const keywords = config.monitor?.keywords || ['AI', 'Claude', 'LLM'];
const rateLimits = config.rateLimits || { likesPerHour: 30, followsPerHour: 10, repliesPerHour: 12 };

async function autoEngage() {
  const query = arg || keywords.join(' OR ');
  console.log(`Searching: ${query}`);

  const tweets = await searchTweets(query, 20);
  console.log(`Found ${tweets.length} tweets\n`);

  let likes = 0, retweets = 0, follows = 0;

  for (const tweet of tweets) {
    if (likes >= rateLimits.likesPerHour) break;

    // Like
    if (tweet.link) {
      console.log(`Liking: ${tweet.text?.slice(0, 60)}...`);
      const r = await likeTweet(tweet.link);
      if (r.success) likes++;
    }

    // Random retweet (30% chance)
    if (tweet.link && Math.random() < 0.3 && retweets < 10) {
      console.log(`Retweeting: ${tweet.text?.slice(0, 60)}...`);
      const r = await retweet(tweet.link);
      if (r.success) retweets++;
    }

    // Random follow (10% chance)
    if (Math.random() < 0.1 && follows < rateLimits.followsPerHour && tweet.user) {
      const username = tweet.user.split(' ')[0]?.replace('@', '');
      if (username) {
        console.log(`Following: @${username}`);
        const r = await followUser(username);
        if (r.success) follows++;
      }
    }

    // Delay between actions
    await new Promise(r => setTimeout(r, 3000 + Math.random() * 5000));
  }

  console.log(`\nDone: ${likes} likes, ${retweets} retweets, ${follows} follows`);
}

async function main() {
  switch (action) {
    case 'like':
      if (!arg) { console.error('Usage: engage.js like <tweet_url>'); process.exit(1); }
      console.log(await likeTweet(arg));
      break;
    case 'retweet':
      if (!arg) { console.error('Usage: engage.js retweet <tweet_url>'); process.exit(1); }
      console.log(await retweet(arg));
      break;
    case 'follow':
      if (!arg) { console.error('Usage: engage.js follow <username>'); process.exit(1); }
      console.log(await followUser(arg));
      break;
    case 'reply':
      const replyText = process.argv[4];
      if (!arg || !replyText) { console.error('Usage: engage.js reply <tweet_url> "text"'); process.exit(1); }
      console.log(await replyToTweet(arg, replyText));
      break;
    case 'auto':
      await autoEngage();
      break;
    default:
      console.log('Usage: node scripts/engage.js <action> [args]');
      console.log('Actions: like <url>, retweet <url>, follow <user>, reply <url> "text", auto');
  }
}

try {
  await main();
} catch (e) {
  console.error('Error:', e.message);
} finally {
  await disconnect();
}
