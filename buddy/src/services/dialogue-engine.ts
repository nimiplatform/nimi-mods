import type { EmotionType } from '../contracts.js';
import {
  EMOTION_TAG_REGEX,
  DEFAULT_EMOTION,
  MAX_HISTORY_TURNS,
  DEFAULT_BUDDY_MODEL_ID,
} from '../contracts.js';
import { buildBuddySystemPrompt, getBuddyPromptProfile } from './prompt-template.js';

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

const DEFAULT_SYSTEM_PROMPT = buildBuddySystemPrompt(getBuddyPromptProfile(DEFAULT_BUDDY_MODEL_ID));

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
  systemPrompt = DEFAULT_SYSTEM_PROMPT,
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const trimmed = history.slice(-MAX_HISTORY_TURNS * 2);
  return [
    { role: 'system', content: systemPrompt },
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
