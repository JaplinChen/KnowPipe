/**
 * Post-processing pipeline: runs after extract, before AI enrichment + save.
 * Split into two phases:
 *   Phase 1 (fetchLinkedContent): must complete before AI enrichment so linked text can be injected.
 *   Phase 2 (runPostTranslation): runs in parallel with AI enrichment.
 */

import type { ExtractedContent } from '../extractors/types.js';
import { logger } from '../core/logger.js';
import { extractUrlsFromText, enrichLinkedUrls, type UrlEntry } from './link-enricher.js';
import { translateIfNeeded, translateBodyIfNeeded } from './translator.js';
import { canonicalizeUrl } from '../utils/url-canonicalizer.js';

export interface PostProcessOptions {
  enrichPostLinks: boolean;
  enrichCommentLinks: boolean;
  translate: boolean;
  maxLinkedUrls: number;
}

function collectUrls(content: ExtractedContent, opts: PostProcessOptions): UrlEntry[] {
  const entries: UrlEntry[] = [];
  const selfUrl = canonicalizeUrl(content.url);

  if (opts.enrichPostLinks) {
    for (const url of extractUrlsFromText(content.text)) {
      if (canonicalizeUrl(url) !== selfUrl) {
        entries.push({ url, source: 'post' });
      }
    }
  }

  if (opts.enrichCommentLinks && content.comments) {
    for (const c of content.comments) {
      for (const url of extractUrlsFromText(c.text)) {
        entries.push({ url, source: 'comment', mentionedBy: c.authorHandle });
      }
      for (const r of c.replies ?? []) {
        for (const url of extractUrlsFromText(r.text)) {
          entries.push({ url, source: 'comment', mentionedBy: r.authorHandle });
        }
      }
    }
  }

  const seen = new Set<string>();
  return entries.filter((e) => {
    const norm = canonicalizeUrl(e.url);
    if (seen.has(norm)) return false;
    seen.add(norm);
    return true;
  }).slice(0, opts.maxLinkedUrls);
}

/**
 * Phase 1: Fetch linked URL content (with fullText).
 * Must complete BEFORE AI enrichment so linked text can be injected into the prompt.
 */
export async function fetchLinkedContent(
  content: ExtractedContent,
  opts: Pick<PostProcessOptions, 'enrichPostLinks' | 'enrichCommentLinks' | 'maxLinkedUrls'>,
): Promise<void> {
  const urlEntries = collectUrls(content, { ...opts, translate: false });
  if (urlEntries.length === 0) return;

  const result = await Promise.race([
    enrichLinkedUrls(urlEntries),
    new Promise<null>((resolve) => {
      setTimeout(() => {
        logger.warn('post-process', '連結補充超時 (15s)，略過');
        resolve(null);
      }, 15_000);
    }),
  ]);

  if (result && Array.isArray(result) && result.length > 0) {
    content.linkedContent = result;
    logger.info('post-process', '補充連結完成', { count: result.length });
  }
}

/**
 * Phase 2: Translate title/text/body to Traditional Chinese.
 * Runs in parallel with AI enrichment (no dependency on linked content).
 */
export async function runPostTranslation(
  content: ExtractedContent,
  opts: Pick<PostProcessOptions, 'translate'>,
): Promise<void> {
  if (!opts.translate) return;

  const [translationResult, bodyTranslationResult] = await Promise.allSettled([
    translateIfNeeded(content.title, content.text),
    content.body ? translateBodyIfNeeded(content.body) : Promise.resolve(null),
  ]);

  if (translationResult.status === 'fulfilled' && translationResult.value) {
    content.translation = translationResult.value;
    logger.info('post-process', '翻譯完成', { language: translationResult.value.detectedLanguage });
  }

  if (bodyTranslationResult.status === 'fulfilled' && bodyTranslationResult.value) {
    content.body = bodyTranslationResult.value;
    logger.info('post-process', 'Body 翻譯完成');
  }
}

/** Combined convenience wrapper (Phase 1 + Phase 2 in parallel). */
export async function postProcess(
  content: ExtractedContent,
  opts: PostProcessOptions,
): Promise<void> {
  await Promise.allSettled([
    fetchLinkedContent(content, opts),
    runPostTranslation(content, opts),
  ]);
}
