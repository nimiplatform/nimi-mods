import type {
  LocalChatProactiveDecisionInput,
  LocalChatProactiveDecisionObject,
} from './types.js';

const PROACTIVE_MAX_CONTEXT_CHARS = 3200;
const PROACTIVE_MAX_MESSAGE_CHARS = 220;

function sanitizeProactiveMessage(input: string): string {
  return String(input || '')
    .replace(/^\s*["'`]+/, '')
    .replace(/["'`]+\s*$/, '')
    .replace(/[ \t]{3,}/g, ' ')
    .trim();
}

function parseStrictJsonObject(text: string): Record<string, unknown> {
  const normalized = String(text || '').trim();
  if (!normalized || !normalized.startsWith('{') || !normalized.endsWith('}')) {
    throw new Error('LOCAL_CHAT_PROACTIVE_DECISION_INVALID_JSON');
  }
  const parsed = JSON.parse(normalized);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('LOCAL_CHAT_PROACTIVE_DECISION_INVALID_OBJECT');
  }
  return parsed as Record<string, unknown>;
}

function parseProactiveDecisionObject(text: string): Record<string, unknown> {
  const record = parseStrictJsonObject(text);
  if (typeof record.shouldContact !== 'boolean') {
    throw new Error('LOCAL_CHAT_PROACTIVE_DECISION_SHOULD_CONTACT_REQUIRED');
  }
  const shouldContact = record.shouldContact;
  const message = sanitizeProactiveMessage(String(record.message || '')).slice(0, PROACTIVE_MAX_MESSAGE_CHARS);
  const reason = String(record.reason || '').trim().slice(0, 240);
  if (shouldContact && !message) {
    throw new Error('LOCAL_CHAT_PROACTIVE_DECISION_MESSAGE_REQUIRED');
  }
  if (!shouldContact && message) {
    throw new Error('LOCAL_CHAT_PROACTIVE_DECISION_MESSAGE_MUST_BE_EMPTY');
  }
  return {
    shouldContact,
    message: shouldContact ? message : '',
    reason,
  };
}

function joinLines(title: string, lines: string[]): string {
  const filtered = lines
    .map((line) => String(line || '').trim())
    .filter(Boolean);
  if (filtered.length === 0) return '';
  return [`${title}:`, ...filtered.map((line) => `- ${line}`)].join('\n');
}

function summarizeContextPacket(input: LocalChatProactiveDecisionInput['contextPacket']): string {
  const chunks = [
    input.platformWarmStart
      ? [
        joinLines('平台 core warm-start', input.platformWarmStart.core),
        joinLines('平台 e2e warm-start', input.platformWarmStart.e2e),
      ].filter(Boolean).join('\n\n')
      : '',
    input.runningSummary
      ? [
        joinLines('关系状态', input.runningSummary.relationshipState),
        joinLines('用户事实', input.runningSummary.userFactsEstablished),
        joinLines('助手承诺', input.runningSummary.assistantCommitments),
        joinLines('未完成事项', input.runningSummary.openLoops),
        joinLines('场景状态', input.runningSummary.sceneState),
      ].filter(Boolean).join('\n\n')
      : '',
    joinLines('本地 durable memory', input.durableMemory.map((entry) => `[${entry.type}] ${entry.content}`)),
    joinLines('最近精确回合', input.recentBundles.flatMap((bundle) => [
      `${bundle.role === 'assistant' ? 'Assistant' : 'User'} #${bundle.seq}`,
      ...bundle.lines,
    ])),
  ].filter(Boolean);
  return chunks.join('\n\n').slice(0, PROACTIVE_MAX_CONTEXT_CHARS) || '(empty)';
}

export async function generateLocalChatProactiveDecision(
  input: LocalChatProactiveDecisionInput,
): Promise<LocalChatProactiveDecisionObject> {
  const target = input.target;
  const prompt = [
    `你是 ${target.displayName}（${target.handle}）。`,
    '你在执行本地聊天主动联系决策任务。',
    '请严格输出 JSON 对象，不要输出任何额外文本。',
    '格式：',
    '{"shouldContact": true|false, "message": "string", "reason": "string"}',
    '规则：',
    '- shouldContact=false 时 message 必须为空字符串。',
    '- shouldContact=true 时 message 必须是自然中文，不超过2句，不要解释规则。',
    '- reason 只描述为什么触发或不触发，不要包含多余前缀。',
    '',
    '当前 continuity 上下文：',
    summarizeContextPacket(input.contextPacket),
  ].join('\n');

  const result = await input.aiClient.generateObject({
    routeHint: 'chat/default',
    mode: 'STORY',
    prompt,
    worldId: target.worldId || undefined,
    agentId: target.id,
    parse: parseProactiveDecisionObject,
  });

  return {
    shouldContact: Boolean(result.object.shouldContact),
    message: String(result.object.message || '').trim(),
    reason: String(result.object.reason || '').trim(),
  };
}
