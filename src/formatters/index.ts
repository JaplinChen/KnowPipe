import type { ExtractedContent } from '../extractors/types.js';
import type { PlatformFormatter } from './types.js';
import { assembleNote } from './base.js';
import { xFormatter } from './x.js';
import { youtubeFormatter } from './youtube.js';
import { githubFormatter } from './github.js';
import { defaultFormatter } from './default.js';

const registry: Record<string, PlatformFormatter> = {
  x: xFormatter,
  youtube: youtubeFormatter,
  github: githubFormatter,
};

/** Build an Obsidian-compatible Markdown note from extracted content */
export function formatAsMarkdown(
  content: ExtractedContent,
  localImagePaths: string[],
  localVideoPaths: string[] = [],
  imageUrlMap?: Map<string, string>,
): string {
  const formatter = registry[content.platform] ?? defaultFormatter;
  return assembleNote(content, localImagePaths, localVideoPaths, imageUrlMap, formatter);
}
