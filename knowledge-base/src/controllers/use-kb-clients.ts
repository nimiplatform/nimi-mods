// ---------------------------------------------------------------------------
// Client factory hook — creates SDK clients, route snapshots, and adapters
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createAiClient, type ModAiClient } from '@nimiplatform/sdk/mod/ai';
import { createHookClient } from '@nimiplatform/sdk/mod/hook';
import type { HookClient } from '@nimiplatform/sdk/mod/types';
import { parseRuntimeRouteOptions, type RuntimeRouteOptionsSnapshot } from '@nimiplatform/sdk/mod/runtime-route';
import { KB_DATA_API_ROUTE_OPTIONS, KB_MOD_ID } from '../contracts.js';
import { createLlmClientAdapter } from '../adapters/llm-adapter.js';
import { createEmbeddingClientAdapter } from '../adapters/embedding-adapter.js';
import type { LlmClient, EmbeddingClient, KBSettings } from '../types.js';
import { createKBFlowId, emitKBLog } from '../logging.js';

type RouteCapability = 'chat' | 'embedding';
type EffectiveRouteOverride = {
  source: 'local-runtime' | 'token-api';
  connectorId?: string;
  model?: string;
  localModelId?: string;
};
type TokenApiRouteOverride = {
  source: 'token-api';
  connectorId?: string;
  model?: string;
};

export function useHookClient(): HookClient {
  return useMemo(() => createHookClient(KB_MOD_ID), []);
}

export function useAiClient(): ModAiClient {
  return useMemo(() => createAiClient(KB_MOD_ID), []);
}

function asString(value: unknown): string {
  return String(value || '').trim();
}

function resolveTokenApiRouteOverrideFromOptions(
  options: RuntimeRouteOptionsSnapshot | null,
  preferredConnectorId: string,
  preferredModel: string,
): TokenApiRouteOverride | undefined {
  if (!options) return undefined;
  const targetConnectorId = asString(preferredConnectorId);
  const selectedConnectorId = options.selected.source === 'token-api'
    ? asString(options.selected.connectorId)
    : '';
  const connector = (
    (targetConnectorId ? options.connectors.find((item) => item.id === targetConnectorId) : null)
    || (selectedConnectorId ? options.connectors.find((item) => item.id === selectedConnectorId) : null)
    || options.connectors[0]
    || null
  );
  const connectorId = asString(connector?.id || targetConnectorId || selectedConnectorId);

  const preferred = asString(preferredModel);
  const selectedModel = options.selected.source === 'token-api'
    ? asString(options.selected.model)
    : '';
  const connectorModels = connector?.models || [];
  const model = (
    (preferred && (connectorModels.length === 0 || connectorModels.includes(preferred)) ? preferred : '')
    || (selectedModel && (connectorModels.length === 0 || connectorModels.includes(selectedModel)) ? selectedModel : '')
    || asString(connectorModels[0])
    || preferred
    || selectedModel
  );

  return {
    source: 'token-api',
    ...(connectorId ? { connectorId } : {}),
    ...(model ? { model } : {}),
  };
}

function resolveLocalRuntimeRouteOverrideFromOptions(
  options: RuntimeRouteOptionsSnapshot | null,
  preferredModel: string,
): EffectiveRouteOverride {
  const targetModel = asString(preferredModel);
  const selectedModel = options?.selected.source === 'local-runtime'
    ? asString(options.selected.model)
    : '';
  const matchedModel = options?.localRuntime.models.find((item) => {
    const model = asString(item.model);
    const localModelId = asString(item.localModelId);
    return (targetModel && (model === targetModel || localModelId === targetModel))
      || (selectedModel && (model === selectedModel || localModelId === selectedModel));
  }) || null;
  const fallbackModel = matchedModel || options?.localRuntime.models[0] || null;
  const model = asString(matchedModel?.model || targetModel || selectedModel || fallbackModel?.model);
  const localModelId = asString(matchedModel?.localModelId || fallbackModel?.localModelId);
  return {
    source: 'local-runtime',
    ...(model ? { model } : {}),
    ...(localModelId ? { localModelId } : {}),
  };
}

function resolveConfiguredRouteOverride(
  source: KBSettings['chatRouteSource'] | KBSettings['embeddingRouteSource'],
  options: RuntimeRouteOptionsSnapshot | null,
  connectorId: string,
  model: string,
): EffectiveRouteOverride | undefined {
  if (source === 'auto') return undefined;
  if (source === 'token-api') {
    return resolveTokenApiRouteOverrideFromOptions(options, connectorId, model) || { source: 'token-api' };
  }
  return resolveLocalRuntimeRouteOverrideFromOptions(options, model);
}

export function useKBClients(
  aiClient: ModAiClient,
  hookClient: HookClient,
  settings: KBSettings,
) {
  const [chatRouteOptions, setChatRouteOptions] = useState<RuntimeRouteOptionsSnapshot | null>(null);
  const [embeddingRouteOptions, setEmbeddingRouteOptions] = useState<RuntimeRouteOptionsSnapshot | null>(null);

  const loadRouteOptions = useCallback(async (capability: RouteCapability): Promise<RuntimeRouteOptionsSnapshot | null> => {
    const flowId = createKBFlowId(`route-options-${capability}`);
    try {
      const payload = await hookClient.data.query({
        capability: KB_DATA_API_ROUTE_OPTIONS,
        query: {
          capability,
          modId: KB_MOD_ID,
        },
      });
      const parsed = parseRuntimeRouteOptions(payload, { includeResolvedDefault: true });
      if (!parsed) {
        emitKBLog({
          level: 'warn',
          message: 'route-options:parse-failed',
          flowId,
          source: 'useKBClients.loadRouteOptions',
          details: { capability },
        });
        if (capability === 'chat') {
          setChatRouteOptions(null);
        } else {
          setEmbeddingRouteOptions(null);
        }
        return null;
      }

      emitKBLog({
        level: 'info',
        message: 'route-options:loaded',
        flowId,
        source: 'useKBClients.loadRouteOptions',
        details: {
          capability,
          selectedSource: parsed.selected.source,
          selectedConnectorId: parsed.selected.connectorId || null,
          selectedModel: parsed.selected.model || null,
          connectorsCount: parsed.connectors.length,
          localModelsCount: parsed.localRuntime.models.length,
        },
      });
      if (capability === 'chat') {
        setChatRouteOptions(parsed);
      } else {
        setEmbeddingRouteOptions(parsed);
      }
      return parsed;
    } catch (error) {
      emitKBLog({
        level: 'warn',
        message: 'route-options:query-failed',
        flowId,
        source: 'useKBClients.loadRouteOptions',
        details: {
          capability,
          error: error instanceof Error ? error.message : String(error || ''),
        },
      });
      return null;
    }
  }, [hookClient]);

  const refreshRouteOptions = useCallback(async () => {
    await Promise.all([
      loadRouteOptions('chat'),
      loadRouteOptions('embedding'),
    ]);
  }, [loadRouteOptions]);

  useEffect(() => {
    void refreshRouteOptions();
    const timer = setInterval(() => {
      void refreshRouteOptions();
    }, 15000);
    return () => clearInterval(timer);
  }, [refreshRouteOptions]);

  const configuredChatRouteOverride = useMemo(
    () => resolveConfiguredRouteOverride(
      settings.chatRouteSource,
      chatRouteOptions,
      settings.chatConnectorId,
      settings.chatModel,
    ),
    [settings.chatRouteSource, settings.chatConnectorId, settings.chatModel, chatRouteOptions],
  );

  const configuredEmbeddingRouteOverride = useMemo(
    () => resolveConfiguredRouteOverride(
      settings.embeddingRouteSource,
      embeddingRouteOptions,
      settings.embeddingConnectorId,
      settings.embeddingModel,
    ),
    [
      settings.embeddingRouteSource,
      settings.embeddingConnectorId,
      settings.embeddingModel,
      embeddingRouteOptions,
    ],
  );

  const resolveChatTokenApiRouteOverride = useCallback(async (): Promise<TokenApiRouteOverride | undefined> => {
    const current = resolveTokenApiRouteOverrideFromOptions(
      chatRouteOptions,
      settings.chatConnectorId,
      settings.chatModel,
    );
    if (current?.connectorId) return current;
    const loaded = await loadRouteOptions('chat');
    return resolveTokenApiRouteOverrideFromOptions(loaded, settings.chatConnectorId, settings.chatModel) || current;
  }, [chatRouteOptions, settings.chatConnectorId, settings.chatModel, loadRouteOptions]);

  const resolveEmbeddingTokenApiRouteOverride = useCallback(async (): Promise<TokenApiRouteOverride | undefined> => {
    const current = resolveTokenApiRouteOverrideFromOptions(
      embeddingRouteOptions,
      settings.embeddingConnectorId,
      settings.embeddingModel,
    );
    if (current?.connectorId) return current;
    const loaded = await loadRouteOptions('embedding');
    return resolveTokenApiRouteOverrideFromOptions(
      loaded,
      settings.embeddingConnectorId,
      settings.embeddingModel,
    ) || current;
  }, [
    embeddingRouteOptions,
    settings.embeddingConnectorId,
    settings.embeddingModel,
    loadRouteOptions,
  ]);

  const llmClient: LlmClient = useMemo(
    () => createLlmClientAdapter(aiClient, settings.chatRouteSource, {
      preferredRouteOverride: configuredChatRouteOverride,
      resolveTokenApiRouteOverride: settings.chatRouteSource === 'token-api' || settings.chatRouteSource === 'auto'
        ? resolveChatTokenApiRouteOverride
        : undefined,
    }),
    [
      aiClient,
      settings.chatRouteSource,
      configuredChatRouteOverride,
      resolveChatTokenApiRouteOverride,
    ],
  );

  const embeddingClient: EmbeddingClient = useMemo(
    () => createEmbeddingClientAdapter(aiClient, settings.embeddingRouteSource, {
      preferredRouteOverride: configuredEmbeddingRouteOverride,
      resolveTokenApiRouteOverride: settings.embeddingRouteSource === 'token-api' || settings.embeddingRouteSource === 'auto'
        ? resolveEmbeddingTokenApiRouteOverride
        : undefined,
    }),
    [
      aiClient,
      settings.embeddingRouteSource,
      configuredEmbeddingRouteOverride,
      resolveEmbeddingTokenApiRouteOverride,
    ],
  );

  return {
    llmClient,
    embeddingClient,
    chatRouteOptions,
    embeddingRouteOptions,
    refreshRouteOptions,
  };
}
