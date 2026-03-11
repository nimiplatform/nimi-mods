import { parseMediaIntent } from './media-intent-parser.js';
import type { PendingMediaIntent } from './media-decision-types.js';
import type { AssistantDelivery } from './speech-turn-runner.js';

function isOnlyFillerText(content: string): boolean {
  const normalized = String(content || '').trim();
  if (!normalized) return true;
  return /^(\.{2,}|…+|\.{1,}\s*…+)\s*$/.test(normalized);
}

export type ProcessMediaMarkerOverridesResult = {
  deliveries: AssistantDelivery[];
  markerOverrideCandidates: PendingMediaIntent[];
  visibleText: string;
  segmentCount: number;
  textSegments: number;
  voiceSegments: number;
  schedulerTotalDelayMs: number;
};

export function processMediaMarkerOverrides(input: {
  deliveries: AssistantDelivery[];
  userText: string;
  turnTxnId: string;
}): ProcessMediaMarkerOverridesResult {
  const markerOverrideCandidates: PendingMediaIntent[] = [];
  const deliveries = input.deliveries.flatMap((delivery, index) => {
    const parsed = parseMediaIntent({
      text: delivery.content,
      userText: input.userText,
    });
    parsed.intents.forEach((intent, intentIndex) => {
      markerOverrideCandidates.push({
        type: intent.type,
        prompt: intent.prompt,
        source: 'tag',
        plannerTrigger: 'marker-override',
        pendingMessageId: `msg-${input.turnTxnId}-marker-${index}-${intentIndex}`,
      });
    });
    const cleanedText = String(parsed.cleanedText || '').trim();
    if ((!cleanedText || isOnlyFillerText(cleanedText)) && parsed.intents.length > 0) {
      return [];
    }
    if (!cleanedText && parsed.intents.length > 0) {
      return [];
    }
    if (!cleanedText) {
      return [delivery];
    }
    return [{ ...delivery, content: parsed.cleanedText }];
  });

  return {
    deliveries,
    markerOverrideCandidates,
    visibleText: deliveries
      .map((delivery) => String(delivery.content || '').trim())
      .filter(Boolean)
      .join('\n\n'),
    segmentCount: deliveries.length,
    textSegments: deliveries.filter((delivery) => delivery.kind === 'text').length,
    voiceSegments: deliveries.filter((delivery) => delivery.kind === 'voice').length,
    schedulerTotalDelayMs: deliveries
      .reduce((sum, delivery) => sum + (Number.isFinite(delivery.delayMs) ? delivery.delayMs : 0), 0),
  };
}
