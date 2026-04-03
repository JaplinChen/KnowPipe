/**
 * Unified skill schema — bridges Claude Code and Codex skill formats.
 * All AI coding agent skills are normalised to this intermediate format
 * for cross-tool syncing and vault-backed editing.
 */

/** Supported AI coding tools */
export type SkillTarget = 'claude' | 'codex';

/** A unified skill definition */
export interface UnifiedSkill {
  /** kebab-case unique identifier */
  id: string;
  /** Human-readable title */
  title: string;
  /** One-line description */
  description: string;
  /** Trigger patterns (e.g. "use when…", slash command names) */
  triggers: string[];
  /** Full instruction body in Markdown */
  instructions: string;
  /** Hard constraints / rules */
  constraints: string[];
  /** Usage examples */
  examples: string[];
  /** Topic category (e.g. 'testing', 'deployment', 'code-quality') */
  category: string;
  /** Original format this was imported from */
  sourceFormat: SkillTarget;
  /** Metadata */
  metadata: SkillMetadata;
}

export interface SkillMetadata {
  author: string;
  version: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  /** MD5 hash of instructions for change detection */
  contentHash: string;
}

/** Skill index entry (lightweight, for listing) */
export interface SkillIndexEntry {
  id: string;
  title: string;
  category: string;
  targets: SkillTarget[];
  lastSyncAt: string | null;
}

/** Persistent skill index */
export interface SkillIndex {
  version: number;
  updatedAt: string;
  skills: SkillIndexEntry[];
}
