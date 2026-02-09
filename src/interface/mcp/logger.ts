/**
 * MCP Server logger - writes to stderr + file
 * stdout is reserved for MCP protocol (JSON-RPC)
 */

import { createWriteStream, type WriteStream } from 'node:fs';
import { join } from 'node:path';

let logFileStream: WriteStream | null = null;

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export function initServeLogger(ubpDir: string): void {
  const logPath = join(ubpDir, 'serve.log');
  logFileStream = createWriteStream(logPath, { flags: 'a' });
}

export function logToStderr(
  message: string,
  level: LogLevel = 'info',
): void {
  const timestamp = new Date().toISOString();
  const formatted = `${timestamp} [${level.toUpperCase()}] ${message}`;

  process.stderr.write(formatted + '\n');

  logFileStream?.write(formatted + '\n');
}

export function closeLogger(): void {
  logFileStream?.end();
  logFileStream = null;
}

/**
 * Intercept console.log/info to prevent accidental stdout writes
 * during MCP serve mode (stdout is reserved for JSON-RPC protocol)
 */
export function interceptConsole(): void {
  console.log = (...args: unknown[]) => {
    logToStderr(args.map(String).join(' '), 'info');
  };
  console.info = (...args: unknown[]) => {
    logToStderr(args.map(String).join(' '), 'info');
  };
  // console.warn and console.error already write to stderr
}
