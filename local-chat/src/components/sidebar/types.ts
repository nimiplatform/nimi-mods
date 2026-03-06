import type {
  RuntimeCanonicalCapability,
  RuntimeRouteBinding,
  RuntimeRouteOptionsSnapshot,
  RuntimeRouteSource,
} from '@nimiplatform/sdk/mod/runtime-route';
import type { LocalChatBooleanSettingKey, LocalChatDefaultSettings, LocalChatPromptTrace, LocalChatTurnAudit } from '../../state/index.js';
import type { HealthStatus } from '../../types.js';

export type RuntimeStatusSidebarProps = {
  healthStatus: HealthStatus;
  checkingHealth: boolean;
  chatRouteOptions: RuntimeRouteOptionsSnapshot | null;
  imageRouteOptions: RuntimeRouteOptionsSnapshot | null;
  videoRouteOptions: RuntimeRouteOptionsSnapshot | null;
  routeBinding: RuntimeRouteBinding | null;
  speechVoices: Array<{ id: string; name: string }>;
  voiceCatalogSource?: string;
  voiceCatalogModelResolved?: string;
  voiceCatalogVersion?: string;
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
    capability: RuntimeCanonicalCapability;
    matched: boolean;
    required: boolean;
  }>;
  dependencyStatus: 'ready' | 'missing' | 'degraded' | 'unknown';
  dependencyReasonCode?: string;
  dependencyUpdatedAt?: string;
  dependencyRepairActions: Array<{
    actionId: string;
    label: string;
    reasonCode: string;
    dependencyId?: string;
    capability?: RuntimeCanonicalCapability;
  }>;
  latestPromptTrace: LocalChatPromptTrace | null;
  latestTurnAudit: LocalChatTurnAudit | null;
  onRouteSourceChange: (source: RuntimeRouteSource) => void;
  onRouteConnectorChange: (connectorId: string) => void;
  onRouteModelChange: (model: string) => void;
  onClearRouteBinding: () => void;
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
};
