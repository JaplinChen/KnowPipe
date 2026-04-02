/**
 * Smart model router — maps AI task types to optimal model tiers.
 * Reduces inference cost by routing simple tasks to flash (4B)
 * and reserving deep (27B) for complex analysis.
 */
import type { ModelTier } from './local-llm.js';

/** Semantic task types used across the pipeline. */
export type TaskType =
  | 'translate'
  | 'classify'
  | 'keywords'
  | 'summarize'
  | 'analyze'
  | 'digest'
  | 'vision'
  | 'general';

/** Default tier per task type. */
const TASK_TIER_MAP: Record<TaskType, ModelTier> = {
  translate: 'flash',
  classify: 'flash',
  keywords: 'flash',
  vision: 'standard',
  summarize: 'standard',
  general: 'standard',
  analyze: 'deep',
  digest: 'deep',
};

/**
 * Resolve the best model tier for a given task.
 * Explicit tier always wins; otherwise consult the routing table.
 */
export function resolveModelTier(task: TaskType, explicitTier?: ModelTier): ModelTier {
  return explicitTier ?? TASK_TIER_MAP[task];
}
