import type { EmotionType } from '../contracts.js';
import { EMOTION_TAG_REGEX, DEFAULT_EMOTION, MAX_HISTORY_TURNS } from '../contracts.js';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  emotion?: EmotionType;
}

export interface DialogueResult {
  text: string;
  emotion: EmotionType;
}

const SYSTEM_PROMPT = `你是一个友善、温暖的儿童伙伴。请遵守以下规则：

1. 使用简单、温暖、积极的语言，适合儿童理解
2. 回复控制在 2-3 句以内，简短有趣
3. 每次回复开头加情绪标签，格式: [emotion:xxx]，可选值: happy, sad, surprised, thinking, excited, sleepy
4. 绝对禁止讨论暴力、恐怖、色情或任何不适合儿童的内容
5. 禁止提供医疗、法律或财务建议
6. 遇到敏感话题时温和地引导转向积极方向
7. 不模拟或鼓励任何危险行为
8. 保持好奇和热情，像一个可爱的朋友一样交流`;

/**
 * BD-PIPE-004 情绪提取
 * 从 LLM 回复中提取情绪标签并剥离。
 */
export function extractEmotion(text: string): DialogueResult {
  const match = text.match(EMOTION_TAG_REGEX);
  const emotion = (match?.[1] as EmotionType) ?? DEFAULT_EMOTION;
  const cleanText = text.replace(EMOTION_TAG_REGEX, '').trim();
  return { text: cleanText, emotion };
}

function createMessageId(): string {
  return `buddy-msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * BD-PIPE-001 编译上下文
 * 将 system prompt + 对话历史编译为 LLM 输入。
 */
export function compileMessages(
  history: ChatMessage[],
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const trimmed = history.slice(-MAX_HISTORY_TURNS * 2);
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    ...trimmed,
  ];
}

/**
 * 管理对话历史（FIFO，最多 MAX_HISTORY_TURNS 轮）
 */
export function createDialogueHistory() {
  let messages: ChatMessage[] = [];

  return {
    get messages() { return [...messages]; },
    addUser(content: string) {
      messages.push({ id: createMessageId(), role: 'user', content });
      trimHistory();
    },
    addAssistant(content: string, emotion?: EmotionType) {
      messages.push({ id: createMessageId(), role: 'assistant', content, emotion });
      trimHistory();
    },
    clear() {
      messages = [];
    },
    restore(saved: ChatMessage[]) {
      messages = saved.map((message) => ({
        ...message,
        id: typeof message.id === 'string' && message.id.trim() ? message.id : createMessageId(),
      }));
    },
  };

  function trimHistory() {
    if (messages.length > MAX_HISTORY_TURNS * 2) {
      messages = messages.slice(-MAX_HISTORY_TURNS * 2);
    }
  }
}

export type DialogueHistory = ReturnType<typeof createDialogueHistory>;
