#!/usr/bin/env node
import { postTweet, disconnect } from '../lib/twitter.js';
import { addTweetRecord } from '../lib/tweet-store.js';

const text = process.argv[2];
if (!text) {
  console.error('Usage: node scripts/post-tweet.js "Your tweet text"');
  process.exit(1);
}

try {
  const result = await postTweet(text);
  console.log('Tweet posted:', result.success ? 'OK' : 'FAILED');
  if (result.success) {
    console.log('Text:', result.text);
    if (result.url) {
      addTweetRecord({ url: result.url, text: result.text, type: 'tweet' });
      console.log('Saved:', result.url);
    }
  }
} catch (e) {
  console.error('Error:', e.message);
} finally {
  await disconnect();
}
