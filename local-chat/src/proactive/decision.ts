import type { LocalChatSession } from '../state/index.js';
import type {
  LocalChatProactiveDecisionInput,
  LocalChatProactiveDecisionObject,
} from './types.js';

const PROACTIVE_MAX_HISTORY_TURNS = 10;
const PROACTIVE_MAX_HISTORY_CHARS = 3000;
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

export function summarizeSessionForProactiveDecision(session: LocalChatSession): string {
  const turns = Array.isArray(session.turns)
    ? session.turns.slice(-PROACTIVE_MAX_HISTORY_TURNS)
    : [];
  if (turns.length === 0) return '(empty)';

  return turns
    .map((turn) => `${turn.role === 'assistant' ? 'Agent' : 'User'}: ${String(turn.content || '').trim()}`)
    .join('\n')
    .slice(0, PROACTIVE_MAX_HISTORY_CHARS);
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
    '最近对话：',
    input.historySummary,
  ].join('\n');

  const result = await input.aiClient.generateObject({
    capability: 'text.generate',
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
