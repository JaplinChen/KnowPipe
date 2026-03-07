import type { VideoInfo, ExtractedContent } from '../extractors/types.js';
import type { PlatformFormatter, FormatBodyResult } from './types.js';
import { linkifyUrls } from './shared.js';

/** GitHub formatter — README body section */
export const githubFormatter: PlatformFormatter = {
  formatBody(text: string): FormatBodyResult {
    return { text: linkifyUrls(text), usedPaths: new Set() };
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

  extraSections(content: ExtractedContent): string[] {
    if (!content.body) return [];
    return ['## README', '', content.body, ''];
  },

  filterRemainingImages(localImagePaths: string[]): string[] {
    return localImagePaths;
  },
};
