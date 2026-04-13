// lib/drive.js — Google Drive OAuth (PKCE + launchWebAuthFlow) and API helpers
//
// Uses a Web Application client ID so auth works across Chrome profiles
// without requiring a Google account to be signed into Chrome itself.
//
// Setup: the user must add chrome.identity.getRedirectURL() to the
// "Authorized redirect URIs" list of their Google Cloud Console Web
// Application client ID.

import { CLIENT_ID, DRIVE_CLIENT_SECRET, DRIVE_REFRESH_TOKEN as CONFIG_REFRESH_TOKEN } from './config.js';

const SCOPES    = 'https://www.googleapis.com/auth/drive';

const AUTH_ENDPOINT  = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

function generateCodeVerifier() {
  // 48 random bytes → 64-char base64url string (well within 43–128 char limit)
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  return base64urlEncode(bytes);
}

async function generateCodeChallenge(verifier) {
  const encoded = new TextEncoder().encode(verifier);
  const digest  = await crypto.subtle.digest('SHA-256', encoded);
  return base64urlEncode(new Uint8Array(digest));
}

function base64urlEncode(bytes) {
  let str = '';
  for (const byte of bytes) str += String.fromCharCode(byte);
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g,  '');
}

// ---------------------------------------------------------------------------
// Public: full PKCE authorization flow
// ---------------------------------------------------------------------------

/**
 * Opens the Google consent screen via launchWebAuthFlow, exchanges the
 * authorization code for tokens (access + refresh), persists them to
 * chrome.storage.local, and returns the authorized Gmail address.
 *
 * Must be called from a user-gesture context (e.g. a button click handler).
 */
export async function authenticate() {
  const codeVerifier  = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const redirectUri   = chrome.identity.getRedirectURL();

  const authUrl = new URL(AUTH_ENDPOINT);
  authUrl.searchParams.set('response_type',         'code');
  authUrl.searchParams.set('client_id',             CLIENT_ID);
  authUrl.searchParams.set('redirect_uri',          redirectUri);
  authUrl.searchParams.set('scope',                 SCOPES);
  authUrl.searchParams.set('code_challenge',        codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('access_type',           'offline');
  // prompt=consent ensures a refresh_token is always returned even if the
  // user has previously granted access
  authUrl.searchParams.set('prompt', 'consent');

  const responseUrl = await chrome.identity.launchWebAuthFlow({
    url:         authUrl.toString(),
    interactive: true,
  });

  const code = new URL(responseUrl).searchParams.get('code');
  if (!code) throw new Error('No authorization code returned in redirect URL');

  const tokens = await exchangeCodeForTokens(code, codeVerifier, redirectUri);
  await storeTokens(tokens);

  const email = await fetchAuthorizedEmail();
  await chrome.storage.local.set({ driveAuthorizedEmail: email });
  return email;
}

// ---------------------------------------------------------------------------
// Token exchange & storage
// ---------------------------------------------------------------------------

async function exchangeCodeForTokens(code, codeVerifier, redirectUri) {
  const res = await fetch(TOKEN_ENDPOINT, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      code,
      client_id:     CLIENT_ID,
      client_secret: DRIVE_CLIENT_SECRET,
      redirect_uri:  redirectUri,
      code_verifier: codeVerifier,
      grant_type:    'authorization_code',
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Token exchange failed: ${err.error_description ?? res.status}`);
  }
  return res.json();
}

async function storeTokens({ access_token, refresh_token, expires_in }) {
  const driveTokenExpiry = Date.now() + expires_in * 1000;
  const patch = { driveAccessToken: access_token, driveTokenExpiry };
  // refresh_token is only present on first grant; preserve any existing one
  if (refresh_token) patch.driveRefreshToken = refresh_token;
  await chrome.storage.local.set(patch);
}

// ---------------------------------------------------------------------------
// Public: get a valid access token (cached or refreshed)
// ---------------------------------------------------------------------------

/**
 * Returns the stored access token if it has at least 60 seconds of validity
 * remaining. Otherwise silently refreshes using the config-hardcoded refresh
 * token (if set) or the one stored in chrome.storage.local from the OAuth flow.
 */
export async function getAccessToken() {
  const { driveAccessToken, driveTokenExpiry, driveRefreshToken } =
    await chrome.storage.local.get(['driveAccessToken', 'driveTokenExpiry', 'driveRefreshToken']);

  if (driveAccessToken && driveTokenExpiry && Date.now() < driveTokenExpiry - 60_000) {
    return driveAccessToken;
  }

  const refreshToken = CONFIG_REFRESH_TOKEN || driveRefreshToken;
  if (!refreshToken) throw new Error('Drive not authorized.');
  return refreshAccessToken(refreshToken);
}

async function refreshAccessToken(refreshToken) {
  const res = await fetch(TOKEN_ENDPOINT, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      client_id:     CLIENT_ID,
      client_secret: DRIVE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Token refresh failed: ${err.error_description ?? res.status}`);
  }

  const data = await res.json();
  // Merge with the token we used — refresh responses don't always echo it back
  await storeTokens({ refresh_token: refreshToken, ...data });
  return data.access_token;
}

// ---------------------------------------------------------------------------
// Drive API — internal request helper
// ---------------------------------------------------------------------------

async function driveRequest(path, options = {}) {
  const token = await getAccessToken();
  const res   = await fetch(`${DRIVE_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Drive API ${res.status}: ${JSON.stringify(err)}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Drive API — public helpers
// ---------------------------------------------------------------------------

/**
 * Fetches the Gmail address of the authenticated Google account by calling
 * the Drive /about endpoint. Used to verify the OAuth grant succeeded.
 */
async function fetchAuthorizedEmail() {
  const data = await driveRequest('/about?fields=user');
  return data.user.emailAddress;
}

/** Lists non-trashed files inside a Drive folder. */
export async function listFiles(folderId) {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  return driveRequest(
    `/files?q=${q}&fields=files(id,name,mimeType,modifiedTime)&orderBy=name`,
  );
}

/** Downloads and JSON-parses a Drive file. */
export async function readJsonFile(fileId) {
  const token = await getAccessToken();
  const res   = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Drive read failed: ${res.status}`);
  return res.json();
}

/**
 * Moves a file from one folder to another.
 * Both oldParentId and newParentId are required so Drive can update the
 * parents list atomically.
 */
export async function moveFile(fileId, newParentId, oldParentId) {
  const token = await getAccessToken();
  const url   =
    `${DRIVE_API_BASE}/files/${fileId}` +
    `?addParents=${encodeURIComponent(newParentId)}` +
    `&removeParents=${encodeURIComponent(oldParentId)}` +
    `&fields=id,parents`;

  const res = await fetch(url, {
    method:  'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive move failed: ${res.status}`);
  return res.json();
}

/** Downloads a binary Drive file (image/video) as a Blob. */
export async function downloadMedia(fileId) {
  const token = await getAccessToken();
  const res   = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Drive media download failed: ${res.status}`);
  return res.blob();
}

/**
 * Overwrites the content of an existing JSON file in Drive.
 * Used to annotate failed posts before moving them to /failed/.
 */
export async function updateJsonFile(fileId, content) {
  const token = await getAccessToken();
  const res   = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    {
      method:  'PATCH',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(content),
    },
  );
  if (!res.ok) throw new Error(`Drive file update failed: ${res.status}`);
  return res.json();
}
