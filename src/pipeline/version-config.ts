/**
 * Pipeline version tracking.
 * Increment PIPELINE_VERSION when extractors or formatters change
 * to enable automatic detection of outdated vault notes.
 */

/** Current pipeline version. Bump when extractor/formatter logic changes. */
export const PIPELINE_VERSION = '1.0';

/** Version changelog for /doctor upgrade reporting. */
export const VERSION_LOG: Record<string, string> = {
  '1.0': '初始版本追蹤 — 啟用 pipeline_version frontmatter 欄位',
};
