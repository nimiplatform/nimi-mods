import { createRendererFlowId, logRendererEvent } from '@nimiplatform/sdk/mod/logging';

const KB_CONSOLE_DEBUG_KEY = 'nimi.kb.console.debug.v1';

export function createKBFlowId(prefix: string): string {
  return createRendererFlowId(prefix.startsWith('kb') ? prefix : `kb-${prefix}`);
}

function isConsoleDebugEnabled(): boolean {
  try {
    return localStorage.getItem(KB_CONSOLE_DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}

function mirrorKBLogToConsole(input: {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  flowId?: string;
  source?: string;
  details?: Record<string, unknown>;
}) {
  const level = input.level;
  const shouldMirror = level === 'warn' || level === 'error' || isConsoleDebugEnabled();
  if (!shouldMirror) return;

  const prefix = `[knowledge-base:${level}] ${input.message}`;
  const payload = {
    flowId: input.flowId || null,
    source: input.source || null,
    details: input.details || {},
  };
  if (level === 'error') {
    console.error(prefix, payload);
    return;
  }
  if (level === 'warn') {
    console.warn(prefix, payload);
    return;
  }
  if (level === 'debug') {
    console.debug(prefix, payload);
    return;
  }
  console.info(prefix, payload);
}

export function emitKBLog(input: {
  level?: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  flowId?: string;
  source?: string;
  costMs?: number;
  details?: Record<string, unknown>;
}) {
  const level = input.level || 'info';
  logRendererEvent({
    level,
    area: 'knowledge-base',
    message: input.message,
    flowId: input.flowId,
    source: input.source,
    costMs: input.costMs,
    details: input.details,
  });
  mirrorKBLogToConsole({
    level,
    message: input.message,
    flowId: input.flowId,
    source: input.source,
    details: input.details,
  });
}
