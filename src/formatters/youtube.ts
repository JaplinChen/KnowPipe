import type { VideoInfo } from '../extractors/types.js';
import type { PlatformFormatter, FormatBodyResult } from './types.js';
import { linkifyUrls } from './shared.js';

/** YouTube formatter — custom video labels */
export const youtubeFormatter: PlatformFormatter = {
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
      const label = v.type === 'gif' ? 'GIF' : '▶ 在 YouTube 觀看';
      lines.push(`- [${label}](${v.url})`, '');
    }
    return lines;
  },

  extraSections(): string[] {
    return [];
  },

  filterRemainingImages(localImagePaths: string[]): string[] {
    return localImagePaths;
  },
};
