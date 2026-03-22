export type LogLevel = 'info' | 'warn' | 'error';

/** In-memory ring buffer for recent log entries */
const LOG_BUFFER_SIZE = 200;

export interface LogEntry {
  ts: number;
  level: LogLevel;
  scope: string;
  message: string;
  meta?: string;
}

const logBuffer: LogEntry[] = [];

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
  const metaStr = serializeMeta(meta);
  const line = `[${scope}] ${message}${metaStr}`;

  // Push to ring buffer
  logBuffer.push({ ts: Date.now(), level, scope, message, meta: metaStr || undefined });
  if (logBuffer.length > LOG_BUFFER_SIZE) logBuffer.shift();

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

  /** Get recent log entries, optionally filtered by level */
  getRecent(count = 20, level?: LogLevel): LogEntry[] {
    const filtered = level ? logBuffer.filter((e) => e.level === level) : logBuffer;
    return filtered.slice(-count);
  },
};
