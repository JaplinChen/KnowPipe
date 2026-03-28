/**
 * Plugin loader — scans plugins/ directory, validates manifests, and registers extractors.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerExtractor } from '../utils/url-parser.js';
import type { PluginManifest, PluginExtractor, LoadedPlugin } from './plugin-types.js';
import type { Extractor, ExtractedContent, Platform } from '../extractors/types.js';
import { createPluginContext } from './plugin-context.js';
import { logger } from '../core/logger.js';

const PLUGINS_DIR = join(process.cwd(), 'plugins');

async function readManifest(pluginDir: string): Promise<PluginManifest | null> {
  try {
    const raw = await readFile(join(pluginDir, 'manifest.json'), 'utf-8');
    const manifest = JSON.parse(raw) as PluginManifest;
    if (!manifest.name || !manifest.platform || !manifest.urlPatterns?.length || !manifest.entrypoint) {
      logger.warn('plugin', `Invalid manifest in ${pluginDir}`);
      return null;
    }
    return manifest;
  } catch {
    return null; // No manifest.json or invalid JSON
  }
}

async function loadPluginModule(
  pluginDir: string, manifest: PluginManifest,
): Promise<PluginExtractor | null> {
  try {
    const entryPath = join(pluginDir, manifest.entrypoint);
    const fileUrl = pathToFileURL(entryPath).href;
    const mod = await import(fileUrl) as { default?: PluginExtractor; extractor?: PluginExtractor };
    return mod.default ?? mod.extractor ?? null;
  } catch (err) {
    logger.warn('plugin', `Failed to load ${manifest.name}`, { error: (err as Error).message });
    return null;
  }
}

function wrapAsExtractor(manifest: PluginManifest, pluginExt: PluginExtractor, ctx: ReturnType<typeof createPluginContext>): Extractor {
  return {
    platform: manifest.platform as Platform,
    match: (url: string) => {
      // Check URL patterns from manifest + plugin's own match
      const patternMatch = manifest.urlPatterns.some((p) => url.includes(p));
      return patternMatch && pluginExt.match(url);
    },
    parseId: (_url: string) => null,
    extract: (url: string): Promise<ExtractedContent> => pluginExt.extract(url, ctx),
  };
}

/** Load all plugins from plugins/ directory and register as extractors. */
export async function loadPlugins(): Promise<LoadedPlugin[]> {
  const loaded: LoadedPlugin[] = [];

  let entries: string[];
  try {
    const items = await readdir(PLUGINS_DIR, { withFileTypes: true });
    entries = items.filter((i) => i.isDirectory()).map((i) => i.name);
  } catch {
    // plugins/ directory doesn't exist — that's fine
    return loaded;
  }

  for (const dir of entries) {
    const pluginDir = join(PLUGINS_DIR, dir);
    const manifest = await readManifest(pluginDir);
    if (!manifest) continue;

    const pluginExt = await loadPluginModule(pluginDir, manifest);
    if (!pluginExt) continue;

    const ctx = createPluginContext(manifest.name);

    // Initialize plugin
    if (pluginExt.init) {
      try {
        await pluginExt.init(ctx);
      } catch (err) {
        logger.warn('plugin', `Init failed for ${manifest.name}`, { error: (err as Error).message });
        continue;
      }
    }

    // Register as extractor (before webExtractor fallback)
    const wrappedExtractor = wrapAsExtractor(manifest, pluginExt, ctx);
    registerExtractor(wrappedExtractor);

    loaded.push({ manifest, extractor: pluginExt });
    logger.info('plugin', `已載入插件: ${manifest.name} v${manifest.version} (${manifest.platform})`);
  }

  if (loaded.length > 0) {
    logger.info('plugin', `共載入 ${loaded.length} 個插件`);
  }
  return loaded;
}
