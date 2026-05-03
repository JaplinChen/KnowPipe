import type { VideoInfo } from '../extractors/types.js';
import type { PlatformFormatter, FormatBodyResult } from './types.js';
import { linkifyUrls, replaceInlineImages } from './shared.js';

/** X/Twitter formatter — handles inline article images */
export const xFormatter: PlatformFormatter = {
  formatBody(text: string, imageUrlMap?: Map<string, string>): FormatBodyResult {
    const { text: inlinedText, usedPaths } = replaceInlineImages(text, imageUrlMap);
    return { text: linkifyUrls(inlinedText), usedPaths };
  },

  formatVideos(videos: VideoInfo[], localVideoPaths: string[]): string[] {
    const lines: string[] = [];
    for (const vp of localVideoPaths) {
      lines.push(`![](${vp})`, '');
    }
    for (let i = 0; i < videos.length; i++) {
      if (i < localVideoPaths.length) continue;
      const v = videos[i];
      const label = v.type === 'gif' ? 'GIF' : `Video ${i + 1}`;
      lines.push(`- [${label}](${v.url})`, '');
    }
    return lines;
  },

  extraSections(): string[] {
    return [];
  },

  filterRemainingImages(localImagePaths: string[], usedPaths: Set<string>): string[] {
    return localImagePaths.filter(p => !usedPaths.has(p));
  },
};
