import type {
  DerivedInteractionProfile,
  InteractionSnapshot,
  LocalChatContextRecentTurn,
  LocalChatTurnMode,
} from '../../state/index.js';
import { resolveTurnMode } from './turn-mode-resolver.js';

export type FastTurnPerceptionResult = {
  turnMode: LocalChatTurnMode;
  emotionalState: {
    detected: string;
    cause: string;
    suggestedApproach: string;
  } | null;
  conversationDirective: string | null;
  intimacyCeiling: 'friendly' | 'warm' | 'intimate';
};

const CONTINUATION_RE = /继续|还记得|刚才|说好的|上次|之前那个|那件事|remember|continue|we said|earlier|last time/iu;

const EMOTION_PATTERNS: Array<{
  pattern: RegExp;
  detected: string;
  cause: string;
  suggestedApproach: string;
}> = [
  {
    pattern: /累|疲惫|困|撑不住|扛不住/u,
    detected: '疲惫',
    cause: '用户当前消息带有明显疲惫感',
    suggestedApproach: 'empathize-first',
  },
  {
    pattern: /委屈|难受|心酸|想哭/u,
    detected: '委屈',
    cause: '用户当前消息带有明显委屈或难受感',
    suggestedApproach: 'empathize-first',
  },
  {
    pattern: /难过|伤心|失落|低落|孤单|孤独/u,
    detected: '难过',
    cause: '用户当前消息带有明显低落情绪',
    suggestedApproach: 'be-supportive',
  },
  {
    pattern: /烦|焦虑|害怕|紧张|崩溃|慌/u,
    detected: '焦虑',
    cause: '用户当前消息带有明显压力或焦虑感',
    suggestedApproach: 'empathize-first',
  },
  {
    pattern: /哈哈|嘿嘿|好耶|笑死|开心|兴奋/u,
    detected: '兴奋',
    cause: '用户当前消息带有轻快或兴奋情绪',
    suggestedApproach: 'lighten-mood',
  },
];

function resolveCurrentRelationship(snapshot: InteractionSnapshot | null | undefined): InteractionSnapshot['relationshipState'] | 'new' {
  return snapshot?.relationshipState || 'new';
}

function resolveFastIntimacyCeiling(snapshot: InteractionSnapshot | null | undefined): FastTurnPerceptionResult['intimacyCeiling'] {
  const relationshipState = resolveCurrentRelationship(snapshot);
  if (relationshipState === 'intimate') return 'intimate';
  if (relationshipState === 'warm') return 'warm';
  return 'friendly';
}

function resolveEmotionalState(userText: string): FastTurnPerceptionResult['emotionalState'] {
  const text = String(userText || '').trim();
  for (const entry of EMOTION_PATTERNS) {
    if (entry.pattern.test(text)) {
      return {
        detected: entry.detected,
        cause: entry.cause,
        suggestedApproach: entry.suggestedApproach,
      };
    }
  }
  return null;
}

function buildFastDirective(input: {
  turnMode: LocalChatTurnMode;
  emotionalState: FastTurnPerceptionResult['emotionalState'];
  userText: string;
  snapshot: InteractionSnapshot | null | undefined;
  recentTurns?: LocalChatContextRecentTurn[];
}): string | null {
  const continuationLike = CONTINUATION_RE.test(input.userText)
    || Boolean((input.recentTurns || []).length >= 2);
  switch (input.turnMode) {
    case 'emotional':
      return '先接住用户情绪，不要急着讲道理。';
    case 'playful':
      return '先顺着用户语气接住，不要突然变得太正经。';
    case 'intimate':
      return '先自然回应亲近感，但不要越过当前边界。';
    case 'explicit-media':
      return '先用一句话接住，再把媒体相关内容留到后续补充。';
    case 'explicit-voice':
      return '先用一句话接住，后续再转到语音表现。';
    case 'checkin':
      return continuationLike
        ? '先顺着上一次那条线自然接上。'
        : '先自然回应问候，不要显得像重新开场。';
    case 'information':
    default:
      if (input.emotionalState) {
        return '先接住用户，再自然过渡到回答。';
      }
      if (continuationLike || input.snapshot?.conversationDirective) {
        return '先顺着已有对话线索接住，不要像陌生人重新开始。';
      }
      return null;
  }
}

export function resolveFastTurnPerception(input: {
  userText: string;
  interactionProfile: DerivedInteractionProfile;
  snapshot?: InteractionSnapshot | null;
  recentTurns?: LocalChatContextRecentTurn[];
  proactive?: boolean;
}): FastTurnPerceptionResult {
  const turnMode = resolveTurnMode({
    userText: input.userText,
    interactionProfile: input.interactionProfile,
    proactive: input.proactive,
  });
  const emotionalState = resolveEmotionalState(input.userText);
  return {
    turnMode,
    emotionalState,
    conversationDirective: buildFastDirective({
      turnMode,
      emotionalState,
      userText: input.userText,
      snapshot: input.snapshot,
      recentTurns: input.recentTurns,
    }),
    intimacyCeiling: resolveFastIntimacyCeiling(input.snapshot),
  };
}
