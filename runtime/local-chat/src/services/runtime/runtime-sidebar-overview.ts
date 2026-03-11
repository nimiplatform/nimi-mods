type RuntimeDependencyStatus = 'ready' | 'missing' | 'degraded' | 'unknown';

export type RuntimeSidebarDependencyCapability = 'chat' | 'tts' | 'stt' | 'image' | 'video';

export type RuntimeSidebarDependencyCapabilityState = {
  capability: RuntimeSidebarDependencyCapability;
  matched: boolean;
  required: boolean;
  resolved: boolean;
};

export type ResolveRuntimeSidebarDependencyOverviewInput = {
  isVoiceEnabled: boolean;
  mediaPlannerEnabled: boolean;
  isLocalSnapshotFailure: boolean;
  dependencySnapshotStatus?: RuntimeDependencyStatus;
  dependencySnapshotReasonCode?: string;
  dependencySnapshotUpdatedAt?: string;
  imageDependencyStatus?: RuntimeDependencyStatus;
  imageDependencyReasonCode?: string;
  imageDependencyUpdatedAt?: string;
  videoDependencyStatus?: RuntimeDependencyStatus;
  videoDependencyReasonCode?: string;
  videoDependencyUpdatedAt?: string;
  dependencyRepairActionCount: number;
  chatCapabilityMatched: boolean;
  chatCapabilityResolved: boolean;
  ttsCapabilityMatched: boolean;
  ttsCapabilityResolved: boolean;
  sttCapabilityMatched: boolean;
  sttCapabilityResolved: boolean;
  imageCapabilityMatched: boolean;
  imageCapabilityResolved: boolean;
  videoCapabilityMatched: boolean;
  videoCapabilityResolved: boolean;
};

export type RuntimeSidebarDependencyOverview = {
  dependencyCapabilities: RuntimeSidebarDependencyCapabilityState[];
  dependencyStatus: RuntimeDependencyStatus;
  dependencyReasonCode?: string;
  dependencyUpdatedAt?: string;
};

function latestIsoTimestamp(values: Array<string | undefined>): string | undefined {
  return values
    .filter((value): value is string => Boolean(value))
    .sort()
    .slice(-1)[0];
}

export function resolveRuntimeSidebarDependencyOverview(
  input: ResolveRuntimeSidebarDependencyOverviewInput,
): RuntimeSidebarDependencyOverview {
  const dependencyCapabilities: RuntimeSidebarDependencyCapabilityState[] = [
    {
      capability: 'chat',
      matched: input.chatCapabilityMatched,
      required: true,
      resolved: input.chatCapabilityResolved,
    },
    {
      capability: 'tts',
      matched: input.ttsCapabilityMatched,
      required: input.isVoiceEnabled,
      resolved: input.ttsCapabilityResolved,
    },
    {
      capability: 'stt',
      matched: input.sttCapabilityMatched,
      required: input.isVoiceEnabled,
      resolved: input.sttCapabilityResolved,
    },
    {
      capability: 'image',
      matched: input.imageCapabilityMatched,
      required: input.mediaPlannerEnabled,
      resolved: input.imageCapabilityResolved,
    },
    {
      capability: 'video',
      matched: input.videoCapabilityMatched,
      required: input.mediaPlannerEnabled,
      resolved: input.videoCapabilityResolved,
    },
  ];

  const hasRequiredUnresolved = dependencyCapabilities.some((item) => item.required && !item.resolved);
  const hasRequiredMissing = dependencyCapabilities.some((item) => item.required && item.resolved && !item.matched);
  const hasRepairActions = input.dependencyRepairActionCount > 0;
  const mediaStatuses = [input.imageDependencyStatus, input.videoDependencyStatus].filter(Boolean);

  const dependencyStatus: RuntimeDependencyStatus = (() => {
    if (hasRequiredUnresolved) {
      return 'unknown';
    }
    if (input.isLocalSnapshotFailure) {
      if (hasRequiredMissing) {
        return 'missing';
      }
      return hasRepairActions ? 'degraded' : 'ready';
    }
    const snapshotStatus = input.dependencySnapshotStatus || 'unknown';
    if (snapshotStatus === 'unknown') {
      return 'unknown';
    }
    if (hasRequiredMissing) {
      return 'missing';
    }
    if (mediaStatuses.includes('degraded')) {
      return 'degraded';
    }
    if (!input.isVoiceEnabled && !input.mediaPlannerEnabled) {
      return hasRepairActions ? 'degraded' : 'ready';
    }
    return snapshotStatus;
  })();

  const rawReasonCode = String(
    input.dependencySnapshotReasonCode
      || input.imageDependencyReasonCode
      || input.videoDependencyReasonCode
      || '',
  ).trim();

  const dependencyReasonCode = (() => {
    if (!rawReasonCode || dependencyStatus === 'ready' || dependencyStatus === 'unknown') {
      return undefined;
    }
    if (!input.isVoiceEnabled) {
      const normalized = rawReasonCode.toLowerCase();
      if (
        normalized.includes('tts')
        || normalized.includes('stt')
        || normalized.includes('speech')
      ) {
        if (!input.mediaPlannerEnabled) {
          return undefined;
        }
      }
    }
    return rawReasonCode;
  })();

  return {
    dependencyCapabilities,
    dependencyStatus,
    dependencyReasonCode,
    dependencyUpdatedAt: latestIsoTimestamp([
      input.dependencySnapshotUpdatedAt,
      input.imageDependencyUpdatedAt,
      input.videoDependencyUpdatedAt,
    ]),
  };
}
