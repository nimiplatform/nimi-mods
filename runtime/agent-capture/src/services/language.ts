export type AgentCapturePromptLocale = 'zh' | 'en';

export function resolveAgentCapturePromptLocale(input: string | null | undefined): AgentCapturePromptLocale {
  const normalized = String(input || '').trim().toLowerCase();
  if (normalized.startsWith('zh')) {
    return 'zh';
  }
  return 'en';
}

export function resolveAgentCapturePreferredLanguage(input: string | null | undefined): string {
  return resolveAgentCapturePromptLocale(input) === 'zh' ? 'zh-CN' : 'en-US';
}
