/**
 * LinkPilot – URL Shortening Service
 * ============================================================
 * Provides a unified interface for shortening URLs via two
 * third-party APIs:
 *
 *   - TinyURL (https://tinyurl.com/api-create.php)
 *   - is.gd   (https://is.gd/create.php)
 *
 * Both APIs are free, require no API key, and return plain-text
 * short URLs via a simple GET request.
 *
 * Usage:
 *   import ShortenerService from './shortener.js';
 *   const short = await ShortenerService.shorten('https://long.example.com', 'tinyurl');
 *
 * @module shortener
 */

const ShortenerService = {

  /**
   * Shortens a URL using the specified provider.
   *
   * @param   {string}  url                   - The full URL to shorten. Must be http/https.
   * @param   {'tinyurl'|'isgd'} [provider='tinyurl'] - Which API to use.
   * @returns {Promise<{short: string, cleaned: boolean, original: string}>} - Result details.
   * @throws  {Error}                         - If the provider is unknown or the API fails.
   */
  async shorten(url, provider = 'tinyurl') {
    const { url: cleanedUrl, cleaned } = this.cleanUrl(url);

    const providers = {
      tinyurl: () => this._tinyurl(cleanedUrl),
      isgd:    () => this._isgd(cleanedUrl),
    };

    if (!providers[provider]) {
      throw new Error(`Unknown provider: "${provider}". Valid options: tinyurl, isgd.`);
    }

    const short = await providers[provider]();
    return { short, cleaned, original: cleanedUrl };
  },

  /**
   * Removes tracking query parameters (e.g., utm_*, fbclid, gclid) from a URL.
   *
   * @param   {string} urlStr - The input URL to clean.
   * @returns {{ url: string, cleaned: boolean }} The cleaned URL and whether tracking parameters were stripped.
   */
  cleanUrl(urlStr) {
    try {
      const url = new URL(urlStr);
      const params = new URLSearchParams(url.search);
      const trackingKeys = ['fbclid', 'gclid', 'msclkid', 'mc_eid'];

      let cleaned = false;

      // Remove specific known non-utm tracking parameters
      for (const key of trackingKeys) {
        if (params.has(key)) {
          params.delete(key);
          cleaned = true;
        }
      }

      // Remove all parameters starting with "utm_"
      for (const key of Array.from(params.keys())) {
        if (key.toLowerCase().startsWith('utm_')) {
          params.delete(key);
          cleaned = true;
        }
      }

      url.search = params.toString();
      let cleanedUrl = url.toString();
      
      // Clean up empty trailing search indicators
      if (cleanedUrl.endsWith('?')) {
        cleanedUrl = cleanedUrl.slice(0, -1);
      }

      return { url: cleanedUrl, cleaned };
    } catch {
      return { url: urlStr, cleaned: false };
    }
  },

  /**
   * Sends a request to the TinyURL API.
   *
   * Endpoint: GET https://tinyurl.com/api-create.php?url=<encoded_url>
   * Response: Plain text short URL (e.g. "https://tinyurl.com/abc123")
   *
   * @private
   * @param   {string}          url - The URL to shorten.
   * @returns {Promise<string>}     - The TinyURL short URL.
   * @throws  {Error}               - On HTTP error or unexpected response.
   */
  async _tinyurl(url) {
    const endpoint = `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`;

    const res = await fetch(endpoint);
    if (!res.ok) {
      throw new Error(`TinyURL: Request failed (HTTP ${res.status})`);
    }

    const text = await res.text();
    if (!text.startsWith('http')) {
      throw new Error('TinyURL: Received an unexpected response. The URL may be invalid.');
    }

    return text.trim();
  },

  /**
   * Sends a request to the is.gd API.
   *
   * Endpoint: GET https://is.gd/create.php?format=simple&url=<encoded_url>
   * Response: Plain text short URL (e.g. "https://is.gd/xyzabc") or an error string.
   *
   * @private
   * @param   {string}          url - The URL to shorten.
   * @returns {Promise<string>}     - The is.gd short URL.
   * @throws  {Error}               - On HTTP error or API-level error response.
   */
  async _isgd(url) {
    const endpoint = `https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`;

    const res = await fetch(endpoint);
    if (!res.ok) {
      throw new Error(`is.gd: Request failed (HTTP ${res.status})`);
    }

    const text = await res.text();

    // is.gd returns error messages in the format "Error: ..."
    if (text.startsWith('Error:')) {
      throw new Error(`is.gd: ${text.replace('Error: ', '')}`);
    }

    return text.trim();
  },

  /**
   * Checks whether a string is a valid http:// or https:// URL.
   *
   * Uses the built-in URL constructor for parsing.
   * Does NOT perform a network reachability check.
   *
   * @param   {string}  str - The string to validate.
   * @returns {boolean}     - `true` if the string is a valid http/https URL.
   *
   * @example
   * ShortenerService.isValidUrl('https://example.com'); // true
   * ShortenerService.isValidUrl('not a url');           // false
   * ShortenerService.isValidUrl('ftp://example.com');   // false
   */
  isValidUrl(str) {
    try {
      const url = new URL(str);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  },

};

export default ShortenerService;
