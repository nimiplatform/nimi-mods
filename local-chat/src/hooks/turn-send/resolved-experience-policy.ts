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
    routeSource: 'local' | 'cloud';
    nsfwPolicy: 'disabled' | 'local-only' | 'allowed';
    allowVisualAuto: boolean;
    allowAutoVisualHighRisk: false;
  };
  contentBoundary: {
    relationshipBoundaryPreset: LocalChatProductSettings['relationshipBoundaryPreset'];
    visualComfortLevel: LocalChatProductSettings['visualComfortLevel'];
    routeSource: 'local' | 'cloud';
    relationshipState: InteractionSnapshot['relationshipState'] | 'new';
  };
  inspectFlags: Pick<LocalChatInspectSettings, 'diagnosticsVisible' | 'runtimeInspectorVisible'>;
};

function resolveRouteSource(value: unknown): 'local' | 'cloud' {
  return value === 'cloud' ? 'cloud' : 'local';
}

function resolveVoiceConversationMode(input: {
  requestedMode?: VoiceConversationMode;
  settings: LocalChatDefaultSettings;
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
  return 'off';
}

function resolveNsfwPolicy(input: {
  routeSource: 'local' | 'cloud';
  settings: LocalChatDefaultSettings;
}): ResolvedExperiencePolicy['mediaPolicy']['nsfwPolicy'] {
  if (input.routeSource === 'cloud') {
    return 'local-only';
  }
  if (input.settings.visualComfortLevel === 'natural-visuals') {
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
