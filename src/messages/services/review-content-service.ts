/**
 * Quality review service — "門下省" in the pipeline.
 * Sits between enricher and saver. Reviews enriched fields,
 * auto-fixes via oMLX when issues are found, and never blocks saving.
 */
import type { ExtractedContent } from '../../extractors/types.js';
import type { AppConfig } from '../../utils/config.js';
import { logger } from '../../core/logger.js';
import { getUserConfig } from '../../utils/user-config.js';
import { isOmlxAvailable, omlxChatCompletion } from '../../utils/omlx-client.js';

/* ── Types ─────────────────────────────────────────────────────────── */

export interface ReviewIssue {
  field: 'summary' | 'category' | 'keywords';
  problem: string;
  severity: 'low' | 'medium' | 'high';
}

export interface ReviewResult {
  passed: boolean;
  issues: ReviewIssue[];
  autoFixed: boolean;
  fixedFields: string[];
  durationMs: number;
}

const PASS_RESULT: ReviewResult = {
  passed: true, issues: [], autoFixed: false, fixedFields: [], durationMs: 0,
};

const REVIEW_TIMEOUT_MS = 15_000;

/* ── Rule-based checks (zero LLM cost) ────────────────────────────── */

function runRuleBasedChecks(content: ExtractedContent): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const summary = content.enrichedSummary;
  const keywords = content.enrichedKeywords;

  // Empty or trivially short summary
  if (!summary || summary.length <= 10) {
    issues.push({ field: 'summary', problem: '摘要為空或過短', severity: 'high' });
  } else if (summary === content.title || summary.trim() === content.title.trim()) {
    issues.push({ field: 'summary', problem: '摘要與標題相同，無額外資訊', severity: 'medium' });
  }

  // Missing keywords
  if (!keywords || keywords.length === 0) {
    issues.push({ field: 'keywords', problem: '關鍵字為空', severity: 'medium' });
  }

  // Category fell to '其他' despite having substantial text
  if (content.category === '其他' && (content.text?.length ?? 0) > 200) {
    issues.push({ field: 'category', problem: '內容充足但分類為「其他」', severity: 'low' });
  }

  return issues;
}

/* ── LLM review (flash tier) ──────────────────────────────────────── */

function buildReviewPrompt(content: ExtractedContent): string {
  const textSnippet = (content.text ?? '').slice(0, 500);
  return `你是內容品質審查員。請檢查以下豐富化結果是否合理。

標題：${content.title}
分類：${content.category ?? '無'}
摘要：${content.enrichedSummary ?? '無'}
關鍵字：${(content.enrichedKeywords ?? []).join(', ') || '無'}

原始內容片段：
${textSnippet}

以 JSON 格式回覆，不要其他文字：
{"summaryOk":true/false,"summaryIssue":"問題描述（如有）","categoryOk":true/false,"categoryIssue":"問題描述（如有）","keywordsOk":true/false,"keywordsIssue":"問題描述（如有）"}`;
}

interface LlmReviewResult {
  summaryOk: boolean;
  summaryIssue?: string;
  categoryOk: boolean;
  categoryIssue?: string;
  keywordsOk: boolean;
  keywordsIssue?: string;
}

function parseReviewResponse(raw: string): LlmReviewResult | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as LlmReviewResult;
  } catch {
    return null;
  }
}

function llmResultToIssues(result: LlmReviewResult): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  if (!result.summaryOk && result.summaryIssue) {
    issues.push({ field: 'summary', problem: result.summaryIssue, severity: 'medium' });
  }
  if (!result.categoryOk && result.categoryIssue) {
    issues.push({ field: 'category', problem: result.categoryIssue, severity: 'low' });
  }
  if (!result.keywordsOk && result.keywordsIssue) {
    issues.push({ field: 'keywords', problem: result.keywordsIssue, severity: 'medium' });
  }
  return issues;
}

/* ── Auto-fix (standard tier) ─────────────────────────────────────── */

function buildFixPrompt(content: ExtractedContent, issues: ReviewIssue[]): string {
  const textSnippet = (content.text ?? '').slice(0, 1200);
  const failedFields = issues.map(i => i.field);
  const fieldsDesc = failedFields.join(', ');

  return `根據以下內容，重新生成有問題的欄位（${fieldsDesc}）。

標題：${content.title}
原始內容：
${textSnippet}

問題：
${issues.map(i => `- ${i.field}：${i.problem}`).join('\n')}

以 JSON 格式回覆，只包含需要修正的欄位：
{${failedFields.includes('summary') ? '"summary":"一句話精確摘要",' : ''}${failedFields.includes('keywords') ? '"keywords":["關鍵字1","關鍵字2","關鍵字3"],' : ''}${failedFields.includes('category') ? '"category":"建議分類",' : ''}}

注意：摘要必須用繁體中文，具體描述內容要點，不要空泛。關鍵字 3-5 個，反映核心主題。`;
}

interface FixResult {
  summary?: string;
  keywords?: string[];
  category?: string;
}

function parseFixResponse(raw: string): FixResult | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as FixResult;
  } catch {
    return null;
  }
}

function applyFix(content: ExtractedContent, fix: FixResult): string[] {
  const fixed: string[] = [];
  if (fix.summary && fix.summary.length > 10) {
    content.enrichedSummary = fix.summary;
    fixed.push('summary');
  }
  if (fix.keywords && Array.isArray(fix.keywords) && fix.keywords.length > 0) {
    content.enrichedKeywords = fix.keywords;
    fixed.push('keywords');
  }
  // Category auto-fix is intentionally NOT applied — classifier rules are authoritative
  return fixed;
}

/* ── Main exported function ───────────────────────────────────────── */

export async function reviewEnrichedContent(
  content: ExtractedContent,
  _config: AppConfig,
): Promise<ReviewResult> {
  // Guard: feature disabled
  if (!getUserConfig().features.qualityReview) return PASS_RESULT;

  const start = Date.now();

  try {
    return await Promise.race([
      doReview(content),
      new Promise<ReviewResult>(resolve =>
        setTimeout(() => {
          logger.warn('review', '品質審查超時，跳過');
          resolve({ ...PASS_RESULT, durationMs: Date.now() - start });
        }, REVIEW_TIMEOUT_MS),
      ),
    ]);
  } catch (err) {
    logger.warn('review', '品質審查異常', { err: (err as Error).message });
    return { ...PASS_RESULT, durationMs: Date.now() - start };
  }
}

async function doReview(content: ExtractedContent): Promise<ReviewResult> {
  const start = Date.now();
  let allIssues = runRuleBasedChecks(content);

  // If rule checks pass, try LLM review for semantic issues
  if (allIssues.length === 0 && await isOmlxAvailable()) {
    const prompt = buildReviewPrompt(content);
    const raw = await omlxChatCompletion(prompt, { model: 'flash', timeoutMs: 8_000 });
    if (raw) {
      const parsed = parseReviewResponse(raw);
      if (parsed) {
        allIssues = llmResultToIssues(parsed);
      }
    }
  }

  // No issues found
  if (allIssues.length === 0) {
    return { passed: true, issues: [], autoFixed: false, fixedFields: [], durationMs: Date.now() - start };
  }

  logger.info('review', '發現品質問題', { issues: allIssues.map(i => `${i.field}:${i.severity}`) });

  // Auto-fix attempt
  if (await isOmlxAvailable()) {
    const fixPrompt = buildFixPrompt(content, allIssues);
    const fixRaw = await omlxChatCompletion(fixPrompt, { model: 'standard', timeoutMs: 12_000 });
    if (fixRaw) {
      const fix = parseFixResponse(fixRaw);
      if (fix) {
        const fixedFields = applyFix(content, fix);
        if (fixedFields.length > 0) {
          // Re-check after fix
          const remaining = runRuleBasedChecks(content);
          logger.info('review', '自動修復完成', { fixedFields, remaining: remaining.length });
          return {
            passed: remaining.length === 0,
            issues: remaining,
            autoFixed: true,
            fixedFields,
            durationMs: Date.now() - start,
          };
        }
      }
    }
  }

  // Auto-fix unavailable or failed — return issues (save will proceed anyway)
  return {
    passed: false,
    issues: allIssues,
    autoFixed: false,
    fixedFields: [],
    durationMs: Date.now() - start,
  };
}
