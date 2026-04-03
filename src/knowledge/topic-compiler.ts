/**
 * Topic compiler — Karpathy-inspired knowledge compilation.
 * Takes raw notes grouped by category and compiles them into structured
 * topic overviews with cross-note insights, tool comparison tables,
 * actionable suggestions, and knowledge gap identification.
 *
 * raw notes → compiled topic overviews (one per category with ≥3 notes)
 */
import { logger } from '../core/logger.js';
import { runLocalLlmPrompt } from '../utils/local-llm.js';
import { saveReportToVault } from './report-saver.js';
import {
  collectRecentNotes, groupByCategory, type NoteSummary,
} from '../commands/digest-command.js';

/* ── Types ────────────────────────────────────────────────── */

export interface TopicCompilation {
  topic: string;
  noteCount: number;
  compiled: string;
}

export interface CompilationResult {
  date: string;
  daysBack: number;
  totalNotes: number;
  compiledTopics: TopicCompilation[];
  skippedTopics: string[];
  savedPath?: string;
}

interface CompileOptions {
  daysBack?: number;
  filterCategory?: string;
  minNotes?: number;
  maxTopics?: number;
}

const MIN_NOTES_DEFAULT = 3;
const MAX_TOPICS_DEFAULT = 8;

/* ── LLM prompt ──────────────────────────────────────────── */

function buildCompilePrompt(topic: string, notes: NoteSummary[]): string {
  const noteList = notes
    .map(n => {
      const parts = [`標題：${n.title}`];
      if (n.summary) parts.push(`摘要：${n.summary.slice(0, 120)}`);
      return parts.join(' | ');
    })
    .join('\n');

  return [
    '你是知識編譯器。將以下同主題的多篇筆記編譯成一份結構化主題綜述。',
    `主題：${topic}（共 ${notes.length} 篇筆記）`,
    '',
    '必須使用繁體中文。嚴格按照以下結構輸出 markdown：',
    '',
    '### 現況概覽',
    '一段話描述這個主題的當前狀態和趨勢（80-150字）。',
    '',
    '### 核心工具與方案',
    '| 工具/方案 | 特點 | 來源筆記 |',
    '|-----------|------|----------|',
    '（3-8 行，每行引用一個具體工具或方案，「來源筆記」用 [[筆記標題]] 格式）',
    '',
    '### 關鍵洞察',
    '- 洞察 1（引用筆記之間的交叉發現，標明來源 [[筆記A]] + [[筆記B]]）',
    '- 洞察 2',
    '- 洞察 3',
    '（2-4 條，每條有具體引用依據）',
    '',
    '### 建議行動',
    '- 可執行的下一步（2-3 條）',
    '',
    '### 知識缺口',
    '- 還缺什麼資料才能做出更好的判斷（1-2 條）',
    '',
    '注意：',
    '- 「來源筆記」欄位必須用 [[筆記標題]] 的 wiki link 格式',
    '- 不要捏造筆記中沒有的資訊',
    '- 關鍵洞察要有跨筆記的交叉分析，不是單純重述',
    '',
    '筆記清單：',
    noteList,
  ].join('\n');
}

/* ── Single topic compilation ────────────────────────────── */

async function compileTopic(
  topic: string,
  notes: NoteSummary[],
): Promise<TopicCompilation | null> {
  const prompt = buildCompilePrompt(topic, notes);

  const result = await runLocalLlmPrompt(prompt, {
    timeoutMs: 120_000,
    model: 'deep',
    maxTokens: 2048,
  });

  if (!result) {
    logger.warn('topic-compiler', '主題編譯 LLM 失敗', { topic });
    return null;
  }

  return { topic, noteCount: notes.length, compiled: result.trim() };
}

/* ── Assemble full report ────────────────────────────────── */

function assembleReport(
  compilations: TopicCompilation[],
  totalNotes: number,
  daysBack: number,
): string {
  const lines: string[] = [
    `> 涵蓋最近 ${daysBack} 天、共 ${totalNotes} 篇筆記，` +
    `編譯了 ${compilations.length} 個主題`,
    '',
  ];

  for (const comp of compilations) {
    lines.push(`## ${comp.topic}（${comp.noteCount} 篇）`);
    lines.push('');
    lines.push(comp.compiled);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

/* ── Main export ─────────────────────────────────────────── */

export async function compileTopics(
  vaultPath: string,
  options: CompileOptions = {},
): Promise<CompilationResult> {
  const daysBack = options.daysBack ?? 7;
  const minNotes = options.minNotes ?? MIN_NOTES_DEFAULT;
  const maxTopics = options.maxTopics ?? MAX_TOPICS_DEFAULT;

  const notes = await collectRecentNotes(vaultPath, daysBack);
  const groups = groupByCategory(notes);

  // Filter by category if specified
  const filtered = options.filterCategory
    ? Object.fromEntries(
        Object.entries(groups).filter(([cat]) =>
          cat.toLowerCase().includes(options.filterCategory!.toLowerCase()),
        ),
      )
    : groups;

  // Sort by note count descending, pick groups with ≥ minNotes
  const eligible = Object.entries(filtered)
    .filter(([, g]) => g.length >= minNotes)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, maxTopics);

  const skipped = Object.entries(filtered)
    .filter(([, g]) => g.length < minNotes)
    .map(([cat, g]) => `${cat}(${g.length})`);

  logger.info('topic-compiler', '開始主題編譯', {
    total: notes.length, eligible: eligible.length, skipped: skipped.length,
  });

  // Compile topics sequentially (LLM calls are expensive)
  const compilations: TopicCompilation[] = [];
  for (const [topic, topicNotes] of eligible) {
    const result = await compileTopic(topic, topicNotes);
    if (result) compilations.push(result);
  }

  const date = new Date().toISOString().slice(0, 10);
  let savedPath: string | undefined;

  if (compilations.length > 0) {
    const content = assembleReport(compilations, notes.length, daysBack);
    savedPath = await saveReportToVault(vaultPath, {
      title: `知識編譯 ${date}`,
      date,
      content,
      tags: ['knowledge', 'compiled', 'auto-generated'],
      filePrefix: 'compiled',
      subtitle: `${compilations.length} 個主題 | ${notes.length} 篇筆記 | 最近 ${daysBack} 天`,
    });
  }

  return {
    date,
    daysBack,
    totalNotes: notes.length,
    compiledTopics: compilations,
    skippedTopics: skipped,
    savedPath,
  };
}
