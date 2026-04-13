// options/options.js
import { authenticate } from '../lib/drive.js';

const btnAuth        = document.getElementById('btn-auth');
const authStatus     = document.getElementById('auth-status');
const emailRow       = document.getElementById('email-row');
const authorizedEmail = document.getElementById('authorized-email');
const redirectUriEl  = document.getElementById('redirect-uri');
const btnCopyUri     = document.getElementById('btn-copy-uri');

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function init() {
  // Show the redirect URI the user needs to add to Google Cloud Console
  const redirectUri = chrome.identity.getRedirectURL();
  redirectUriEl.textContent = redirectUri;

  // Restore previously authorized email from storage (if any)
  const { driveAuthorizedEmail } = await chrome.storage.local.get('driveAuthorizedEmail');
  if (driveAuthorizedEmail) {
    showConnected(driveAuthorizedEmail);
  }
}

// ---------------------------------------------------------------------------
// Auth button
// ---------------------------------------------------------------------------

btnAuth.addEventListener('click', async () => {
  setStatus('Connecting…', 'pending');
  btnAuth.disabled = true;

  try {
    const email = await authenticate();
    showConnected(email);
    setStatus('Connected successfully.', 'success');
  } catch (err) {
    console.error('[Reddit Scheduler] Drive auth error:', err);
    setStatus(`Error: ${err.message}`, 'error');
  } finally {
    btnAuth.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// Copy redirect URI button
// ---------------------------------------------------------------------------

btnCopyUri.addEventListener('click', async () => {
  const uri = redirectUriEl.textContent;
  try {
    await navigator.clipboard.writeText(uri);
    btnCopyUri.textContent = 'Copied!';
    setTimeout(() => { btnCopyUri.textContent = 'Copy'; }, 2000);
  } catch {
    // Fallback for environments where clipboard API is restricted
    btnCopyUri.textContent = 'Copy failed';
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function showConnected(email) {
  authorizedEmail.textContent = email;
  emailRow.hidden = false;
  btnAuth.textContent = 'Reconnect Google Drive';
}

function setStatus(msg, type) {
  authStatus.textContent = msg;
  authStatus.className   = `status-msg status-${type}`;
  if (type === 'success' || type === 'error') {
    setTimeout(() => { authStatus.textContent = ''; authStatus.className = 'status-msg'; }, 5000);
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

init();
