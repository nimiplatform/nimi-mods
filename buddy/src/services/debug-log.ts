type BuddyLogLevel = 'debug' | 'info' | 'warn' | 'error';

export function logBuddyConsole(
  level: BuddyLogLevel,
  message: string,
  details?: Record<string, unknown>,
) {
  const prefix = `[buddy] ${message}`;
  if (details && Object.keys(details).length > 0) {
    console.log(prefix, details);
    return;
  }
  console.log(prefix);
}
