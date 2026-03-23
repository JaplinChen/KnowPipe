/**
 * Cloudflare Browser Rendering API client.
 * Optional fallback for JS-rendered pages — only activated when
 * CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are set in .env.
 * Supports React/Vue dynamic sites, returns rendered HTML.
 */

import { fetchWithTimeout } from './fetch-with-timeout.js';

/**
 * Fetch rendered HTML from Cloudflare Browser Rendering API.
 * Returns null if credentials are missing or the request fails.
 */
export async function fetchHtmlWithCloudflare(url: string): Promise<string | null> {
  const token = process.env['CLOUDFLARE_API_TOKEN'];
  const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
  if (!token || !accountId) return null;

  try {
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/content`;
    const res = await fetchWithTimeout(endpoint, 30_000, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });

    if (!res.ok) return null;

    const data = await res.json() as { success?: boolean; result?: { content?: string } };
    return data.result?.content ?? null;
  } catch {
    return null;
  }
}
