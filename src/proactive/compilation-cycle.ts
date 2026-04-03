/**
 * Knowledge compilation cycle — periodic analysis, health reporting,
 * MOC generation, and consolidation.
 * Daily lightweight: analyze → health report → Telegram push.
 * Weekly full: + MOC generation + consolidation + long-term trends.
 */
import type { Telegraf } from 'telegraf';
import type { AppConfig } from '../utils/config.js';
import { getOwnerUserId } from '../utils/config.js';
import type { ProactiveConfig } from './proactive-types.js';
import { saveProactiveConfig } from './proactive-store.js';
import { runVaultAnalysis } from '../knowledge/vault-analyzer.js';
import { loadKnowledge } from '../knowledge/knowledge-store.js';
import { generateHealthReport, formatHealthReportTelegram, saveHealthReportNote } from '../knowledge/health-report.js';
import { generateThemeMocs } from '../knowledge/moc-generator.js';
import { shouldAutoConsolidate, consolidateVault } from '../knowledge/consolidator.js';
import { scanVaultNotes } from '../knowledge/knowledge-store.js';
import { detectLongTermTrends, type TopicTrend } from './trend-detector.js';
import { analyzeVaultTrends } from './trend-detector.js';
import { compileAllHighDensitySkills } from '../knowledge/skill-generator.js';
import { saveSkill } from '../skills/skill-store.js';
import { syncAllTargets, formatSyncResults } from '../skills/skill-sync.js';
import { logger } from '../core/logger.js';

export type CompilationMode = 'daily' | 'weekly';

/** Check if current time is within compilation hour (±30 min window). */
function isCompilationHour(hour: number): boolean {
  const now = new Date();
  return now.getHours() === hour && now.getMinutes() <= 30;
}

/** Check if compilation was already run today. */
function alreadyCompiledToday(lastAt: string | null): boolean {
  if (!lastAt) return false;
  const last = new Date(lastAt);
  const now = new Date();
  return last.getFullYear() === now.getFullYear()
    && last.getMonth() === now.getMonth()
    && last.getDate() === now.getDate();
}

/** Determine if this should be a weekly run (Sunday by default). */
function isWeeklyDay(pConfig: ProactiveConfig): boolean {
  return new Date().getDay() === pConfig.weeklyDigestDay;
}

/** Run knowledge compilation cycle (called from proactive service timer). */
export async function runCompilationCycle(
  bot: Telegraf,
  config: AppConfig,
  pConfig: ProactiveConfig,
): Promise<void> {
  const hour = pConfig.compilationHour ?? 8;
  if (!isCompilationHour(hour)) return;
  if (alreadyCompiledToday(pConfig.lastCompilationAt)) return;

  const mode: CompilationMode = isWeeklyDay(pConfig) ? 'weekly' : 'daily';
  logger.info('compilation', `開始${mode === 'weekly' ? '每週完整' : '每日輕量'}知識編譯`);

  try {
    // Step 1: Incremental vault analysis
    const analyzeResult = await runVaultAnalysis(config.vaultPath);
    const knowledge = await loadKnowledge();

    // Step 2: Health report
    const report = generateHealthReport(knowledge);
    await saveHealthReportNote(config.vaultPath, report);

    const lines: string[] = [
      `🔄 知識編譯完成（${mode === 'weekly' ? '完整版' : '輕量版'}）`,
      '',
      `📊 分析 ${analyzeResult.processed} 篇新筆記`,
      `🏥 健康分：${report.overallScore}/100`,
    ];

    // Weekly: additional steps
    if (mode === 'weekly') {
      // Step 3: Theme MOCs
      const mocs = await generateThemeMocs(config.vaultPath, knowledge, 5);
      if (mocs.length > 0) lines.push(`🗺 生成 ${mocs.length} 個主題 MOC`);

      // Step 4: Auto-consolidation
      if (shouldAutoConsolidate(knowledge)) {
        const notes = await scanVaultNotes(config.vaultPath);
        await consolidateVault(notes, knowledge);
        lines.push('🔗 已執行知識整合');
      }

      // Step 5: Long-term trends
      const { notes: trendNotes } = await analyzeVaultTrends(config.vaultPath);
      const longTrends = detectLongTermTrends(trendNotes);
      const rising = longTrends.filter(t => t.direction === 'rising').slice(0, 3);
      const declining = longTrends.filter(t => t.direction === 'declining').slice(0, 3);
      if (rising.length > 0) {
        lines.push('', '📈 上升趨勢：' + rising.map(t => t.keyword).join('、'));
      }
      if (declining.length > 0) {
        lines.push('📉 下降趨勢：' + declining.map(t => t.keyword).join('、'));
      }

      // Step 6: Compile knowledge → skills and sync
      try {
        const compiledSkills = compileAllHighDensitySkills(knowledge);
        for (const s of compiledSkills) await saveSkill(s);
        if (compiledSkills.length > 0) {
          const syncResults = await syncAllTargets(process.cwd());
          const totalSynced = syncResults.reduce((s, r) => s + r.synced, 0);
          lines.push(`🧩 編譯 ${compiledSkills.length} 個知識技能，同步 ${totalSynced} 個`);
        }
      } catch (err) {
        logger.warn('compilation', '技能編譯失敗', { message: (err as Error).message });
      }
    }

    // Push to Telegram
    const userId = getOwnerUserId(config);
    if (userId) {
      await bot.telegram.sendMessage(userId, lines.join('\n').slice(0, 4000));
    }

    pConfig.lastCompilationAt = new Date().toISOString();
    await saveProactiveConfig(pConfig);
    logger.info('compilation', '知識編譯完成', { mode, score: report.overallScore });
  } catch (err) {
    logger.warn('compilation', '知識編譯失敗', { message: (err as Error).message });
  }
}

/** Manual trigger — run compilation immediately (for /compile command). */
export async function runCompilationManual(
  config: AppConfig,
  mode: CompilationMode = 'weekly',
): Promise<{ report: ReturnType<typeof generateHealthReport>; summary: string }> {
  await runVaultAnalysis(config.vaultPath);
  const knowledge = await loadKnowledge();
  const report = generateHealthReport(knowledge);
  await saveHealthReportNote(config.vaultPath, report);

  const parts: string[] = [`健康分 ${report.overallScore}/100`];

  if (mode === 'weekly') {
    const mocs = await generateThemeMocs(config.vaultPath, knowledge, 5);
    parts.push(`${mocs.length} 個主題 MOC`);

    if (shouldAutoConsolidate(knowledge)) {
      const notes = await scanVaultNotes(config.vaultPath);
      await consolidateVault(notes, knowledge);
      parts.push('知識整合完成');
    }
  }

  return { report, summary: parts.join(' | ') };
}
