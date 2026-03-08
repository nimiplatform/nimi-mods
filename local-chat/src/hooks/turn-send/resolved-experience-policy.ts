import type {
  DerivedInteractionProfile,
  InteractionSnapshot,
  LocalChatDefaultSettings,
  LocalChatInspectSettings,
  LocalChatProductSettings,
  VoiceConversationMode,
} from '../../state/index.js';

export type ResolvedExperiencePolicy = {
  deliveryPolicy: {
    style: LocalChatProductSettings['deliveryStyle'];
    allowMultiReply: boolean;
  };
  voicePolicy: {
    enabled: boolean;
    conversationMode: VoiceConversationMode;
    autoPlayReplies: boolean;
    selectedVoiceId: string | null;
    selectionMode: 'auto' | 'manual';
  };
  mediaPolicy: {
    autonomy: LocalChatProductSettings['mediaAutonomy'];
    visualComfortLevel: LocalChatProductSettings['visualComfortLevel'];
    routeSource: 'local-runtime' | 'token-api';
    nsfwPolicy: 'disabled' | 'local-runtime-only' | 'allowed';
    allowVisualAuto: boolean;
    allowAutoVisualHighRisk: false;
  };
  contentBoundary: {
    relationshipBoundaryPreset: LocalChatProductSettings['relationshipBoundaryPreset'];
    visualComfortLevel: LocalChatProductSettings['visualComfortLevel'];
    routeSource: 'local-runtime' | 'token-api';
    relationshipState: InteractionSnapshot['relationshipState'] | 'new';
  };
  inspectFlags: Pick<LocalChatInspectSettings, 'diagnosticsVisible' | 'runtimeInspectorVisible'>;
};

function resolveRouteSource(value: unknown): 'local-runtime' | 'token-api' {
  return value === 'token-api' ? 'token-api' : 'local-runtime';
}

function resolveVoiceConversationMode(input: {
  requestedMode?: VoiceConversationMode;
  settings: LocalChatDefaultSettings;
  interactionProfile: DerivedInteractionProfile;
}): VoiceConversationMode {
  if (!input.settings.enableVoice) {
    return 'off';
  }
  if (input.requestedMode === 'on' || input.requestedMode === 'suggested') {
    return input.requestedMode;
  }
  if (input.settings.voiceConversationMode === 'on' || input.settings.voiceConversationMode === 'suggested') {
    return input.settings.voiceConversationMode;
  }
  return input.interactionProfile.voice.voiceAffinity === 'high' ? 'suggested' : 'off';
}

function resolveNsfwPolicy(input: {
  routeSource: 'local-runtime' | 'token-api';
  settings: LocalChatDefaultSettings;
}): ResolvedExperiencePolicy['mediaPolicy']['nsfwPolicy'] {
  if (input.routeSource === 'token-api') {
    return 'local-runtime-only';
  }
  if (
    input.settings.visualComfortLevel === 'natural-visuals'
    && input.settings.relationshipBoundaryPreset === 'close'
  ) {
    return 'allowed';
  }
  return 'disabled';
}

export function compileResolvedExperiencePolicy(input: {
  interactionProfile: DerivedInteractionProfile;
  interactionSnapshot: InteractionSnapshot | null;
  settings: LocalChatDefaultSettings;
  requestedVoiceConversationMode?: VoiceConversationMode;
  routeSource?: string | null;
}): ResolvedExperiencePolicy {
  const routeSource = resolveRouteSource(input.routeSource);
  const relationshipState = input.interactionSnapshot?.relationshipState || 'new';
  const selectedVoiceId = String(input.settings.voiceName || input.interactionProfile.voice.voiceId || '').trim() || null;
  return {
    deliveryPolicy: {
      style: input.settings.deliveryStyle,
      allowMultiReply: input.settings.deliveryStyle === 'natural',
    },
    voicePolicy: {
      enabled: input.settings.enableVoice,
      conversationMode: resolveVoiceConversationMode({
        requestedMode: input.requestedVoiceConversationMode,
        settings: input.settings,
        interactionProfile: input.interactionProfile,
      }),
      autoPlayReplies: input.settings.autoPlayVoiceReplies,
      selectedVoiceId,
      selectionMode: String(input.settings.voiceName || '').trim() ? 'manual' : 'auto',
    },
    mediaPolicy: {
      autonomy: input.settings.mediaAutonomy,
      visualComfortLevel: input.settings.visualComfortLevel,
      routeSource,
      nsfwPolicy: resolveNsfwPolicy({
        routeSource,
        settings: input.settings,
      }),
      allowVisualAuto: input.settings.mediaAutonomy === 'natural' && input.settings.visualComfortLevel !== 'text-only',
      allowAutoVisualHighRisk: false,
    },
    contentBoundary: {
      relationshipBoundaryPreset: input.settings.relationshipBoundaryPreset,
      visualComfortLevel: input.settings.visualComfortLevel,
      routeSource,
      relationshipState,
    },
    inspectFlags: {
      diagnosticsVisible: input.settings.diagnosticsVisible,
      runtimeInspectorVisible: input.settings.runtimeInspectorVisible,
    },
  };
}
