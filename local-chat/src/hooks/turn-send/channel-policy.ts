import type { AssistantPlanSegment } from './types.js';

const STRUCTURED_TEXT_PATTERN = /```|https?:\/\/|(^|\n)\s*[-*]\s|(^|\n)\s*\d+\.\s/;
const CHINESE_CHAR_PATTERN = /[\u4e00-\u9fff]/;

function seemsStructuredText(content: string): boolean {
  const text = String(content || '').trim();
  if (!text) return true;
  if (STRUCTURED_TEXT_PATTERN.test(text)) return true;
  if (text.length > 160) return true;
  return false;
}

function isVoiceFriendlyAutoSegment(segment: AssistantPlanSegment): boolean {
  const text = String(segment.content || '').trim();
  if (!text) return false;
  if (!CHINESE_CHAR_PATTERN.test(text)) return false;
  if (seemsStructuredText(text)) return false;
  if (text.length < 8 || text.length > 120) return false;
  if (segment.intent === 'checkin') return true;
  if (segment.intent === 'clarify' && text.length <= 90) return true;
  if (/[?？!！~。]$/.test(text) && text.length <= 88) return true;
  return false;
}

export function resolveAssistantSegmentKind(input: {
  segment: AssistantPlanSegment;
  settings: {
    enableVoice: boolean;
  };
  runtime?: {
    selectedTargetId?: string;
    selectedSessionId?: string;
  };
}): 'text' | 'voice' {
  if (!input.settings.enableVoice) return 'text';
  if (input.segment.channel === 'text') return 'text';
  if (input.segment.channel === 'voice') return 'voice';
  return isVoiceFriendlyAutoSegment(input.segment) ? 'voice' : 'text';
}
