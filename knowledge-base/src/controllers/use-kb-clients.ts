// ---------------------------------------------------------------------------
// Client factory hook — creates SDK clients, route snapshots, and adapters
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createHookClient } from '@nimiplatform/sdk/mod/hook';
import { createModRuntimeClient, type ModRuntimeClient } from '@nimiplatform/sdk/mod/runtime';
import type { HookClient } from '@nimiplatform/sdk/mod/types';
import type { RuntimeRouteBinding, RuntimeRouteOptionsSnapshot } from '@nimiplatform/sdk/mod/runtime-route';
import { KB_MOD_ID } from '../contracts.js';
import { createLlmClientAdapter } from '../adapters/llm-adapter.js';
import { createEmbeddingClientAdapter } from '../adapters/embedding-adapter.js';
import type { LlmClient, EmbeddingClient, KBSettings, KBRoutePreference } from '../types.js';
import { createKBFlowId, emitKBLog } from '../logging.js';

type RouteCapability = 'text.generate' | 'text.embed';

export function useHookClient(): HookClient {
  return useMemo(() => createHookClient(KB_MOD_ID), []);
}

export function useRuntimeClient(): ModRuntimeClient {
  return useMemo(() => createModRuntimeClient(KB_MOD_ID), []);
}

function asString(value: unknown): string {
  return String(value || '').trim();
}

function resolveTokenApiBindingFromOptions(
  options: RuntimeRouteOptionsSnapshot | null,
  preferredConnectorId: string,
  preferredModel: string,
): RuntimeRouteBinding | undefined {
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

  if (!connectorId || !model) {
    return undefined;
  }

  return {
    source: 'token-api',
    connectorId,
    model,
  };
}

function resolveLocalRuntimeBindingFromOptions(
  options: RuntimeRouteOptionsSnapshot | null,
  preferredModel: string,
): RuntimeRouteBinding | undefined {
  if (!options) return undefined;
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
  if (!model) {
    return undefined;
  }
  return {
    source: 'local-runtime',
    connectorId: '',
    model,
    ...(localModelId ? { localModelId } : {}),
    ...(asString(fallbackModel?.engine) ? { engine: asString(fallbackModel?.engine) } : {}),
  };
}

function resolveConfiguredBinding(
  preference: KBRoutePreference,
  options: RuntimeRouteOptionsSnapshot | null,
): RuntimeRouteBinding | undefined {
  if (preference.source === 'auto') return undefined;
  if (preference.source === 'token-api') {
    return resolveTokenApiBindingFromOptions(options, preference.connectorId, preference.model);
  }
  return resolveLocalRuntimeBindingFromOptions(options, preference.model);
}

export function useKBClients(
  runtimeClient: ModRuntimeClient,
  settings: KBSettings,
) {
  const [chatRouteOptions, setChatRouteOptions] = useState<RuntimeRouteOptionsSnapshot | null>(null);
  const [embeddingRouteOptions, setEmbeddingRouteOptions] = useState<RuntimeRouteOptionsSnapshot | null>(null);

  const loadRouteOptions = useCallback(async (capability: RouteCapability): Promise<RuntimeRouteOptionsSnapshot | null> => {
    const flowId = createKBFlowId(`route-options-${capability}`);
    try {
      const options = await runtimeClient.route.listOptions({ capability });

      emitKBLog({
        level: 'info',
        message: 'route-options:loaded',
        flowId,
        source: 'useKBClients.loadRouteOptions',
        details: {
          capability,
          selectedSource: options.selected.source,
          selectedConnectorId: options.selected.connectorId || null,
          selectedModel: options.selected.model || null,
          connectorsCount: options.connectors.length,
          localModelsCount: options.localRuntime.models.length,
        },
      });
      if (capability === 'text.generate') {
        setChatRouteOptions(options);
      } else {
        setEmbeddingRouteOptions(options);
      }
      return options;
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
      if (capability === 'text.generate') {
        setChatRouteOptions(null);
      } else {
        setEmbeddingRouteOptions(null);
      }
      return null;
    }
  }, [runtimeClient]);

  const refreshRouteOptions = useCallback(async () => {
    await Promise.all([
      loadRouteOptions('text.generate'),
      loadRouteOptions('text.embed'),
    ]);
  }, [loadRouteOptions]);

  useEffect(() => {
    void refreshRouteOptions();
    const timer = setInterval(() => {
      void refreshRouteOptions();
    }, 15000);
    return () => clearInterval(timer);
  }, [refreshRouteOptions]);

  const configuredChatBinding = useMemo(
    () => resolveConfiguredBinding({
      source: settings.chatRouteSource,
      connectorId: settings.chatConnectorId,
      model: settings.chatModel,
    }, chatRouteOptions),
    [settings.chatRouteSource, settings.chatConnectorId, settings.chatModel, chatRouteOptions],
  );

  const configuredEmbeddingBinding = useMemo(
    () => resolveConfiguredBinding({
      source: settings.embeddingRouteSource,
      connectorId: settings.embeddingConnectorId,
      model: settings.embeddingModel,
    }, embeddingRouteOptions),
    [
      settings.embeddingRouteSource,
      settings.embeddingConnectorId,
      settings.embeddingModel,
      embeddingRouteOptions,
    ],
  );

  const llmClient: LlmClient = useMemo(
    () => createLlmClientAdapter(runtimeClient, {
      resolveRoute: () => ({
        binding: configuredChatBinding || chatRouteOptions?.selected,
      }),
    }),
    [
      runtimeClient,
      configuredChatBinding,
      chatRouteOptions,
    ],
  );

  const embeddingClient: EmbeddingClient = useMemo(
    () => createEmbeddingClientAdapter(runtimeClient, {
      resolveRoute: () => ({
        binding: configuredEmbeddingBinding || embeddingRouteOptions?.selected,
      }),
    }),
    [
      runtimeClient,
      configuredEmbeddingBinding,
      embeddingRouteOptions,
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
