export function toPlainText(input: string): string {
  return input
    .replace(/!\[.*?\]\(.*?\)/g, ' ')
    .replace(/\[([^\]]+)\]\(.*?\)/g, '$1')
    .replace(/[\*_`>#]/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function splitSentences(input: string): string[] {
  return input
    .split(/[。！？!?\n；;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isLikelyStatsLine(input: string): boolean {
  const s = input.toLowerCase();
  return s.includes('views:')
    || s.includes('likes:')
    || s.includes('comments:')
    || s.includes('duration:')
    || /[0-9]{2,}/.test(s) && /(views|likes|comments|stats|duration)/i.test(s);
}
