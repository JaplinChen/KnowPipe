/**
 * Skill sync — detect changes and push unified skills to target tool configs.
 * Supports Claude Code (.claude/skills/) and Codex (AGENTS.md).
 */
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { UnifiedSkill, SkillTarget, SkillIndex } from './skill-types.js';
import { loadSkillIndex, saveSkillIndex, loadSkill, markSynced } from './skill-store.js';
import { toClaudeSkillMd, toCodexInstructions } from './skill-converter.js';
import { logger } from '../core/logger.js';

/* ── Types ────────────────────────────────────────────────── */

export interface SyncTarget {
  target: SkillTarget;
  path: string;
  enabled: boolean;
}

export interface SyncResult {
  target: SkillTarget;
  synced: number;
  errors: string[];
}

/* ── Change detection ─────────────────────────────────────── */

/** Find skills that have been modified since last sync. */
export async function detectSkillChanges(index: SkillIndex): Promise<string[]> {
  const changed: string[] = [];

  for (const entry of index.skills) {
    if (!entry.lastSyncAt) {
      changed.push(entry.id);
      continue;
    }

    const skill = await loadSkill(entry.id);
    if (!skill) continue;

    // Check if content was updated after last sync
    if (new Date(skill.metadata.updatedAt) > new Date(entry.lastSyncAt)) {
      changed.push(entry.id);
    }
  }

  return changed;
}

/* ── Sync to Claude Code ──────────────────────────────────── */

async function syncToClaude(skills: UnifiedSkill[], projectPath: string): Promise<SyncResult> {
  const result: SyncResult = { target: 'claude', synced: 0, errors: [] };
  const skillsDir = join(projectPath, '.claude', 'skills');

  for (const skill of skills) {
    try {
      const dir = join(skillsDir, skill.id);
      await mkdir(dir, { recursive: true });
      const content = toClaudeSkillMd(skill);
      await writeFile(join(dir, 'SKILL.md'), content, 'utf-8');
      await markSynced(skill.id, 'claude');
      result.synced++;
    } catch (err) {
      result.errors.push(`${skill.id}: ${(err as Error).message}`);
    }
  }

  return result;
}

/* ── Sync to Codex ────────────────────────────────────────── */

async function syncToCodex(skills: UnifiedSkill[], projectPath: string): Promise<SyncResult> {
  const result: SyncResult = { target: 'codex', synced: 0, errors: [] };

  try {
    const content = toCodexInstructions(skills);
    await writeFile(join(projectPath, 'AGENTS.md'), content, 'utf-8');

    for (const skill of skills) {
      await markSynced(skill.id, 'codex');
    }
    result.synced = skills.length;
  } catch (err) {
    result.errors.push(`AGENTS.md: ${(err as Error).message}`);
  }

  return result;
}

/* ── Main sync ────────────────────────────────────────────── */

/** Get default sync targets based on project structure. */
export function getDefaultSyncTargets(projectPath: string): SyncTarget[] {
  return [
    { target: 'claude', path: projectPath, enabled: true },
    { target: 'codex', path: projectPath, enabled: true },
  ];
}

/** Sync a set of skills to a specific target. */
export async function syncToTarget(
  skills: UnifiedSkill[], target: SyncTarget,
): Promise<SyncResult> {
  switch (target.target) {
    case 'claude': return syncToClaude(skills, target.path);
    case 'codex': return syncToCodex(skills, target.path);
    default: return { target: target.target, synced: 0, errors: ['未知的同步目標'] };
  }
}

/** Sync all changed skills to all enabled targets. */
export async function syncAllTargets(
  projectPath: string,
  targets?: SyncTarget[],
): Promise<SyncResult[]> {
  const syncTargets = targets ?? getDefaultSyncTargets(projectPath);
  const index = await loadSkillIndex();
  const changedIds = await detectSkillChanges(index);

  if (changedIds.length === 0) {
    logger.info('skill-sync', '所有技能已同步，無變更');
    return [];
  }

  // Load changed skills
  const skills: UnifiedSkill[] = [];
  for (const id of changedIds) {
    const skill = await loadSkill(id);
    if (skill) skills.push(skill);
  }

  const results: SyncResult[] = [];
  for (const target of syncTargets) {
    if (!target.enabled) continue;
    const result = await syncToTarget(skills, target);
    results.push(result);
    logger.info('skill-sync', `同步到 ${target.target}: ${result.synced} 個技能`, {
      errors: result.errors.length,
    });
  }

  return results;
}

/** Format sync results for Telegram message. */
export function formatSyncResults(results: SyncResult[]): string {
  if (results.length === 0) return '所有技能已同步，無需更新。';

  const lines: string[] = ['🔄 技能同步結果', ''];
  for (const r of results) {
    const status = r.errors.length === 0 ? '✅' : '⚠️';
    lines.push(`${status} ${r.target}：同步 ${r.synced} 個技能`);
    for (const err of r.errors.slice(0, 3)) {
      lines.push(`  ❌ ${err}`);
    }
  }
  return lines.join('\n');
}
