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
  if (input.voiceConversationMode === 'on') return true;
  if (input.turnMode === 'explicit-voice') return true;
  if (input.turnMode === 'information') return false;
  if (input.beat.text.length > 90) return false;
  return input.interactionProfile.voice.voiceAffinity === 'high';
}

function shouldSuggestVisual(input: {
  beat: InteractionBeat;
  turnMode: LocalChatTurnMode;
  policy: ResolvedExperiencePolicy;
  interactionProfile: DerivedInteractionProfile;
  snapshot: InteractionSnapshot | null;
}): 'image' | 'video' | null {
  if (!input.policy.mediaPolicy.allowVisualAuto) return null;
  if (input.beat.assetRequest) {
    return input.beat.assetRequest.kind;
  }
  if (input.turnMode === 'information') return null;
  if (input.policy.mediaPolicy.autonomy === 'explicit-only') return null;
  if (input.interactionProfile.visual.imageAffinity === 'low' && input.interactionProfile.visual.videoAffinity === 'low') {
    return null;
  }
  if (input.turnMode === 'playful' && input.interactionProfile.visual.videoAffinity === 'medium') {
    return 'video';
  }
  if (
    input.turnMode === 'intimate'
    || input.snapshot?.relationshipState === 'warm'
    || input.snapshot?.relationshipState === 'intimate'
  ) {
    return 'image';
  }
  return null;
}

export function orchestrateBeatModalities(input: {
  beats: InteractionBeat[];
  turnMode: LocalChatTurnMode;
  interactionProfile: DerivedInteractionProfile;
  snapshot: InteractionSnapshot | null;
  policy: ResolvedExperiencePolicy;
  voiceConversationMode: VoiceConversationMode;
}): InteractionBeat[] {
  return input.beats.map((beat, index, list) => {
    const visual = shouldSuggestVisual({
      beat,
      turnMode: input.turnMode,
      policy: input.policy,
      interactionProfile: input.interactionProfile,
      snapshot: input.snapshot,
    });
    if (visual) {
      return {
        ...beat,
        modality: visual,
        intent: 'media',
        assetRequest: beat.assetRequest || {
          kind: visual,
          prompt: beat.text,
          confidence: 0.65,
          nsfwIntent: /暧昧|亲|吻|裸|nsfw/u.test(beat.text) ? 'suggested' : 'none',
        },
      };
    }
    if (inferVoiceAffinity({
      beat,
      turnMode: input.turnMode,
      interactionProfile: input.interactionProfile,
      voiceConversationMode: input.voiceConversationMode,
      policy: input.policy,
    })) {
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
