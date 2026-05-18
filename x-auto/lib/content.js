import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

const SITE_URL = 'https://blog.terryso.dev';
const MAX_TWEET_LENGTH = 280;

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const yaml = match[1];
  const meta = {};
  for (const line of yaml.split('\n')) {
    const m = line.match(/^(\w+):\s*['"]?(.+?)['"]?\s*$/);
    if (m) meta[m[1]] = m[2].trim();
  }
  return meta;
}

function buildPostUrl(filename) {
  const dateMatch = filename.match(/^(\d{4})-(\d{2})-(\d{2})-(.+)\.(md|markdown)$/);
  if (!dateMatch) return '';
  const slug = dateMatch[4];
  return `${SITE_URL}/blog/${slug}`;
}

function truncate(s, maxLen) {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 3) + '...';
}

export function blogPostToTweets(filename, postsDir = '../_posts') {
  const filePath = resolve(postsDir, filename);
  const content = readFileSync(filePath, 'utf8');
  const meta = parseFrontmatter(content);
  const url = buildPostUrl(filename);

  const title = meta.title || filename;
  const description = meta.description || '';
  const tags = (meta.tags || '').split(',').map(t => t.trim().replace(/[\[\]]/g, '')).filter(Boolean);
  const hashtags = tags.slice(0, 3).map(t => `#${t.replace(/\s+/g, '')}`).join(' ');

  const singleTweet = buildSingleTweet(title, description, url, hashtags);
  const thread = buildThread(title, description, url, hashtags);

  return { singleTweet, thread, meta, url };
}

function buildSingleTweet(title, description, url, hashtags) {
  // Strategy: title + url always included, description truncated to fit
  // Format: "title\n\ndescription...\n\n#tags\n\nurl"
  // Or just: "title\n\n#tags\n\nurl" if no description

  const urlLine = url;
  const hashLine = hashtags;
  const separator = '\n\n';

  // Calculate fixed parts length
  let fixedLen = title.length + separator.length + urlLine.length;
  if (hashLine) fixedLen += separator.length + hashLine.length;

  // Space for description
  const descSpace = MAX_TWEET_LENGTH - fixedLen - separator.length * 2;

  let tweet = title;
  if (description && descSpace > 20) {
    tweet += separator + truncate(description, descSpace);
  }
  if (hashLine) tweet += separator + hashLine;
  tweet += separator + urlLine;

  // Final safety check
  if (tweet.length > MAX_TWEET_LENGTH) {
    // Drop description, keep title + hashtags + url
    tweet = title;
    if (hashLine) tweet += separator + hashLine;
    tweet += separator + urlLine;

    // If still too long, truncate title
    if (tweet.length > MAX_TWEET_LENGTH) {
      tweet = truncate(title, MAX_TWEET_LENGTH - urlLine.length - 4) + separator + urlLine;
    }
  }

  return tweet;
}

function buildThread(title, description, url, hashtags) {
  const tweets = [];

  // Tweet 1: Title + hashtags
  let t1 = title;
  if (hashtags) t1 += `\n\n${hashtags}`;
  tweets.push(t1.slice(0, MAX_TWEET_LENGTH));

  // Tweet 2: Description (split if needed)
  if (description) {
    const chunks = splitText(description, MAX_TWEET_LENGTH);
    tweets.push(...chunks);
  }

  // Last tweet: Link
  tweets.push(`Read more: ${url}`);

  return tweets;
}

function splitText(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  // Split by sentences first, then by characters
  const sentences = text.split(/(?<=[。！？.!?])\s*/);
  let current = '';
  for (const s of sentences) {
    if ((current + s).length > maxLen) {
      if (current) chunks.push(current);
      // If single sentence is too long, split by chars
      if (s.length > maxLen) {
        for (let i = 0; i < s.length; i += maxLen) {
          chunks.push(s.slice(i, i + maxLen));
        }
        current = '';
      } else {
        current = s;
      }
    } else {
      current += s;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function listRecentPosts(postsDir = '../_posts', limit = 10) {
  const dir = resolve(postsDir);
  const files = readdirSync(dir)
    .filter(f => /^\d{4}-\d{2}-\d{2}-/.test(f))
    .sort()
    .reverse()
    .slice(0, limit);

  return files.map(f => {
    const content = readFileSync(resolve(dir, f), 'utf8');
    const meta = parseFrontmatter(content);
    return { filename: f, title: meta.title, date: meta.date, url: buildPostUrl(f) };
  });
}
