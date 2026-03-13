import type { ChatMessage, LocalChatMediaGenerationSpec } from '../../types.js';
import { compactHeadTail } from './text-compaction.js';

function normalizeText(value: unknown): string {
  return String(value || '').trim();
}

function buildMediaSpecSummary(input: {
  kind: 'image' | 'video';
  spec?: LocalChatMediaGenerationSpec | null;
}): string {
  const subject = normalizeText(input.spec?.subject);
  const scene = normalizeText(input.spec?.scene);
  const mood = normalizeText(input.spec?.mood);
  const summary = `[${input.kind}] ${subject}${scene ? `, ${scene}` : ''}${mood ? ` (${mood})` : ''}`.trim();
  return compactHeadTail(summary || `[${input.kind}]`, 220);
}

export function buildMediaContinuitySummary(message: ChatMessage): string {
  if (message.kind !== 'image' && message.kind !== 'video') {
    return normalizeText(message.content);
  }

  const shadowText = normalizeText(message.meta?.mediaShadow?.shadowText);
  if (shadowText) {
    return compactHeadTail(shadowText, 220);
  }

  const requestedSummary = buildMediaSpecSummary({
    kind: message.kind,
    spec: message.meta?.mediaSpec,
  });
  const status = normalizeText(message.meta?.mediaStatus);
  if (status === 'failed' || status === 'blocked') {
    const reason = compactHeadTail(
      normalizeText(message.meta?.mediaError) || normalizeText(message.content) || 'unknown',
      120,
    );
    return compactHeadTail(`reason=${reason}; requested=${requestedSummary}`, 220);
  }

  return requestedSummary;
}
