# Reddit Scheduler — Project Overview

_Chrome extension for automated Reddit posting. Drop this file into the repo root before starting._

---

## What This Is

A Chrome extension that automates scheduled posting to Reddit. It reads a subreddit list and a content queue from Google Drive, then posts content to the correct subreddits automatically within the user's authenticated Reddit browser session. No Reddit API credentials are required — everything runs through the live logged-in browser.

---

## How It Works

The extension has a background service worker that runs on a configurable schedule. Each cycle:

1. Connects to Google Drive and reads the subreddit configuration document
2. Checks the content queue folder for unposted items
3. Selects the next piece of content and matches it to the appropriate subreddit(s)
4. Navigates to Reddit and submits the post via the web UI
5. Moves the posted file to the `/posted/` folder and logs the action

---

## Google Drive Structure

All configuration and content lives in a single Google Drive folder. The structure is:

```
/Reddit Scheduler/
├── subreddits.json          ← list of subreddits and their rules
├── queue/                   ← content waiting to be posted
│   ├── post_001.json
│   ├── post_002.json
│   └── ...
├── posted/                  ← successfully posted content (moved here after posting)
└── failed/                  ← content that failed after retries (for manual review)
```

### subreddits.json

This file defines the subreddits the extension is allowed to post to, along with per-subreddit rules. Example structure:

```json
[
  {
    "name": "r/fitness",
    "enabled": true,
    "post_type": "image",
    "flair": "Progress",
    "min_interval_hours": 48,
    "daily_limit": 1
  },
  {
    "name": "r/funny",
    "enabled": true,
    "post_type": "link",
    "flair": null,
    "min_interval_hours": 24,
    "daily_limit": 1
  }
]
```

### Post Files (queue/*.json)

Each post is a JSON file in the queue folder. Example structure:

```json
{
  "id": "post_001",
  "title": "My post title here",
  "type": "image",
  "media_url": "https://drive.google.com/...",
  "body": "Optional text body for text posts",
  "link_url": "https://example.com",
  "subreddits": ["r/fitness", "r/bodybuilding"],
  "flair_override": null,
  "nsfw": false,
  "spoiler": false,
  "scheduled_after": "2026-04-10T09:00:00Z"
}
```

The `subreddits` field lists which subreddits this post should be submitted to. If multiple subreddits are listed, the extension spaces out the submissions according to each subreddit's `min_interval_hours` to avoid cross-posting detection.

The `scheduled_after` field is optional — if set, the post will not be submitted before that time.

---

## Supported Post Types

- **Image** — uploads an image file (sourced from Google Drive or a direct URL)
- **Link** — submits a URL post
- **Text** — submits a self/text post with a title and body
- **Video** — uploads a video file (sourced from Google Drive)

Post type is defined per post in the queue file.

---

## Posting Schedule and Rate Limiting

Reddit is aggressive about spam detection. The extension enforces strict limits:

- Maximum posts per day per account (configurable, default 6)
- Maximum posts per subreddit per day (defined in `subreddits.json` per subreddit)
- Minimum hours between posts to the same subreddit (defined in `subreddits.json`)
- Randomised delays between actions to mimic human behaviour
- Configurable quiet hours (no posting outside defined active windows)
- Full deduplication — never posts the same content to the same subreddit twice

All rate limit state is persisted in `chrome.storage.local` and survives browser restarts.

---

## Extension Architecture

### Background Service Worker
- Runs the posting schedule
- Handles all Google Drive API calls (read queue, move files)
- Enforces rate limits and deduplication
- Sends post instructions to the content script
- Logs all activity

### Content Script (reddit.com)
- Executes the actual post submission flow inside the live Reddit session
- Handles navigation to the correct subreddit
- Fills in title, body/media, flair, and NSFW/spoiler flags
- Confirms successful submission and reports back to the background worker

### Storage (chrome.storage.local)
- Account configuration and Google Drive folder IDs
- Posting log (subreddit → post ID → timestamp)
- Daily counters per subreddit
- Rate limit state

### Options / Popup UI
- Connect Google Drive (OAuth flow)
- Set posting schedule and quiet hours
- Configure daily caps and global rate limits
- View recent posting activity and queue status
- Enable/disable individual subreddits without editing the Drive file

---

## Google Drive Authentication

The extension uses Google OAuth 2.0 via `chrome.identity` to access Drive. The user authenticates once through the extension popup. The extension requests the minimum required Drive scope (`drive.file`) scoped to only the Reddit Scheduler folder — it does not request access to the user's entire Drive.

---

## Multi-Account Support

The extension supports multiple Reddit accounts by mapping each to a separate Google Drive folder. The active account is selected from the popup. Each account has its own subreddit list, content queue, rate limit counters, and posting log.

---

## Error Handling

- If a post fails (subreddit rules violation, rate limit hit, network error), it is retried once after a configurable delay
- If it fails again, the post file is moved to `/failed/` with an error note appended to the JSON
- The popup shows a badge count for failed posts requiring attention
- Subreddit-level errors (e.g. banned, requires approval) are flagged in the subreddit config and that subreddit is skipped until manually re-enabled

---

## Out of Scope (Initial Build)

- Comment automation or reply bots
- Voting or engagement automation
- Account creation
- Scraping or reading Reddit content (this is a poster only)
- Caption or content generation — all post content is pre-written in the queue files
- Any activity outside of Reddit

---

## Notes for Claude Code

- The extension must handle Reddit's post submission flow which varies by subreddit (some require flair, some have custom fields, some are image-only). The content script should detect the active post form state and adapt accordingly.
- Reddit uses React and the DOM can be slow to update — the content script should use MutationObserver or polling rather than fixed delays where possible.
- File uploads to Reddit (image/video) are handled via the web UI file input. Use the `DataTransfer` API to inject files into the upload input programmatically.
- Google Drive file downloads for media should use the Drive API export/download endpoint with the OAuth token, not public share links.
- All post timing logic lives in the background worker — the content script is stateless and only executes what it is told.
