/**
 * UBP Logger
 * stderr + file output logger
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

let globalLogLevel: LogLevel = 'info';
let logFilePath: string | null = null;
let logFileStream: fs.WriteStream | null = null;

export function configureLogger(options: {
  level?: LogLevel;
  file?: string | null;
}): void {
  if (options.level) {
    globalLogLevel = options.level;
  }
  if (options.file !== undefined) {
    if (logFileStream) {
      logFileStream.end();
      logFileStream = null;
    }
    logFilePath = options.file;
    if (logFilePath) {
      const dir = path.dirname(logFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      logFileStream = fs.createWriteStream(logFilePath, { flags: 'a' });
    }
  }
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[globalLogLevel];
}

function formatMessage(level: LogLevel, message: string, args: unknown[]): string {
  const timestamp = new Date().toISOString();
  const levelTag = level.toUpperCase().padEnd(5);
  const extra = args.length > 0
    ? ' ' + args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
    : '';
  return `[${timestamp}] ${levelTag} ${message}${extra}`;
}

function write(level: LogLevel, message: string, args: unknown[]): void {
  if (!shouldLog(level)) return;
  const formatted = formatMessage(level, message, args);
  process.stderr.write(formatted + '\n');
  if (logFileStream) {
    logFileStream.write(formatted + '\n');
  }
}

export function closeLogger(): void {
  if (logFileStream) {
    logFileStream.end();
    logFileStream = null;
  }
}

export function createLogger(prefix?: string): Logger {
  const p = prefix ? `[${prefix}] ` : '';
  return {
    debug(message: string, ...args: unknown[]) {
      write('debug', p + message, args);
    },
    info(message: string, ...args: unknown[]) {
      write('info', p + message, args);
    },
    warn(message: string, ...args: unknown[]) {
      write('warn', p + message, args);
    },
    error(message: string, ...args: unknown[]) {
      write('error', p + message, args);
    },
  };
}
