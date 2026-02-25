export function isDegenerateAssistantReply(value: string): boolean {
  const text = String(value || '').trim();
  if (!text) return true;
  if (text.length <= 1) return true;
  if (/^\d+$/.test(text)) return true;
  if (/^[\d\s.,;:!?()[\]{}<>/\\|+\-=_*#@%^&~`'"]+$/.test(text)) return true;
  return false;
}

export function isPromptEchoReply(value: string): boolean {
  const text = String(value || '').trim();
  if (!text) return false;
  const lowered = text.toLowerCase();
  if (
    lowered.includes('system role') ||
    lowered.includes('agent setting') ||
    lowered.includes('world setting') ||
    lowered.includes('current user message')
  ) {
    return true;
  }
  if (
    lowered.includes('system角色') ||
    lowered.includes('system_role') ||
    lowered.includes('world_set') ||
    lowered.includes('world_id=')
  ) {
    return true;
  }
  if (
    lowered.includes('用户输入') ||
    lowered.includes('模型回复') ||
    lowered.includes('response rules') ||
    lowered.includes('final output contract') ||
    lowered.includes('chat history') ||
    lowered.includes('current user message')
  ) {
    return true;
  }
  if (/<\/?think>/i.test(text)) {
    return true;
  }
  if (
    /(^|\n)\s*(system role|agent setting|world setting|chat history|current user message)\s*[:：]/i.test(text) ||
    /(^|\n)\s*(用户输入|模型回复|角色资料|世界资料|最近对话)\s*[:：]/i.test(text)
  ) {
    return true;
  }
  if (/(>{8,}|\{{8,})/.test(text)) {
    return true;
  }
  return /(?:^|\s)(system|user|world)\s*[:：]/i.test(text);
}

function stripThinkSections(value: string): string {
  return value
    .replace(/<think[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?think>/gi, '');
}

function extractAssistantReplyBody(value: string): string {
  let text = String(value || '');
  const markers = [
    /模型回复\s*[:：]\s*/i,
    /assistant\s*reply\s*[:：]\s*/i,
    /final\s*answer\s*[:：]\s*/i,
  ];
  for (const marker of markers) {
    const match = marker.exec(text);
    if (match) {
      text = text.slice(match.index + match[0].length);
      break;
    }
  }
  if (/^\s*(用户输入|user\s*input)\s*[:：]/i.test(text)) {
    const newlineIndex = text.search(/\n+/);
    text = newlineIndex >= 0 ? text.slice(newlineIndex + 1) : '';
  }
  return text;
}

export function sanitizeAssistantReply(value: string): string {
  let text = String(value || '').trim();
  if (!text) return '';
  text = stripThinkSections(text);
  text = extractAssistantReplyBody(text);
  text = text
    .replace(/^\s*(assistant|模型|回复|回答)\s*[:：]\s*/i, '')
    .replace(/^\s*["'`]+/, '')
    .replace(/["'`]+\s*$/, '')
    .replace(/[ \t]{3,}/g, ' ')
    .trim();
  return text;
}
