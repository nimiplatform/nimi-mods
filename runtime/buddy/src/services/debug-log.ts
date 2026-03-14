type BuddyLogLevel = 'debug' | 'info' | 'warn' | 'error';

function isBuddyDebugEnabled(): boolean {
  try {
    return typeof window !== 'undefined'
      && new URLSearchParams(window.location.search).get('buddyDebug') === '1';
  } catch {
    return false;
  }
}

export function logBuddyConsole(
  level: BuddyLogLevel,
  message: string,
  details?: Record<string, unknown>,
) {
  if (level === 'debug' && !isBuddyDebugEnabled()) {
    return;
  }
  const prefix = `[buddy] ${message}`;
  if (details && Object.keys(details).length > 0) {
    console.log(prefix, details);
    return;
  }
  console.log(prefix);
}

export { isBuddyDebugEnabled };
