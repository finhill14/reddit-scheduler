// lib/config.js — local configuration
//
// Fill in your values here. This file is safe to commit while
// DRIVE_REFRESH_TOKEN is empty; only fill it in once you have a token.

// Your Google Cloud Console Web Application OAuth 2.0 client ID.
export const CLIENT_ID = 'YOUR_WEB_APPLICATION_CLIENT_ID.apps.googleusercontent.com';

// Paste your Drive refresh token here after authorizing once on any browser.
// To get it: authorize via the options page → DevTools → Application →
// chrome.storage.local → copy the value of driveRefreshToken.
//
// Filling this in lets proxy Chrome profiles skip the OAuth flow entirely.
export const DRIVE_REFRESH_TOKEN = '';
