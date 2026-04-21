/**
 * Cloudflare bot challenge detection.
 *
 * Called in web-extractor, jina-reader, and html-to-markdown to reject
 * CF challenge pages before they get saved as garbage content.
 */

// Signatures unique to Cloudflare Managed Challenge / JS Challenge pages.
// Conservative set to avoid false positives on pages that mention Cloudflare.
const CF_HTML_SIGNATURES = [
  'window._cf_chl_opt',
  '/cdn-cgi/challenge-platform',
] as const;

/** Check raw HTML for Cloudflare bot challenge markers. */
export function isCloudflareChallenge(html: string): boolean {
  const sample = html.length > 8000 ? html.slice(0, 8000) : html;
  return CF_HTML_SIGNATURES.some((sig) => sample.includes(sig));
}

/** Check a Jina Reader markdown result for CF challenge content. */
export function isCloudflareMarkdown(title: string, content: string): boolean {
  if (title === 'Just a moment...') return true;
  // Short content that contains the CF verification message
  if (content.length < 1000 && content.includes('Performing security verification')) return true;
  return false;
}
