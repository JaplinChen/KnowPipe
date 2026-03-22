/**
 * Persistent storage for patrol configuration.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { logger } from '../core/logger.js';
import type { PatrolConfig } from './patrol-types.js';
import { DEFAULT_PATROL_CONFIG } from './patrol-types.js';

const STORE_PATH = join(process.cwd(), 'data', 'patrol-config.json');

export async function loadPatrolConfig(): Promise<PatrolConfig> {
  try {
    const raw = await readFile(STORE_PATH, 'utf-8');
    return { ...DEFAULT_PATROL_CONFIG, ...JSON.parse(raw) as Partial<PatrolConfig> };
  } catch {
    return { ...DEFAULT_PATROL_CONFIG };
  }
}

export async function savePatrolConfig(config: PatrolConfig): Promise<void> {
  await mkdir(dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(config, null, 2), 'utf-8');
  logger.info('patrol', '已儲存設定');
}
