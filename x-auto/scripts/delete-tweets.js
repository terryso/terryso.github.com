import { getPage, disconnect } from '../lib/browser.js';
import { listTweetRecords, removeTweetRecord } from '../lib/tweet-store.js';

// Usage:
//   node scripts/delete-tweets.js                     # interactive: show recent tweets
//   node scripts/delete-tweets.js --source <filename>  # delete all tweets from a blog post
//   node scripts/delete-tweets.js --url <url>          # delete specific tweet
//   node scripts/delete-tweets.js --before <date>      # delete tweets before date (YYYY-MM-DD)
//   node scripts/delete-tweets.js --query <text>       # delete tweets matching text

const args = process.argv.slice(2);

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function deleteTweet(page, url) {
  console.log(`  Deleting: ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await sleep(3000);

  // Check if tweet exists
  const currentUrl = page.url();
  if (currentUrl.includes('not_found') || currentUrl.includes('suspended')) {
    console.log('  Already deleted or not found');
    removeTweetRecord(url);
    return 'not_found';
  }

  // Check if it's a retweet (URL contains someone else's username)
  const isOwnTweet = url.includes('/Suchuanyi/status/');

  if (!isOwnTweet) {
    // Undo retweet
    const result = await page.evaluate(() => {
      const btns = document.querySelectorAll('[data-testid="unretweet"]');
      for (const btn of btns) { btn.click(); return 'clicked'; }
      return 'no_btn';
    });
    if (result === 'clicked') {
      await sleep(1000);
      const confirmBtn = await page.$('[data-testid="unretweetConfirm"]');
      if (confirmBtn) await confirmBtn.click();
      console.log('  Un-retweeted');
      removeTweetRecord(url);
      return 'unretweeted';
    }
    console.log('  Could not find unretweet button');
    return 'failed';
  }

  // Delete own tweet: caret → Delete → confirm
  const caretBtns = await page.$$('[data-testid="caret"]');
  if (caretBtns.length === 0) {
    console.log('  No caret button found');
    return 'no_caret';
  }
  await caretBtns[0].click();
  await sleep(1500);

  const clicked = await page.evaluate(() => {
    const items = document.querySelectorAll('[role="menuitem"]');
    for (const item of items) {
      const t = (item.textContent || '').toLowerCase();
      if (t.includes('delete') || t.includes('删除') || t.includes('刪除')) {
        item.click();
        return true;
      }
    }
    return false;
  });
  if (!clicked) {
    console.log('  Delete menu item not found');
    return 'no_delete';
  }

  await sleep(1500);
  const confirmBtn = await page.$('[data-testid="confirmationSheetConfirm"]');
  if (confirmBtn) {
    await confirmBtn.click();
    console.log('  Deleted');
    removeTweetRecord(url);
    return 'deleted';
  }
  console.log('  Confirm button not found');
  return 'no_confirm';
}

function getTargets() {
  const records = listTweetRecords(200);

  if (args.includes('--url')) {
    const url = args[args.indexOf('--url') + 1];
    return records.filter(r => r.url === url);
  }
  if (args.includes('--source')) {
    const src = args[args.indexOf('--source') + 1];
    return records.filter(r => r.source.includes(src));
  }
  if (args.includes('--before')) {
    const date = args[args.indexOf('--before') + 1];
    return records.filter(r => r.postedAt < date);
  }
  if (args.includes('--query')) {
    const q = args[args.indexOf('--query') + 1];
    return records.filter(r => r.text.includes(q) || r.source.includes(q));
  }

  // No filter: show recent tweets for review
  return records;
}

async function main() {
  const targets = getTargets();

  if (targets.length === 0) {
    console.log('No tweets found matching criteria.');
    console.log('\nRecent tweets in store:');
    const recent = listTweetRecords(10);
    for (const r of recent) {
      console.log(`  ${r.url}`);
      console.log(`    ${r.text.slice(0, 80)}...`);
      console.log(`    Source: ${r.source || 'manual'} | ${r.postedAt}`);
    }
    return;
  }

  console.log(`Found ${targets.length} tweet(s) to delete:\n`);
  for (const r of targets) {
    console.log(`  ${r.url}`);
    console.log(`    ${r.text.slice(0, 80)}...`);
  }
  console.log('');

  const page = await getPage();
  let deleted = 0;
  for (const r of targets) {
    const result = await deleteTweet(page, r.url);
    if (result === 'deleted' || result === 'unretweeted' || result === 'not_found') deleted++;
    await sleep(2000);
  }

  console.log(`\nDone: ${deleted}/${targets.length} processed.`);
}

try {
  await main();
} catch (e) {
  console.error('Error:', e.message);
} finally {
  await disconnect();
}
