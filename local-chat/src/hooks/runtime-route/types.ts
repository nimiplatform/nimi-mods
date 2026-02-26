import type { RuntimeRouteBinding, RuntimeRouteOptionsSnapshot } from '@nimiplatform/sdk/mod/runtime-route';

export type ChatRouteSnapshot = {
  source: string;
  provider: string;
  model: string;
  endpoint: string;
  connectorId: string;
};

export type UseLocalChatRuntimeRouteInput = {
  aiClient: {
    resolveRoute: (input: {
      routeHint: 'chat/default';
      routeOverride?: RuntimeRouteBinding;
    }) => Promise<{
      source: string;
      provider: string;
      model: string;
      connectorId: string;
      localProviderEndpoint?: string;
      localOpenAiEndpoint?: string;
    }>;
    checkRouteHealth: (input: {
      routeHint: 'chat/default';
      routeOverride?: RuntimeRouteBinding;
    }) => Promise<unknown>;
  };
  hookClient: {
    data: {
      query: (input: { capability: string; query: Record<string, unknown> }) => Promise<unknown>;
    };
  };
  setStatusBanner: (input: { kind: 'warn' | 'error' | 'success' | 'info'; message: string }) => void;
};

export type LocalChatRouteStateSetters = {
  setRouteSnapshot: (value: ChatRouteSnapshot | null) => void;
  setChatRouteOptions: (value: RuntimeRouteOptionsSnapshot | null) => void;
  setHealthStatus: (value: 'idle' | 'checking' | 'healthy' | 'unreachable') => void;
  setCheckingHealth: (value: boolean) => void;
};
