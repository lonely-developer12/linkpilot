/**
 * LinkPilot – Main Application Controller
 * ============================================================
 * Entry point for all UI logic. Orchestrates interaction between:
 *   - ShortenerService  (API calls to TinyURL / is.gd)
 *   - HistoryService    (localStorage read/write)
 *   - ClipboardService  (copy-to-clipboard helper)
 *   - qrcodejs          (DOM-based QR code rendering, loaded via CDN script tag)
 *
 * Architecture note:
 *   This file is intentionally kept as a "controller" layer.
 *   All network and storage logic lives in ./services/.
 *   UI helpers (toast, loading state, error display) are kept local
 *   to this file since they depend directly on DOM elements.
 *
 * @module app
 */

import ShortenerService from './services/shortener.js';
import HistoryService   from './services/history.js';
import ClipboardService from './services/clipboard.js';

// ============================================================
// DOM ELEMENT REFERENCES
// Cached at module load time for performance.
// ============================================================

/** @type {HTMLInputElement} Main URL text input */
const urlInput        = document.getElementById('url-input');

/** @type {HTMLSelectElement} Provider selection dropdown */
const providerSelect  = document.getElementById('provider-select');

/** @type {HTMLButtonElement} Primary "Shorten link" button */
const shortenBtn      = document.getElementById('shorten-btn');

/** @type {HTMLElement} Result section container */
const resultSection   = document.getElementById('result-section');

/** @type {HTMLAnchorElement} Displays the generated short URL */
const shortUrlDisplay = document.getElementById('short-url');

/** @type {HTMLButtonElement} Copies the short URL to clipboard */
const copyBtn         = document.getElementById('copy-btn');

/** @type {HTMLButtonElement} Toggles the QR code panel */
const qrBtn           = document.getElementById('qr-btn');

/** @type {HTMLElement} QR code wrapper panel */
const qrContainer     = document.getElementById('qr-container');

/** @type {HTMLElement} Target element where qrcodejs injects the QR image */
const qrCanvas        = document.getElementById('qr-canvas');

/** @type {HTMLElement} History list container */
const historyList     = document.getElementById('history-list');

/** @type {HTMLButtonElement} Clears all history entries */
const clearHistoryBtn = document.getElementById('clear-history-btn');

/** @type {HTMLElement} History section wrapper */
const historySection  = document.getElementById('history-section');

/** @type {HTMLElement} Toast notification element */
const toast           = document.getElementById('toast');

/** @type {HTMLElement} Live character counter below the input */
const charCount       = document.getElementById('char-count');

/** @type {HTMLElement} Inline validation error message container */
const inputError      = document.getElementById('input-error');

/** @type {HTMLElement} CSS spinner shown during API requests */
const loadingSpinner  = document.getElementById('loading-spinner');

// ============================================================
// MODULE STATE
// ============================================================

/** @type {string} The most recently generated short URL */
let currentShortUrl = '';

/**
 * Tracks whether a QR code has been generated for the current short URL.
 * Reset to `false` whenever a new URL is shortened.
 * @type {boolean}
 */
let qrGenerated = false;

/** @type {QRCode|null} Reference to the active qrcodejs instance */
let qrCodeInstance = null;

// ============================================================
// INITIALIZATION
// ============================================================

/**
 * Bootstraps the application.
 * Called immediately when the module loads.
 */
function init() {
  renderHistory();
  setupEventListeners();
  registerServiceWorker();
}

/**
 * Registers the PWA Service Worker for offline capability.
 */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          console.log('Service Worker registered successfully:', reg.scope);
        })
        .catch((err) => {
          console.error('Service Worker registration failed:', err);
        });
    });
  }
}


// ============================================================
// EVENT LISTENERS
// ============================================================

/**
 * Attaches all DOM event listeners.
 * Kept in a single function to make event wiring easy to audit.
 */
function setupEventListeners() {
  // Update character counter and clear any validation error as user types
  urlInput.addEventListener('input', () => {
    charCount.textContent = `${urlInput.value.length} characters`;
    if (inputError.style.display === 'flex') {
      inputError.style.display = 'none';
      urlInput.classList.remove('input-error');
    }
  });

  // Allow pressing Enter to trigger shortening
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') shortenUrl();
  });

  shortenBtn.addEventListener('click', shortenUrl);
  copyBtn.addEventListener('click', copyShortUrl);
  qrBtn.addEventListener('click', toggleQR);
  clearHistoryBtn.addEventListener('click', clearHistory);

  /**
   * Auto-paste from clipboard when the input is focused and empty.
   * Only runs if the browser grants clipboard-read permission.
   * Silently ignores permission denied errors.
   */
  urlInput.addEventListener('focus', async () => {
    if (!urlInput.value && navigator.clipboard) {
      try {
        const text = await navigator.clipboard.readText();
        if (ShortenerService.isValidUrl(text)) {
          urlInput.value = text;
          charCount.textContent = `${text.length} characters`;
          showToast('📋 URL pasted from clipboard', 'info');
        }
      } catch {
        // Permission denied or clipboard API unavailable – silently skip
      }
    }
  });
}

// ============================================================
// CORE FEATURE: URL SHORTENING
// ============================================================

/**
 * Validates the input URL, calls the selected shortening provider,
 * saves the result to history, and renders the result section.
 *
 * @async
 * @returns {Promise<void>}
 */
async function shortenUrl() {
  const url = urlInput.value.trim();

  // Guard: empty input
  if (!url) {
    showError('Please enter a URL.');
    return;
  }

  // Guard: invalid URL format
  if (!ShortenerService.isValidUrl(url)) {
    showError('Invalid URL. Must start with https:// or http://');
    return;
  }

  // Clear previous error state and start loading indicator
  setLoading(true);
  inputError.style.display = 'none';
  urlInput.classList.remove('input-error');

  try {
    const provider = providerSelect.value;
    const { short, cleaned, original } = await ShortenerService.shorten(url, provider);

    // Update state
    currentShortUrl = short;
    qrGenerated     = false;
    qrCodeInstance  = null;

    // Hide the QR panel (new URL = new QR needed)
    qrContainer.style.display = 'none';
    qrBtn.textContent = '⬛ QR Code';
    qrCanvas.innerHTML = '';

    // Display the result
    shortUrlDisplay.textContent = short;
    shortUrlDisplay.href        = short;
    resultSection.classList.add('visible');

    // Persist to history using the cleaned original URL
    HistoryService.add({ original, short, provider });

    // Refresh history list and stats
    renderHistory();
    document.dispatchEvent(new CustomEvent('linkpilot:history-updated'));

    if (cleaned) {
      showToast('🧹 Tracking parameters stripped for privacy!', 'success');
    } else {
      showToast('✅ Link shortened successfully!', 'success');
    }
  } catch (err) {
    showError(`Error: ${err.message}`);
    showToast(`❌ ${err.message}`, 'error');
  } finally {
    setLoading(false);
  }
}

// ============================================================
// COPY TO CLIPBOARD
// ============================================================

/**
 * Copies the current short URL to the clipboard.
 * Provides visual feedback by temporarily changing the button text.
 *
 * @async
 * @returns {Promise<void>}
 */
async function copyShortUrl() {
  if (!currentShortUrl) return;

  const success = await ClipboardService.copy(currentShortUrl);

  if (success) {
    // Temporarily show a "Copied!" state on the button
    copyBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
           fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      Copied!
    `;
    copyBtn.classList.add('copied');
    showToast('📋 Copied to clipboard!', 'success');

    // Revert after 2 seconds
    setTimeout(() => {
      copyBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        Copy
      `;
      copyBtn.classList.remove('copied');
    }, 2000);
  } else {
    showToast('❌ Copy failed – please copy manually', 'error');
  }
}

// ============================================================
// QR CODE
// ============================================================

/**
 * Toggles the QR code panel open/closed.
 *
 * On first open, generates a QR code using qrcodejs (loaded as a global
 * via the CDN <script> tag in index.html). qrcodejs renders a DOM <img>
 * element – no canvas, no CORS, works completely offline once the library
 * is loaded.
 *
 * The QR code is cached (qrGenerated flag) so it is only generated once
 * per shortened URL, preventing unnecessary re-renders.
 *
 * Color scheme: light text (#e2e8f0) on dark background (#1a1a2e)
 * to match the application's dark theme.
 */
function toggleQR() {
  // If panel is already open, close it
  if (qrContainer.style.display === 'block') {
    qrContainer.style.display = 'none';
    qrBtn.textContent = '⬛ QR Code';
    return;
  }

  // Open the panel
  qrContainer.style.display = 'block';
  qrBtn.textContent = '✕ Close QR';

  // Only generate once per shortened URL
  if (!qrGenerated) {
    // Clear any previous QR render
    qrCanvas.innerHTML = '';
    qrCodeInstance = null;

    /**
     * qrcodejs renders directly into the target <div>.
     * It creates an <img> (and a hidden <canvas> fallback internally).
     * The <img> is what the user sees – fully CORS-safe.
     *
     * @see https://github.com/davidshimjs/qrcodejs
     */
    qrCodeInstance = new QRCode(qrCanvas, {   // QRCode is a global from the CDN script
      text:         currentShortUrl,
      width:        180,
      height:       180,
      colorDark:    '#e2e8f0',                // light foreground (matches --text-primary)
      colorLight:   '#1a1a2e',                // dark background (matches app bg)
      correctLevel: QRCode.CorrectLevel.M,   // Medium error correction
    });

    qrGenerated = true;
  }
}

// ============================================================
// HISTORY
// ============================================================

/**
 * Reads all history entries from HistoryService and rebuilds the
 * history list in the DOM. If there are no entries, the history
 * section is hidden entirely.
 *
 * Each entry renders:
 *   - Original (long) URL – truncated
 *   - Short URL – clickable link
 *   - Provider badge + timestamp
 *   - Copy and delete icon buttons
 */
function renderHistory() {
  const entries = HistoryService.getAll();

  if (entries.length === 0) {
    historySection.style.display = 'none';
    return;
  }

  historySection.style.display = 'block';

  historyList.innerHTML = entries.map(entry => `
    <div class="history-item" id="history-${entry.id}" role="listitem">
      <div class="history-item-content">
        <div class="history-original" title="${entry.original}">
          ${truncate(entry.original, 55)}
        </div>
        <a href="${entry.short}" target="_blank" rel="noopener noreferrer" class="history-short">
          ${entry.short}
        </a>
        <div class="history-meta">
          <span class="history-provider ${entry.provider}">
            ${entry.provider === 'tinyurl' ? 'TinyURL' : 'is.gd'}
          </span>
          <span class="history-date">${formatDate(entry.date)}</span>
        </div>
      </div>
      <div class="history-actions">
        <!-- Copy button -->
        <button
          class="icon-btn"
          title="Copy short link"
          aria-label="Copy ${entry.short}"
          onclick="window.linkpilot.copyHistoryUrl('${entry.short}')"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        </button>
        <!-- Delete button -->
        <button
          class="icon-btn icon-btn-danger"
          title="Delete entry"
          aria-label="Delete history entry for ${entry.short}"
          onclick="window.linkpilot.deleteHistoryEntry(${entry.id})"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');
}

/**
 * Clears all history entries and hides the history section.
 */
function clearHistory() {
  HistoryService.clear();
  renderHistory();
  showToast('🗑️ History cleared', 'info');
}

// ============================================================
// GLOBAL API
// Exposes functions needed by inline onclick handlers in the
// history list (which is rendered as an HTML string and cannot
// use module-scope references directly).
// ============================================================

/**
 * @namespace window.linkpilot
 * Public API attached to window for use by dynamically rendered HTML.
 */
window.linkpilot = {
  /**
   * Copies a history entry's short URL to the clipboard.
   * @param {string} url - The short URL to copy.
   */
  copyHistoryUrl: async (url) => {
    const ok = await ClipboardService.copy(url);
    if (ok) {
      showToast('📋 Copied!', 'success');
    } else {
      showToast('❌ Copy failed', 'error');
    }
  },

  /**
   * Deletes a single history entry and animates its removal.
   * @param {number} id - The unique ID of the history entry.
   */
  deleteHistoryEntry: (id) => {
    HistoryService.delete(id);
    const el = document.getElementById(`history-${id}`);
    if (el) {
      el.style.animation = 'slideOut 0.3s ease forwards';
      setTimeout(() => {
        renderHistory();
        document.dispatchEvent(new CustomEvent('linkpilot:history-updated'));
      }, 300);
    }
  },
};

// ============================================================
// UI HELPERS
// ============================================================

/**
 * Sets the loading state of the shorten button.
 * Shows/hides the spinner and disables/enables the button.
 *
 * @param {boolean} isLoading - `true` to show loading, `false` to reset.
 */
function setLoading(isLoading) {
  if (isLoading) {
    shortenBtn.disabled = true;
    loadingSpinner.style.display = 'inline-block';
    shortenBtn.querySelector('.btn-text').textContent = 'Shortening...';
  } else {
    shortenBtn.disabled = false;
    loadingSpinner.style.display = 'none';
    shortenBtn.querySelector('.btn-text').textContent = 'Shorten link';
  }
}

/**
 * Displays an inline validation error below the URL input.
 *
 * @param {string} message - The error message to display.
 */
function showError(message) {
  inputError.querySelector('.error-text').textContent = message;
  inputError.style.display = 'flex';
  urlInput.classList.add('input-error');
  urlInput.focus();
}

/**
 * Timeout handle for the auto-dismiss timer on the toast.
 * @type {ReturnType<typeof setTimeout>|null}
 */
let toastTimeout = null;

/**
 * Shows a floating toast notification at the bottom of the screen.
 * Automatically dismisses after 3 seconds.
 * Replaces any currently visible toast immediately.
 *
 * @param {string} message           - Text to display in the toast.
 * @param {'success'|'error'|'info'} type - Visual style variant.
 */
function showToast(message, type = 'info') {
  clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.className = `toast toast-${type} toast-visible`;
  toastTimeout = setTimeout(() => {
    toast.className = 'toast';
  }, 3000);
}

// ============================================================
// STRING UTILITIES
// ============================================================

/**
 * Truncates a string to `maxLen` characters, appending an ellipsis if needed.
 *
 * @param {string} str    - Input string.
 * @param {number} maxLen - Maximum allowed length before truncation.
 * @returns {string}
 */
function truncate(str, maxLen) {
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}

/**
 * Formats an ISO 8601 date string into a human-readable local date+time.
 * Uses the en-US locale with a DD/MM/YYYY HH:MM pattern.
 *
 * @param {string} iso - ISO date string (e.g. "2026-06-23T12:00:00.000Z")
 * @returns {string}   - e.g. "23/06/2026 14:05"
 */
function formatDate(iso) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  );
}

// ============================================================
// BOOTSTRAP
// ============================================================

init();
