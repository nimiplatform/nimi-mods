import type {
  DerivedInteractionProfile,
  InteractionBeat,
  InteractionSnapshot,
  LocalChatTurnMode,
  VoiceConversationMode,
} from '../../state/index.js';
import type { ResolvedExperiencePolicy } from './resolved-experience-policy.js';

function inferVoiceAffinity(input: {
  beat: InteractionBeat;
  turnMode: LocalChatTurnMode;
  interactionProfile: DerivedInteractionProfile;
  voiceConversationMode: VoiceConversationMode;
  policy: ResolvedExperiencePolicy;
}): boolean {
  if (!input.policy.voicePolicy.enabled) return false;
  if (input.turnMode === 'explicit-voice') return true;
  if (input.voiceConversationMode === 'on') return input.turnMode !== 'explicit-media';
  if (input.voiceConversationMode !== 'suggested') return false;
  if (input.turnMode === 'information' || input.turnMode === 'explicit-media') return false;
  if (input.interactionProfile.voice.voiceAffinity !== 'high') return false;
  if (input.beat.text.length > 48) return false;
  if (
    input.beat.intent !== 'comfort'
    && input.beat.intent !== 'checkin'
    && input.beat.intent !== 'invite'
  ) {
    return false;
  }
  return input.turnMode === 'emotional' || input.turnMode === 'checkin';
}

function resolveExplicitVisualModality(input: {
  beat: InteractionBeat;
  turnMode: LocalChatTurnMode;
}): 'image' | 'video' | null {
  if (input.turnMode !== 'explicit-media') return null;
  if (!input.beat.assetRequest) return null;
  return input.beat.assetRequest.kind;
}

export function orchestrateBeatModalities(input: {
  beats: InteractionBeat[];
  turnMode: LocalChatTurnMode;
  interactionProfile: DerivedInteractionProfile;
  snapshot: InteractionSnapshot | null;
  policy: ResolvedExperiencePolicy;
  voiceConversationMode: VoiceConversationMode;
}): InteractionBeat[] {
  let visualSlotUsed = false;
  return input.beats.map((beat, index, list) => {
    const voicePreferred = inferVoiceAffinity({
      beat,
      turnMode: input.turnMode,
      interactionProfile: input.interactionProfile,
      voiceConversationMode: input.voiceConversationMode,
      policy: input.policy,
    });
    const forceVoiceBeforeAutoVisual = !beat.assetRequest && voicePreferred && (
      input.turnMode === 'explicit-voice'
      || (input.voiceConversationMode === 'on' && input.turnMode !== 'explicit-media')
    );
    if (forceVoiceBeforeAutoVisual) {
      return {
        ...beat,
        modality: 'voice',
        autoPlayVoice: input.policy.voicePolicy.autoPlayReplies,
      };
    }
    // Non-explicit turns no longer auto-suggest visual beats here.
    // For normal聊天回合，是否补图/视频只交给 planner 决定。
    if (!visualSlotUsed) {
      const explicitVisual = resolveExplicitVisualModality({
        beat,
        turnMode: input.turnMode,
      });
      if (explicitVisual) {
        visualSlotUsed = true;
        return {
          ...beat,
          modality: explicitVisual,
          intent: 'media',
        };
      }
    }
    if (input.turnMode === 'explicit-media') {
      return {
        ...beat,
        modality: 'text',
        beatIndex: index,
        beatCount: list.length,
      };
    }
    if (voicePreferred) {
      return {
        ...beat,
        modality: 'voice',
        autoPlayVoice: input.policy.voicePolicy.autoPlayReplies,
      };
    }
    return {
      ...beat,
      modality: 'text',
      beatIndex: index,
      beatCount: list.length,
    };
  });
}
