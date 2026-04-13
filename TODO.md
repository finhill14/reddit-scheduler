# Reddit Scheduler — Project Plan & To-Do List

## Overview

Chrome extension (Manifest V3) that automates scheduled Reddit posting using Google Drive as a content queue and configuration store. No Reddit API credentials required — operates through the user's live browser session.

---

## Phase 1 — Project Scaffold

- [ ] Create `manifest.json` (MV3) with required permissions:
  - `identity`, `storage`, `alarms`, `scripting`, `tabs`
  - Host permission for `https://www.reddit.com/*`
  - OAuth2 client ID declaration
- [ ] Set up folder structure:
  ```
  /
  ├── manifest.json
  ├── background/
  │   └── service-worker.js
  ├── content/
  │   └── reddit.js
  ├── popup/
  │   ├── popup.html
  │   ├── popup.js
  │   └── popup.css
  ├── options/
  │   ├── options.html
  │   ├── options.js
  │   └── options.css
  ├── lib/
  │   ├── drive.js          ← Google Drive API helpers
  │   ├── scheduler.js      ← Timing / rate limit logic
  │   ├── storage.js        ← chrome.storage wrappers
  │   └── logger.js         ← Activity log helpers
  └── icons/
      ├── icon16.png
      ├── icon48.png
      └── icon128.png
  ```
- [ ] Register extension in Chrome developer mode for local testing

---

## Phase 2 — Google Drive Authentication

- [ ] Set up Google OAuth 2.0 via `chrome.identity.getAuthToken`
- [ ] Request minimum Drive scope: `https://www.googleapis.com/auth/drive.file`
- [ ] Store OAuth token and expiry in `chrome.storage.local`
- [ ] Implement token refresh logic (handle 401 responses)
- [ ] Build `lib/drive.js` with helper functions:
  - `authenticate()` — trigger OAuth flow
  - `listFiles(folderId)` — list files in a Drive folder
  - `readFile(fileId)` — download and parse a JSON file
  - `moveFile(fileId, newParentId)` — move file between folders (queue → posted/failed)
  - `downloadMedia(fileId)` — download binary media (images/video) as Blob
- [ ] Store user's root folder ID (Reddit Scheduler folder) in settings

---

## Phase 3 — Background Service Worker

File: `background/service-worker.js`

- [ ] Register a `chrome.alarms` alarm for the posting schedule (default: every 15 min)
- [ ] On alarm fire:
  1. [ ] Check quiet hours — skip if outside active window
  2. [ ] Fetch `subreddits.json` from Drive and parse
  3. [ ] List files in `/queue/` folder
  4. [ ] For each queued post:
     - Check `scheduled_after` — skip if not yet due
     - Check per-account daily cap
     - For each target subreddit in the post:
       - Check subreddit `enabled` flag
       - Check subreddit `daily_limit` and `min_interval_hours`
       - Check deduplication log (never repost same content to same subreddit)
  5. [ ] Select eligible post + subreddit, inject content script, send post instruction
  6. [ ] After confirmation from content script: move file to `/posted/`, update log/counters
  7. [ ] On failure after retry: move file to `/failed/` with error annotation
- [ ] Build `lib/scheduler.js`:
  - `canPostToSubreddit(subredditName)` — checks all rate limit rules
  - `recordPost(subredditName, postId)` — updates log and counters
  - `resetDailyCounters()` — called at midnight
- [ ] Persist all state to `chrome.storage.local` via `lib/storage.js`
- [ ] Log all activity via `lib/logger.js` (keep last N entries in storage)

---

## Phase 4 — Content Script (Reddit Post Submission)

File: `content/reddit.js`

- [ ] Injected into `https://www.reddit.com/r/*/submit*`
- [ ] Receive post instruction message from background worker (via `chrome.runtime.onMessage`)
- [ ] Navigate to correct subreddit submit URL if not already there
- [ ] Detect active post form type (New Reddit UI) using DOM inspection
- [ ] Handle **Text** posts:
  - Fill title input
  - Fill body textarea / rich text editor
- [ ] Handle **Link** posts:
  - Fill title input
  - Fill URL input
- [ ] Handle **Image** posts:
  - Switch to image tab
  - Inject image Blob into file input via `DataTransfer` API
  - Wait for upload confirmation (MutationObserver on upload status)
- [ ] Handle **Video** posts:
  - Switch to video tab
  - Inject video Blob into file input via `DataTransfer` API
  - Wait for upload confirmation
- [ ] Select flair (if required by subreddit or specified in post):
  - Open flair picker
  - Match and click correct flair by name
- [ ] Set NSFW flag if `nsfw: true`
- [ ] Set Spoiler flag if `spoiler: true`
- [ ] Submit the form
- [ ] Confirm successful submission (detect post URL or success indicator via MutationObserver)
- [ ] Send success/failure message back to background worker
- [ ] All DOM waits use MutationObserver or polling — no fixed `setTimeout` delays

---

## Phase 5 — Storage Layer

File: `lib/storage.js`

- [ ] Define storage schema (all keyed in `chrome.storage.local`):
  ```
  accounts[]                   ← list of account configs
  activeAccountId              ← currently selected account
  accounts[id].driveFolderId   ← root Drive folder for this account
  accounts[id].postingLog      ← { subreddit: { postId: timestamp } }
  accounts[id].dailyCounters   ← { subreddit: { date: count } }
  accounts[id].subredditErrors ← { subreddit: errorInfo }
  settings.schedule            ← alarm interval in minutes
  settings.quietHours          ← { start: "HH:MM", end: "HH:MM" }
  settings.dailyCap            ← max posts per day per account
  activityLog[]                ← last 200 log entries
  failedBadgeCount             ← count for popup badge
  ```
- [ ] Implement typed get/set wrappers for each key
- [ ] Implement `resetDailyCounters()` — run at midnight via alarm

---

## Phase 6 — Popup & Options UI

Files: `popup/`, `options/`

- [ ] **Popup** (`popup.html` / `popup.js`):
  - Show active account name and Drive connection status
  - "Connect Google Drive" button (triggers OAuth)
  - Account switcher dropdown (multi-account)
  - Badge count for failed posts
  - Queue status: X items pending, X posted today
  - Last 5 activity log entries
  - "Open Settings" link to options page

- [ ] **Options page** (`options.html` / `options.js`):
  - Google Drive folder picker / folder ID input
  - Posting schedule interval (minutes)
  - Quiet hours start/end time pickers
  - Global daily cap setting
  - Per-subreddit enable/disable toggles (loaded from `subreddits.json`)
  - Full activity log view (paginated)
  - Failed posts list with "Requeue" and "Dismiss" actions
  - "Test Connection" button (fetches subreddits.json and shows result)

---

## Phase 7 — Multi-Account Support

- [ ] Allow adding multiple Reddit accounts, each mapped to a Drive folder
- [ ] Account config stored as array in `chrome.storage.local`
- [ ] Active account selected from popup dropdown
- [ ] Each account has isolated: subreddit list, queue, posting log, daily counters
- [ ] Background worker posts only for the active account (or all enabled accounts — TBD)

---

## Phase 8 — Error Handling & Retry Logic

- [ ] On post failure: wait configurable delay (default 5 min) then retry once
- [ ] On second failure: move queue file to `/failed/` folder on Drive
- [ ] Append error info to the JSON before moving: `{ "error": "...", "failed_at": "..." }`
- [ ] Increment `failedBadgeCount` in storage → shown as red badge on extension icon
- [ ] Subreddit-level errors (banned, requires approval): flag in `subredditErrors` storage
  - Flagged subreddits are skipped automatically until manually re-enabled in options
- [ ] Network errors during Drive API calls: retry with exponential backoff (2s, 4s, 8s)

---

## Phase 9 — Testing & QA

- [ ] Load unpacked extension in Chrome and verify manifest is valid
- [ ] Test OAuth flow — authenticate, token stored, refresh works
- [ ] Test Drive file read — fetch `subreddits.json`, parse queue files
- [ ] Test scheduler — alarm fires, quiet hours respected, rate limits enforced
- [ ] Test content script — text post submission on a test subreddit
- [ ] Test content script — link post submission
- [ ] Test content script — image post with DataTransfer upload
- [ ] Test flair selection
- [ ] Test NSFW / spoiler flags
- [ ] Test failure path — file moved to `/failed/`, badge shown
- [ ] Test multi-account switching
- [ ] Test daily counter reset at midnight
- [ ] Verify deduplication — same post never submitted to same subreddit twice

---

## Phase 10 — Polish & Ship

- [ ] Add extension icons (16, 48, 128px)
- [ ] Write user-facing setup instructions (how to set up Drive folder, add OAuth client)
- [ ] Review all hardcoded values — move to settings where appropriate
- [ ] Code review for security: no XSS, no sensitive data leaked to page scripts
- [ ] Package extension as `.zip` for Chrome Web Store (or self-distribution)

---

## Key Constraints & Design Notes

- **No Reddit API** — all posting goes through the live browser session via content script
- **MV3 service worker** — no persistent background page; use `chrome.alarms` for scheduling
- **MutationObserver over setTimeout** — Reddit's React UI is async; observe DOM changes
- **DataTransfer API** — only way to inject files into `<input type="file">` programmatically
- **Drive scope: `drive.file`** — extension only accesses files it created or the user explicitly picked
- **Randomised delays** — mimic human behaviour between UI interactions in content script
- **Stateless content script** — all decision logic lives in background worker; content script only executes instructions
