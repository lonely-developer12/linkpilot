/**
 * LinkPilot – Clipboard Service
 * ============================================================
 * Provides a cross-browser utility for writing text to the
 * system clipboard.
 *
 * Strategy:
 *   1. Prefer the modern Clipboard API (navigator.clipboard.writeText)
 *      – available in secure contexts (HTTPS / localhost) with modern browsers.
 *   2. Fall back to the legacy execCommand('copy') approach via a
 *      temporarily created, off-screen <textarea> element.
 *      – Works in older browsers and non-HTTPS environments.
 *
 * Usage:
 *   import ClipboardService from './clipboard.js';
 *   const success = await ClipboardService.copy('https://tinyurl.com/abc123');
 *
 * @module clipboard
 */

const ClipboardService = {

  /**
   * Copies the given text string to the system clipboard.
   *
   * Attempts the modern Clipboard API first. Falls back to the legacy
   * execCommand method if the Clipboard API is unavailable or fails.
   *
   * @param   {string}           text - The text to write to the clipboard.
   * @returns {Promise<boolean>}      - Resolves to `true` on success, `false` on failure.
   *
   * @example
   * const ok = await ClipboardService.copy('https://tinyurl.com/abc123');
   * if (ok) console.log('Copied!');
   */
  async copy(text) {
    // --- Strategy 1: Modern Clipboard API ---
    // Requires a secure context (HTTPS or localhost) and browser support.
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Permission denied or API error – fall through to legacy method
      }
    }

    // --- Strategy 2: Legacy execCommand fallback ---
    // Creates a temporary off-screen <textarea>, selects its content,
    // and uses the deprecated but widely supported execCommand('copy').
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;

      // Position off-screen so it doesn't affect page layout
      textarea.style.position = 'fixed';
      textarea.style.top      = '-9999px';
      textarea.style.left     = '-9999px';
      textarea.style.opacity  = '0';

      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();

      const success = document.execCommand('copy');
      document.body.removeChild(textarea);

      return success;
    } catch {
      // Both methods failed
      return false;
    }
  },

};

export default ClipboardService;
