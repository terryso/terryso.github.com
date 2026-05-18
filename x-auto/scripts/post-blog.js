#!/usr/bin/env node
import { postTweet, postThread, disconnect } from '../lib/twitter.js';
import { blogPostToTweets } from '../lib/content.js';
import { addTweetRecord } from '../lib/tweet-store.js';

const postFile = process.argv[2];
const mode = process.argv[3] || 'thread'; // 'single' or 'thread'

if (!postFile) {
  console.error('Usage: node scripts/post-blog.js <post_filename> [single|thread]');
  console.error('Example: node scripts/post-blog.js 2026-05-18-my-post.markdown thread');
  process.exit(1);
}

try {
  const { singleTweet, thread, meta, url } = blogPostToTweets(postFile);
  console.log(`Blog: ${meta.title}`);
  console.log(`URL:  ${url}`);
  console.log('');

  if (mode === 'single') {
    console.log('Posting single tweet...');
    console.log(singleTweet);
    const result = await postTweet(singleTweet);
    console.log('Result:', result.success ? 'OK' : 'FAILED');
    if (result.success && result.url) {
      addTweetRecord({ url: result.url, text: singleTweet, type: 'tweet', source: postFile });
      console.log('Saved:', result.url);
    }
  } else {
    console.log(`Posting thread (${thread.length} tweets)...`);
    for (const t of thread) {
      console.log(`---\n${t}`);
    }
    const result = await postThread(thread);
    console.log('Result:', result.success ? 'OK' : 'FAILED');
    if (result.success && result.urls?.length) {
      for (let i = 0; i < result.urls.length; i++) {
        addTweetRecord({ url: result.urls[i], text: thread[i] || '', type: i === 0 ? 'thread_start' : 'thread_reply', source: postFile });
      }
      console.log('Saved thread:', result.urls);
    }
  }
} catch (e) {
  console.error('Error:', e.message);
} finally {
  await disconnect();
}
