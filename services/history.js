/**
 * LinkPilot – History Service
 * ============================================================
 * Manages a persistent list of previously shortened links using
 * the browser's localStorage API.
 *
 * Data format (array of HistoryEntry objects stored as JSON):
 * [
 *   {
 *     id:       number,   // Unix timestamp used as unique ID
 *     original: string,   // The original long URL
 *     short:    string,   // The generated short URL
 *     provider: string,   // "tinyurl" | "isgd"
 *     date:     string,   // ISO 8601 timestamp
 *   },
 *   ...
 * ]
 *
 * Storage key:  "linkpilot_history"
 * Maximum entries retained: 50 (oldest are dropped automatically)
 *
 * Usage:
 *   import HistoryService from './history.js';
 *   HistoryService.add({ original: '...', short: '...', provider: 'tinyurl' });
 *   const all = HistoryService.getAll();
 *
 * @module history
 */

/** @constant {string} localStorage key used to persist history data */
const STORAGE_KEY = 'linkpilot_history';

/**
 * Maximum number of entries to retain.
 * When this limit is exceeded, the oldest entry (last item) is removed.
 * @constant {number}
 */
const MAX_ENTRIES = 50;

/**
 * @typedef {Object} HistoryEntry
 * @property {number} id        - Unique identifier (Unix timestamp in ms).
 * @property {string} original  - The original long URL that was shortened.
 * @property {string} short     - The resulting short URL.
 * @property {string} provider  - The provider used: "tinyurl" or "isgd".
 * @property {string} date      - ISO 8601 creation timestamp.
 */

const HistoryService = {

  /**
   * Retrieves all history entries from localStorage.
   *
   * Returns an empty array if localStorage is unavailable, the key
   * does not exist, or the stored value is malformed JSON.
   *
   * @returns {HistoryEntry[]} Array of history entries, newest first.
   */
  getAll() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      // JSON.parse failed (corrupted data) – return empty array
      return [];
    }
  },

  /**
   * Adds a new entry to the top of the history list.
   *
   * The entry is prepended (newest first) and the list is capped at
   * MAX_ENTRIES by removing the last (oldest) item if necessary.
   *
   * @param {{ original: string, short: string, provider: string }} entry
   *   The data for the new history entry. `id` and `date` are assigned here.
   * @returns {void}
   *
   * @example
   * HistoryService.add({
   *   original: 'https://very-long-url.example.com/path',
   *   short:    'https://tinyurl.com/abc123',
   *   provider: 'tinyurl',
   * });
   */
  add(entry) {
    const history = this.getAll();

    // Build the complete entry with auto-generated id and date
    history.unshift({
      id:       Date.now(),
      original: entry.original,
      short:    entry.short,
      provider: entry.provider,
      date:     new Date().toISOString(),
    });

    // Enforce maximum entry count
    if (history.length > MAX_ENTRIES) {
      history.pop();  // Remove the oldest entry
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  },

  /**
   * Removes a single history entry by its ID.
   *
   * If no entry with the given ID exists, the operation is a no-op.
   *
   * @param {number} id - The `id` of the entry to remove.
   * @returns {void}
   */
  delete(id) {
    const history = this.getAll().filter(entry => entry.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  },

  /**
   * Removes all history entries from localStorage.
   *
   * @returns {void}
   */
  clear() {
    localStorage.removeItem(STORAGE_KEY);
  },

};

export default HistoryService;
