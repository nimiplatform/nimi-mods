import type { LocalChatContextPacket } from '../../state/index.js';
import type { LocalChatTurnAiClient } from './types.js';
import type { TurnInvokeInput } from './request-builder.js';

function compactText(value: string, max = 80): string {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}

export async function runFirstBeatReactor(input: {
  aiClient: LocalChatTurnAiClient;
  invokeInput: TurnInvokeInput;
  contextPacket: LocalChatContextPacket;
  userText: string;
}): Promise<string> {
  const prompt = [
    input.invokeInput.prompt,
    '',
    '你现在只负责给出第一拍回应。',
    '规则：',
    '- 输出一句简短但完整的回复，必须是一个说完了的句子，不能断在半截。',
    '- 要像真人聊天时先接住对方那样自然。',
    '- 不要分段，不要项目符号，不要 JSON，不要代码块。',
    '- 不要抢着把所有信息一次说完，后续还有机会继续说。',
    `当前 turnMode=${input.contextPacket.turnMode || 'information'}`,
    `firstBeatStyle=${input.contextPacket.target.interactionProfile.expression.firstBeatStyle}`,
    `voiceConversationMode=${input.contextPacket.voiceConversationMode || 'off'}`,
    `用户输入=${input.userText}`,
  ].join('\n');

  try {
    const response = await input.aiClient.generateText({
      ...input.invokeInput,
      prompt,
      maxTokens: 96,
      temperature: 0.85,
    });
    return compactText(response.text || '', 80);
  } catch {
    return '';
  }
}
