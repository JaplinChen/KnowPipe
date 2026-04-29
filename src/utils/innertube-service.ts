/**
 * YouTube InnerTube page-scrape fallback — no yt-dlp required.
 * Fetches video metadata from the YouTube watch page HTML when yt-dlp is unavailable.
 *
 * Captions: YouTube's caption URLs are session-locked and bot-protected.
 * They are only reliably accessible via yt-dlp. This service provides metadata only.
 */
import { logger } from '../core/logger.js';

const PAGE_TIMEOUT_MS = 15_000;

const PAGE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

// Matches the embedded ytInitialPlayerResponse object in the YouTube watch page.
// Covers both "ytInitialPlayerResponse = {...}; var " and "ytInitialPlayerResponse = {...};</script>"
const PLAYER_RESPONSE_RE =
  /ytInitialPlayerResponse\s*=\s*(\{.+?\});(?:\s*var\s|\s*<\/script)/s;

interface PlayerResponse {
  videoDetails?: {
    videoId: string;
    title: string;
    author: string;
    shortDescription?: string;
    lengthSeconds?: string;
    viewCount?: string;
    thumbnail?: { thumbnails: Array<{ url: string; width?: number; height?: number }> };
    keywords?: string[];
  };
  microformat?: {
    playerMicroformatRenderer?: {
      publishDate?: string;
      uploadDate?: string;
      description?: { simpleText?: string };
    };
  };
}

export interface InnerTubeMeta {
  id: string;
  title: string;
  author: string;
  description: string;
  lengthSeconds: number;
  viewCount: number;
  thumbnail: string;
  publishDate?: string;
  tags?: string[];
}

/** Fetch the YouTube watch page and extract ytInitialPlayerResponse. */
async function fetchPlayerResponse(videoId: string): Promise<PlayerResponse | null> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    const resp = await fetch(url, {
      headers: PAGE_HEADERS,
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
    });
    if (!resp.ok) {
      logger.warn('innertube', `page fetch returned ${resp.status}`, { videoId });
      return null;
    }
    const html = await resp.text();
    const match = html.match(PLAYER_RESPONSE_RE);
    if (!match) {
      logger.warn('innertube', 'ytInitialPlayerResponse not found in page', { videoId });
      return null;
    }
    return JSON.parse(match[1]) as PlayerResponse;
  } catch (err) {
    logger.warn('innertube', 'fetchPlayerResponse failed', { err: String(err).slice(0, 120) });
    return null;
  }
}

/**
 * Fetch video metadata without yt-dlp using the YouTube watch page HTML.
 * Returns metadata only — captions are not available via this path.
 */
export async function fetchInnerTubeMeta(videoId: string): Promise<InnerTubeMeta | null> {
  const data = await fetchPlayerResponse(videoId);
  const vd = data?.videoDetails;
  if (!vd) return null;

  const thumbs = vd.thumbnail?.thumbnails ?? [];
  const mf = data?.microformat?.playerMicroformatRenderer;

  // Prefer microformat description (often fuller); fall back to shortDescription
  const description = (mf?.description?.simpleText ?? vd.shortDescription ?? '').slice(0, 2000);
  const publishDate = (mf?.publishDate ?? mf?.uploadDate)?.slice(0, 10);

  return {
    id: vd.videoId,
    title: vd.title,
    author: vd.author,
    description,
    lengthSeconds: parseInt(vd.lengthSeconds ?? '0') || 0,
    viewCount: parseInt(vd.viewCount ?? '0') || 0,
    thumbnail: thumbs.at(-1)?.url ?? thumbs[0]?.url ?? '',
    publishDate,
    tags: vd.keywords?.slice(0, 20),
  };
}

/**
 * Stub kept for API compatibility. YouTube caption URLs are session-locked and
 * cannot be reliably accessed without yt-dlp's token negotiation.
 * Always returns null — callers should not expect captions from this path.
 */
export async function fetchInnerTubeTranscript(
  _videoId: string,
  _preferLangs?: string[],
): Promise<string | null> {
  return null;
}
