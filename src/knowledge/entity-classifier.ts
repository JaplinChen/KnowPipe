/**
 * Heuristic entity type classifier for vault knowledge extraction.
 * Checks known sets first, then falls back to structural patterns.
 */
import type { EntityType } from './types.js';

const KNOWN_LANGUAGES = new Set([
  'typescript', 'javascript', 'python', 'rust', 'go', 'swift', 'kotlin',
  'java', 'ruby', 'php', 'dart', 'c++', 'c#', 'scala', 'elixir', 'haskell',
  'bash', 'shell', 'sql', 'r',
]);

const KNOWN_PLATFORMS = new Set([
  'github', 'twitter', 'x', 'youtube', 'hn', 'hacker news',
  'discord', 'telegram', 'notion', 'obsidian', 'cloudflare', 'vercel',
  'netlify', 'hugging face', 'huggingface', 'producthunt', 'dev.to',
  'npm', 'pypi', 'docker hub', 'dockerhub', 'google', 'apple',
  'linkedin', 'medium', 'substack',
]);

const KNOWN_TOOLS = new Set([
  'claude', 'gpt', 'gemini', 'llama', 'mistral', 'ollama', 'omlx',
  'cursor', 'copilot', 'codeium', 'tabnine',
  'ffmpeg', 'yt-dlp', 'homebrew', 'brew',
  'vscode', 'vs code', 'neovim', 'vim', 'emacs',
  'docker', 'podman', 'kubernetes', 'k8s',
  'nginx', 'caddy', 'traefik',
  'telegraf', 'obsidian', 'notion', 'logseq',
  'tailscale', 'zerotier',
  'openai', 'anthropic',
  'claude code', 'claude api', 'github copilot', 'visual studio',
  'vs code', 'xcode', 'android studio',
]);

const TOOL_SUFFIXES = ['sdk', 'cli', 'api', 'bot', 'app', 'tool', 'agent', '.js', '.py', '.ts', '-cli', '-sdk'];
const FRAMEWORK_KEYWORDS = ['framework', 'library', 'runtime', 'engine', 'stack'];

const TECH_ACRONYM_RE = /^[A-Z]{2,6}(\+\+)?$/;
const CAMEL_CASE_RE = /^[A-Z][a-z]+[A-Z]/;
const KEBAB_CODE_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/;
const VERSION_RE = /\d+\.\d+/;
const TITLE_CASE_TOOL_RE = /^[A-Z][a-z]+ [A-Z][a-z]+$/;

/** Classify an entity type using heuristic rules. */
export function classifyEntityType(name: string, category: string): EntityType {
  const lower = name.toLowerCase().trim();

  if (category.toLowerCase().includes('程式語言')) return 'language';
  if (KNOWN_LANGUAGES.has(lower)) return 'language';
  if (KNOWN_PLATFORMS.has(lower)) return 'platform';
  if (KNOWN_TOOLS.has(lower)) return 'tool';
  if (TECH_ACRONYM_RE.test(name)) return 'technology';

  for (const kw of FRAMEWORK_KEYWORDS) {
    if (lower.endsWith(kw) || lower.includes(kw + ' ')) return 'framework';
  }
  for (const suf of TOOL_SUFFIXES) {
    if (lower.endsWith(suf)) return 'tool';
  }

  if (KEBAB_CODE_RE.test(name) && name.length <= 30) return 'tool';
  if (CAMEL_CASE_RE.test(name) && name.length <= 30) return 'tool';
  if (TITLE_CASE_TOOL_RE.test(name) && name.length <= 30) return 'tool';
  if (VERSION_RE.test(name)) return 'tool';

  const isEnglishHeavy = (name.match(/[a-zA-Z]/g) ?? []).length / name.length > 0.7;
  if (isEnglishHeavy && name.length <= 20 && !name.includes(' ')) return 'tool';

  return 'concept';
}
