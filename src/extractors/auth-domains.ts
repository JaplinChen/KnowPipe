/**
 * Domains that typically require authentication or have paywalls.
 * When a URL matches, the extractor will use Browser Use CLI with
 * the user's real browser profile to bypass login walls.
 */

/** Domains where content is frequently behind a paywall or login */
const AUTH_DOMAINS: readonly string[] = [
  // Paywalled publications
  'medium.com',
  'towardsdatascience.com',
  'betterprogramming.pub',
  'levelup.gitconnected.com',
  'javascript.plainenglish.io',
  // Chinese platforms requiring login
  'mp.weixin.qq.com',
  'weixin.qq.com',
  'feishu.cn',
  'larksuite.com',
  // Japanese/Korean
  'note.com',
  'zenn.dev',
  // Other paywalled
  'substack.com',
  'nytimes.com',
  'wsj.com',
  'bloomberg.com',
  'economist.com',
];

/**
 * Check if a URL belongs to a domain that typically needs authentication.
 * Matches against the hostname (ignoring www prefix).
 */
export function needsAuth(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return AUTH_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}
