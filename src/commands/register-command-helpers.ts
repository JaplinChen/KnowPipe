import type { Context, Telegraf } from 'telegraf';
import type { AppConfig } from '../utils/config.js';
import type { BotStats } from '../messages/types.js';
import { runCommandTask } from './command-runner.js';
import { formatErrorMessage } from '../core/errors.js';

export type MatchedContext = Context & { match: RegExpExecArray };

type CommandHandler = (ctx: Context, config: AppConfig) => Promise<void>;
type ActionHandler = (ctx: MatchedContext) => Promise<void>;

export interface CommandRegistration {
  command: string | readonly string[];
  tag: string;
  handler: CommandHandler;
}

export interface ActionRegistration {
  pattern: RegExp;
  tag: string;
  handler: ActionHandler;
}

export interface ForceReplyRegistration {
  key: string;
  tag: string;
  handler: CommandHandler;
}

export function registerAsyncCommand(
  bot: Telegraf,
  command: string | readonly string[],
  tag: string,
  config: AppConfig,
  handler: CommandHandler,
): void {
  bot.command(command as string | string[], (ctx) => {
    runCommandTask(ctx, tag, () => handler(ctx, config), formatErrorMessage).catch(() => {});
  });
}

export function registerAsyncAction(
  bot: Telegraf,
  pattern: RegExp,
  tag: string,
  handler: ActionHandler,
): void {
  bot.action(pattern, (ctx) => {
    const matchedCtx = ctx as MatchedContext;
    runCommandTask(matchedCtx, tag, () => handler(matchedCtx), formatErrorMessage).catch(() => {});
  });
}

export function registerCommandSet(
  bot: Telegraf,
  config: AppConfig,
  registrations: CommandRegistration[],
): void {
  for (const registration of registrations) {
    registerAsyncCommand(bot, registration.command, registration.tag, config, registration.handler);
  }
}

export function registerActionSet(
  bot: Telegraf,
  registrations: ActionRegistration[],
): void {
  for (const registration of registrations) {
    registerAsyncAction(bot, registration.pattern, registration.tag, registration.handler);
  }
}

export function createForceReplyRunner(
  config: AppConfig,
  handler: CommandHandler,
  tag: string,
): (ctx: Context) => Promise<void> {
  return (ctx) => runCommandTask(ctx, tag, () => handler(ctx, config), formatErrorMessage);
}

export function mutateContextMessageText(
  ctx: MatchedContext,
  text: string,
): void {
  const existingMsg = ctx.message as unknown as Record<string, unknown> | undefined;
  if (existingMsg) {
    existingMsg.text = text;
    return;
  }

  const cbMsg = (ctx.callbackQuery?.message ?? {}) as Record<string, unknown>;
  (ctx.update as unknown as Record<string, unknown>).message = { ...cbMsg, text };
}

export type RetryHandlerFactory = (stats: BotStats) => CommandHandler;
