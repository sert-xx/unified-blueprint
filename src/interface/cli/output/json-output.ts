/**
 * JSON output mode for --json flag
 */

export function printJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

export function printJsonError(error: {
  message: string;
  cause?: string;
  hint?: string;
}): void {
  printJson({ error });
}
