import type { RuntimeRouteBinding, RuntimeRouteOptionsSnapshot, RuntimeRouteSource } from '@nimiplatform/sdk/mod/runtime-route';
import type {
  LocalChatBooleanSettingKey,
  LocalChatDefaultSettings,
  LocalChatMediaPlannerMode,
  LocalChatPromptTrace,
  LocalChatTurnAudit,
  LocalChatVideoAutoPolicy,
} from '../../state/index.js';
import type { HealthStatus, LocalChatResolvedMediaRoute } from '../../types.js';

export type RuntimeStatusSidebarProps = {
  healthStatus: HealthStatus;
  checkingHealth: boolean;
  chatRouteOptions: RuntimeRouteOptionsSnapshot | null;
  imageRouteOptions: RuntimeRouteOptionsSnapshot | null;
  videoRouteOptions: RuntimeRouteOptionsSnapshot | null;
  imageResolvedRoute: LocalChatResolvedMediaRoute | null;
  videoResolvedRoute: LocalChatResolvedMediaRoute | null;
  routeOverride: RuntimeRouteBinding | null;
  speechProviders: Array<{ id: string; name: string; status: 'available' | 'unavailable' }>;
  speechVoices: Array<{ id: string; providerId: string; name: string }>;
  selectedSpeechProviderId: string;
  selectedVoiceId: string;
  ttsRouteSource: 'auto' | 'local-runtime' | 'token-api';
  sttRouteSource: 'auto' | 'local-runtime' | 'token-api';
  imageRouteSource: 'auto' | 'local-runtime' | 'token-api';
  videoRouteSource: 'auto' | 'local-runtime' | 'token-api';
  localTtsRouteAvailable: boolean;
  localSttRouteAvailable: boolean;
  autoBoundSource: RuntimeRouteSource | 'mixed' | 'unknown';
  autoBoundModel: string;
  chatCapabilityMatched: boolean;
  dependencyCapabilities: Array<{
    capability: 'chat' | 'tts' | 'stt' | 'image' | 'video';
    matched: boolean;
    required: boolean;
    resolved: boolean;
  }>;
  dependencyStatus: 'ready' | 'missing' | 'degraded' | 'unknown';
  dependencyReasonCode?: string;
  dependencyUpdatedAt?: string;
  isMediaRuntimeSidebarLoading: boolean;
  isImageRouteProbeLoading: boolean;
  isVideoRouteProbeLoading: boolean;
  dependencyRepairActions: Array<{
    actionId: string;
    label: string;
    reasonCode: string;
    dependencyId?: string;
    capability?: string;
  }>;
  latestPromptTrace: LocalChatPromptTrace | null;
  latestTurnAudit: LocalChatTurnAudit | null;
  onRouteSourceChange: (source: RuntimeRouteSource) => void;
  onRouteConnectorChange: (connectorId: string) => void;
  onRouteModelChange: (model: string) => void;
  onClearRouteOverride: () => void;
  onSpeechProviderChange: (providerId: string) => void;
  onVoiceIdChange: (voiceId: string) => void;
  ttsConnectorId: string;
  ttsModel: string;
  sttConnectorId: string;
  sttModel: string;
  imageConnectorId: string;
  imageModel: string;
  videoConnectorId: string;
  videoModel: string;
  ttsConnectors: Array<{ id: string; label: string; models: string[]; modelCapabilities?: Record<string, string[]> }>;
  sttConnectors: Array<{ id: string; label: string; models: string[]; modelCapabilities?: Record<string, string[]> }>;
  imageConnectors: Array<{ id: string; label: string; models: string[]; modelCapabilities?: Record<string, string[]> }>;
  videoConnectors: Array<{ id: string; label: string; models: string[]; modelCapabilities?: Record<string, string[]> }>;
  onTtsRouteSourceChange: (source: 'auto' | 'local-runtime' | 'token-api') => void;
  onTtsConnectorChange: (connectorId: string) => void;
  onTtsModelChange: (model: string) => void;
  onSttRouteSourceChange: (source: 'auto' | 'local-runtime' | 'token-api') => void;
  onSttConnectorChange: (connectorId: string) => void;
  onSttModelChange: (model: string) => void;
  onImageRouteSourceChange: (source: 'auto' | 'local-runtime' | 'token-api') => void;
  onImageConnectorChange: (connectorId: string) => void;
  onImageModelChange: (model: string) => void;
  onVideoRouteSourceChange: (source: 'auto' | 'local-runtime' | 'token-api') => void;
  onVideoConnectorChange: (connectorId: string) => void;
  onVideoModelChange: (model: string) => void;
  onHealthCheck: () => void;
  onOpenRuntimeSetup: () => void;
  defaultSettings: LocalChatDefaultSettings;
  onDefaultSettingChange: (key: LocalChatBooleanSettingKey, value: boolean) => void;
  onDefaultVoiceNameChange: (value: string) => void;
  onMediaPlannerModeChange: (value: LocalChatMediaPlannerMode) => void;
  onVideoAutoPolicyChange: (value: LocalChatVideoAutoPolicy) => void;
  onRefreshMediaDependencies: () => void;
  onSidebarBootstrap: () => void;
  onOpenChatPanel: () => void;
  onOpenVoicePanel: () => void;
  onOpenMediaPanel: () => void;
};
