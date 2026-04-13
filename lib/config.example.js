// lib/config.example.js — configuration template
//
// Copy this file to config.js and fill in your values.

// Your Google Cloud Console Web Application OAuth 2.0 client ID.
export const CLIENT_ID = 'YOUR_WEB_APPLICATION_CLIENT_ID.apps.googleusercontent.com';

// Client secret for the Web Application OAuth 2.0 client above.
// Found in Google Cloud Console → Credentials → your client → Client Secret.
export const DRIVE_CLIENT_SECRET = 'YOUR_DRIVE_CLIENT_SECRET';

// Paste your Drive refresh token here after authorizing once on any browser.
// To get it: authorize via the options page → DevTools → Application →
// chrome.storage.local → copy the value of driveRefreshToken.
//
// Filling this in lets proxy Chrome profiles skip the OAuth flow entirely.
export const DRIVE_REFRESH_TOKEN = '';
