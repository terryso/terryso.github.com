import { getPage, disconnect } from './browser.js';
import { addTweetRecord } from './tweet-store.js';

const X_BASE = 'https://x.com';
const X_USERNAME = 'Suchuanyi';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function randomDelay(min = 1000, max = 3000) {
  return sleep(min + Math.random() * (max - min));
}

async function waitForLoad(page) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await randomDelay(500, 1500);
}

async function ensureLoggedIn(page) {
  await page.goto(`${X_BASE}/home`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await sleep(2000);
  const url = page.url();
  if (url.includes('login')) {
    throw new Error('Not logged into X. Check cookies.');
  }
}

export async function postTweet(text) {
  const page = await getPage();
  await ensureLoggedIn(page);

  await page.goto(`${X_BASE}/compose/post`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await randomDelay(1000, 2000);

  // Find the compose textbox
  const textbox = await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 10000 });
  await textbox.click();
  await randomDelay(300, 800);

  // Type the tweet text
  await page.keyboard.type(text, { delay: 30 + Math.random() * 50 });
  await randomDelay(500, 1500);

  // Click the tweet button
  const tweetBtn = await page.waitForSelector('[data-testid="tweetButton"]', { timeout: 5000 });
  await tweetBtn.click();

  await sleep(2000);

  // Get tweet URL by navigating to profile
  let tweetUrl = '';
  try {
    await page.goto(`${X_BASE}/${X_USERNAME}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await sleep(2000);
    const linkEl = await page.$('[data-testid="tweet"] a[href*="/status/"]');
    if (linkEl) {
      const href = await linkEl.getAttribute('href');
      if (href) tweetUrl = `https://x.com${href}`;
    }
  } catch {}

  return { success: true, text, url: tweetUrl };
}

export async function postThread(tweets) {
  const page = await getPage();
  await ensureLoggedIn(page);

  let lastTweetUrl = null;

  for (let i = 0; i < tweets.length; i++) {
    if (i === 0) {
      // First tweet
      const result = await postTweet(tweets[i]);
      // Navigate to profile to find the tweet we just posted
      await sleep(3000);
    } else {
      // Reply to the previous tweet
      if (!lastTweetUrl) {
        // Fallback: post as standalone tweet
        await postTweet(tweets[i]);
        continue;
      }
      await page.goto(lastTweetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await randomDelay(1000, 2000);

      const replyBox = await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 10000 });
      await replyBox.click();
      await randomDelay(300, 800);
      await page.keyboard.type(tweets[i], { delay: 30 + Math.random() * 50 });
      await randomDelay(500, 1500);

      const replyBtn = await page.waitForSelector('[data-testid="tweetButtonInline"]', { timeout: 5000 });
      await replyBtn.click();
      await sleep(2000);
    }
  }

  return { success: true, count: tweets.length };
}

export async function likeTweet(tweetUrl) {
  const page = await getPage();
  await ensureLoggedIn(page);

  await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await randomDelay(1000, 2000);

  const likeBtn = await page.waitForSelector('[data-testid="like"]', { timeout: 5000 }).catch(() => null);
  if (likeBtn) {
    await likeBtn.click();
    await randomDelay(500, 1000);
    return { success: true, action: 'like', url: tweetUrl };
  }
  return { success: false, action: 'like', reason: 'already liked or button not found' };
}

export async function retweet(tweetUrl) {
  const page = await getPage();
  await ensureLoggedIn(page);

  await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await randomDelay(1000, 2000);

  const retweetBtn = await page.waitForSelector('[data-testid="retweet"]', { timeout: 5000 }).catch(() => null);
  if (retweetBtn) {
    await retweetBtn.click();
    await randomDelay(300, 800);

    // Click "Repost" in the menu
    const confirmBtn = await page.waitForSelector('[data-testid="retweetConfirm"]', { timeout: 3000 }).catch(() => null);
    if (confirmBtn) {
      await confirmBtn.click();
    }
    await randomDelay(500, 1000);
    return { success: true, action: 'retweet', url: tweetUrl };
  }
  return { success: false, action: 'retweet', reason: 'button not found' };
}

export async function followUser(username) {
  const page = await getPage();
  await ensureLoggedIn(page);

  await page.goto(`${X_BASE}/${username}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await randomDelay(1000, 2000);

  const followBtn = await page.waitForSelector('[data-testid*="follow"]', { timeout: 5000 }).catch(() => null);
  if (followBtn) {
    const text = await followBtn.textContent();
    if (text && text.toLowerCase().includes('follow')) {
      await followBtn.click();
      await randomDelay(500, 1000);
      return { success: true, action: 'follow', user: username };
    }
    return { success: false, action: 'follow', reason: 'already following' };
  }
  return { success: false, action: 'follow', reason: 'button not found' };
}

export async function replyToTweet(tweetUrl, text) {
  const page = await getPage();
  await ensureLoggedIn(page);

  await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await randomDelay(1000, 2000);

  const replyBox = await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 10000 });
  await replyBox.click();
  await randomDelay(300, 800);
  await page.keyboard.type(text, { delay: 30 + Math.random() * 50 });
  await randomDelay(500, 1500);

  const replyBtn = await page.waitForSelector('[data-testid="tweetButtonInline"]', { timeout: 5000 });
  await replyBtn.click();

  await sleep(2000);
  return { success: true, action: 'reply', url: tweetUrl, text };
}

export async function searchTweets(query, limit = 10) {
  const page = await getPage();
  await ensureLoggedIn(page);

  const encoded = encodeURIComponent(query);
  await page.goto(`${X_BASE}/search?q=${encoded}&src=typed_query&f=top`, {
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  });
  await randomDelay(2000, 4000);

  const tweets = [];
  const tweetElements = await page.$$('[data-testid="tweet"]').catch(() => []);

  for (let i = 0; i < Math.min(tweetElements.length, limit); i++) {
    const el = tweetElements[i];
    try {
      const textEl = await el.$('[data-testid="tweetText"]');
      const text = textEl ? await textEl.textContent() : '';
      const userEl = await el.$('[data-testid="User-Name"]');
      const user = userEl ? await userEl.textContent() : '';
      const linkEl = await el.$('a[href*="/status/"]');
      const link = linkEl ? await linkEl.getAttribute('href') : '';
      const timeEl = await el.$('time');
      const time = timeEl ? await timeEl.getAttribute('datetime') : '';

      tweets.push({ text, user, link: link ? `https://x.com${link}` : '', time });
    } catch {
      // skip problematic tweets
    }
  }

  return tweets;
}

export { disconnect };
