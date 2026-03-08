export type LogLevel = 'info' | 'warn' | 'error';

function serializeMeta(meta?: unknown): string {
  if (meta === undefined) return '';
  if (meta instanceof Error) return ` | ${meta.name}: ${meta.message}`;
  try {
    return ` | ${JSON.stringify(meta)}`;
  } catch {
    return ' | [unserializable-meta]';
  }
}

function write(level: LogLevel, scope: string, message: string, meta?: unknown): void {
  const line = `[${scope}] ${message}${serializeMeta(meta)}`;
  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.log(line);
}

export const logger = {
  info(scope: string, message: string, meta?: unknown): void {
    write('info', scope, message, meta);
  },
  warn(scope: string, message: string, meta?: unknown): void {
    write('warn', scope, message, meta);
  },
  error(scope: string, message: string, meta?: unknown): void {
    write('error', scope, message, meta);
  },
};
