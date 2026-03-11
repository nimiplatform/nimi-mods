// ---------------------------------------------------------------------------
// Route selector — loads available connectors for chat + TTS, manages selection
// Route data comes from runtime.route.* only:
//   1. runtime.route.listOptions() for capability-scoped options
//   2. runtime.route.resolve() for effective route binding
//   3. Periodic polling to keep options fresh
// ---------------------------------------------------------------------------

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  parseRuntimeRouteOptions,
  type RuntimeCanonicalCapability,
  type RuntimeRouteConnectorOption,
  type RuntimeRouteOptionsSnapshot,
} from '@nimiplatform/sdk/mod/runtime-route';
import type { ModRuntimeClient } from '@nimiplatform/sdk/mod/runtime';

export type RouteSelection = {
  connectorId: string;
  routeSource: 'auto' | 'local' | 'cloud';
  model?: string;
};

export type TtsRouteState = {
  chatConnectors: RuntimeRouteConnectorOption[];
  ttsConnectors: RuntimeRouteConnectorOption[];
  chatSelection: RouteSelection;
  ttsSelection: RouteSelection;
  loading: boolean;
  error: string | null;
  selectChatConnector: (connectorId: string) => void;
  selectChatModel: (model: string) => void;
  selectTtsConnector: (connectorId: string) => void;
};

const STORAGE_KEY_CHAT = 'audio-book:chat-connector';
const STORAGE_KEY_TTS = 'audio-book:tts-connector';
const QUERY_TIMEOUT_MS = 8000;
const LOG_PREFIX = '[audio-book:route]';
const RETRY_DELAYS_MS = [0, 300, 800, 1500];
const POLL_INTERVAL_WITH_CONNECTORS_MS = 15_000;
const POLL_INTERVAL_WITHOUT_CONNECTORS_MS = 30_000;
const TTS_MODEL_HINTS = ['tts', 'speech', 'audio', 'voice'];
const NON_CHAT_MODEL_HINTS = ['tts', 'speech', 'audio', 'voice', 'embedding', 'embed', 'rerank'];
const DASHSCOPE_TTS_MODEL_PREFERENCES = [
  'qwen3-tts-instruct-flash',
  'qwen3-tts-instruct',
  'qwen-tts-latest',
];
const OPENAI_TTS_MODEL_PREFERENCES = [
  'gpt-4o-mini-tts',
  'gpt-4o-audio-preview',
];

function ensureRouteOptionsSnapshotShape(
  snapshot: RuntimeRouteOptionsSnapshot | null,
): RuntimeRouteOptionsSnapshot | null {
  if (!snapshot) {
    return null;
  }
  return {
    ...snapshot,
    local: {
      models: snapshot.local?.models || [],
      defaultEndpoint: snapshot.local?.defaultEndpoint,
    },
    connectors: Array.isArray(snapshot.connectors) ? snapshot.connectors : [],
  };
}

function loadPersisted(key: string): RouteSelection {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      const persistedModel = String(parsed.model || '').trim();
      return {
        connectorId: String(parsed.connectorId || ''),
        routeSource: parsed.routeSource === 'cloud' ? 'cloud' : parsed.routeSource === 'local' ? 'local' : 'auto',
        model: persistedModel && !isPlaceholderModel(persistedModel) ? persistedModel : undefined,
      };
    }
  } catch { /* ignore */ }
  return { connectorId: '', routeSource: 'auto' };
}

function persist(key: string, selection: RouteSelection): void {
  try {
    localStorage.setItem(key, JSON.stringify(selection));
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
async function loadRouteOptions(
  runtimeClient: ModRuntimeClient,
  capability: RuntimeCanonicalCapability,
): Promise<RuntimeRouteOptionsSnapshot | null> {
  try {
    const rawSnapshot = await Promise.race<unknown>([
      runtimeClient.route.listOptions({ capability }),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`Route options timeout (${QUERY_TIMEOUT_MS}ms)`)),
          QUERY_TIMEOUT_MS,
        );
      }),
    ]);
    const snapshot = ensureRouteOptionsSnapshotShape(
      parseRuntimeRouteOptions(rawSnapshot, {
        includeResolvedDefault: true,
      }),
    );
    if (!snapshot) {
      throw new Error('AUDIO_BOOK_ROUTE_OPTIONS_INVALID');
    }
    console.info(LOG_PREFIX, 'loadRouteOptions:ok', {
      capability,
      selectedSource: snapshot.selected.source,
      selectedConnectorId: snapshot.selected.connectorId || '(none)',
      connectorsCount: snapshot.connectors.length,
      connectorIds: snapshot.connectors.map((connector) => connector.id),
    });
    return snapshot;
  } catch (err) {
    console.warn(LOG_PREFIX, 'loadRouteOptions:failed', {
      capability,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function resolveRouteBinding(
  runtimeClient: ModRuntimeClient,
  capability: RuntimeCanonicalCapability,
  selection?: RouteSelection,
): Promise<{ source: string; connectorId: string; model: string } | null> {
  try {
    const resolved = await runtimeClient.route.resolve({
      capability,
      binding: selection
        ? {
          source: selection.routeSource === 'cloud' || selection.routeSource === 'local'
            ? selection.routeSource
            : 'cloud',
          connectorId: String(selection.connectorId || '').trim(),
          model: String(selection.model || '').trim(),
        }
        : undefined,
    });
    console.info(LOG_PREFIX, 'resolveRoute:ok', {
      capability,
      source: resolved.source,
      connectorId: resolved.connectorId || '(none)',
      model: resolved.model || '(none)',
      provider: resolved.provider || '(none)',
    });
    return {
      source: String(resolved.source || ''),
      connectorId: String(resolved.connectorId || ''),
      model: String(resolved.model || ''),
    };
  } catch (err) {
    console.warn(LOG_PREFIX, 'resolveRoute:failed', {
      capability,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Selection resolver
// ---------------------------------------------------------------------------
type RouteSelectionFallback = {
  connectorId: string;
  model: string;
};

function normalizeModel(model: string): string {
  return String(model || '').trim();
}

function isPlaceholderModel(model: string): boolean {
  const normalized = normalizeModel(model).toLowerCase();
  return !normalized || normalized === 'local-model' || normalized.endsWith('/local-model');
}

function isVoiceDesignTtsModel(model: string): boolean {
  const normalized = normalizeModel(model).toLowerCase();
  if (!normalized) return false;
  if (normalized.includes('tts-vd')) return true;
  if (normalized.includes('-vd-')) return true;
  if (/(^|[-_/])vd($|[-_/])/.test(normalized) && normalized.includes('tts')) return true;
  return false;
}

function isLikelyTtsModel(model: string): boolean {
  const normalized = normalizeModel(model).toLowerCase();
  if (!normalized) return false;
  if (isVoiceDesignTtsModel(normalized)) return false;
  if (TTS_MODEL_HINTS.some((hint) => normalized.includes(hint))) return true;
  if (normalized.includes('qwen3-tts')) return true;
  if (normalized.includes('gpt-4o-mini-tts')) return true;
  return false;
}

function pickByPreferredPrefix(
  models: string[],
  preferences: string[],
): string {
  for (const pref of preferences) {
    const exact = models.find((model) => model.toLowerCase() === pref.toLowerCase());
    if (exact) return exact;
  }
  for (const pref of preferences) {
    const matched = models.find((model) => model.toLowerCase().startsWith(pref.toLowerCase()));
    if (matched) return matched;
  }
  return '';
}

function isLikelyChatModel(model: string): boolean {
  const normalized = normalizeModel(model).toLowerCase();
  if (!normalized) return false;
  if (isPlaceholderModel(normalized)) return false;
  if (isVoiceDesignTtsModel(normalized)) return false;
  if (NON_CHAT_MODEL_HINTS.some((hint) => normalized.includes(hint))) return false;
  return true;
}

function pickChatModelForConnector(
  connectors: RuntimeRouteConnectorOption[],
  connectorId: string,
  fallbackModel: string,
): string {
  const matched = connectors.find((item) => item.id === connectorId) || null;
  const target = matched || connectors[0] || null;
  if (!target) {
    const fallback = normalizeModel(fallbackModel);
    return fallback && !isPlaceholderModel(fallback) ? fallback : 'cloud/default';
  }

  const normalizedModels = target.models.map((item) => normalizeModel(item)).filter(Boolean);
  const safeChatModels = normalizedModels.filter((item) => isLikelyChatModel(item));
  if (safeChatModels.length > 0) return safeChatModels[0]!;

  const normalizedFallback = normalizeModel(fallbackModel);
  if (normalizedFallback && isLikelyChatModel(normalizedFallback)) return normalizedFallback;

  return 'cloud/default';
}

function listChatModelsForConnector(
  connectors: RuntimeRouteConnectorOption[],
  connectorId: string,
): string[] {
  const matched = connectors.find((item) => item.id === connectorId) || null;
  if (!matched) return [];
  return matched.models
    .map((item) => normalizeModel(item))
    .filter((item, index, array) => Boolean(item) && isLikelyChatModel(item) && array.indexOf(item) === index);
}

function inferProviderDefaultTtsModel(connector: RuntimeRouteConnectorOption | null): string {
  if (!connector) return '';
  const signal = `${connector.id} ${connector.label} ${connector.vendor || ''}`.toLowerCase();
  if (signal.includes('dashscope') || signal.includes('alibaba') || signal.includes('qwen')) {
    return 'qwen3-tts-instruct-flash';
  }
  if (signal.includes('openai')) {
    return 'gpt-4o-mini-tts';
  }
  return '';
}

function pickTtsModelForConnector(
  connectors: RuntimeRouteConnectorOption[],
  connectorId: string,
  fallbackModel: string,
): string {
  const matched = connectors.find((item) => item.id === connectorId) || null;
  const target = matched || connectors[0] || null;
  if (!target) return normalizeModel(fallbackModel);

  const normalizedModels = target.models.map((item) => normalizeModel(item)).filter(Boolean);
  const safeModels = normalizedModels.filter((item) => !isVoiceDesignTtsModel(item));
  const signal = `${target.id} ${target.label} ${target.vendor || ''}`.toLowerCase();

  if (signal.includes('dashscope') || signal.includes('alibaba') || signal.includes('qwen')) {
    const preferredDashscope = pickByPreferredPrefix(safeModels, DASHSCOPE_TTS_MODEL_PREFERENCES);
    if (preferredDashscope) return preferredDashscope;
  }
  if (signal.includes('openai')) {
    const preferredOpenAi = pickByPreferredPrefix(safeModels, OPENAI_TTS_MODEL_PREFERENCES);
    if (preferredOpenAi) return preferredOpenAi;
  }

  const ttsModel = safeModels.find((item) => isLikelyTtsModel(item));
  if (ttsModel) return normalizeModel(ttsModel);

  const providerDefault = inferProviderDefaultTtsModel(target);
  if (providerDefault) return providerDefault;

  const normalizedFallback = normalizeModel(fallbackModel);
  if (normalizedFallback && !isVoiceDesignTtsModel(normalizedFallback)) return normalizedFallback;
  if (safeModels.length > 0) return normalizeModel(safeModels[0] || '');
  return '';
}

function hasModelOption(options: string[], model?: string): boolean {
  const normalized = normalizeModel(model || '');
  if (!normalized) return false;
  return options.includes(normalized);
}

function resolveSelection(
  connectors: RuntimeRouteConnectorOption[],
  fallback: RouteSelectionFallback,
  storageKey: string,
  modelPicker: (connectors: RuntimeRouteConnectorOption[], connectorId: string, fallbackModel: string) => string,
  modelOptionsGetter: (connectors: RuntimeRouteConnectorOption[], connectorId: string) => string[],
): RouteSelection {
  const persisted = loadPersisted(storageKey);
  if (persisted.connectorId && connectors.some((c) => c.id === persisted.connectorId)) {
    const options = modelOptionsGetter(connectors, persisted.connectorId);
    const preferredPersistedModel = hasModelOption(options, persisted.model)
      ? normalizeModel(persisted.model || '')
      : '';
    const next: RouteSelection = {
      connectorId: persisted.connectorId,
      routeSource: 'cloud',
      model: preferredPersistedModel || modelPicker(connectors, persisted.connectorId, fallback.model || ''),
    };
    persist(storageKey, next);
    return next;
  }
  if (fallback.connectorId && connectors.some((c) => c.id === fallback.connectorId)) {
    const options = modelOptionsGetter(connectors, fallback.connectorId);
    const nextModel = hasModelOption(options, fallback.model)
      ? normalizeModel(fallback.model)
      : modelPicker(connectors, fallback.connectorId, fallback.model || '');
    const next: RouteSelection = {
      connectorId: fallback.connectorId,
      routeSource: 'cloud',
      model: nextModel || undefined,
    };
    persist(storageKey, next);
    return next;
  }
  if (connectors.length > 0) {
    const first = connectors[0]?.id || '';
    if (!first) {
      return { connectorId: '', routeSource: 'auto', model: fallback.model || undefined };
    }
    const nextModel = modelPicker(connectors, first, fallback.model || '');
    const selection: RouteSelection = {
      connectorId: first,
      routeSource: 'cloud',
      model: nextModel || undefined,
    };
    persist(storageKey, selection);
    return selection;
  }
  if (fallback.connectorId) {
    const selection: RouteSelection = {
      connectorId: fallback.connectorId,
      routeSource: 'cloud',
      model: fallback.model || undefined,
    };
    persist(storageKey, selection);
    return selection;
  }
  return { connectorId: '', routeSource: 'auto', model: undefined };
}

// ---------------------------------------------------------------------------
// Main hook
// ---------------------------------------------------------------------------
export function useTtsRoute(runtimeClient: ModRuntimeClient): TtsRouteState {
  const [chatConnectors, setChatConnectors] = useState<RuntimeRouteConnectorOption[]>([]);
  const [ttsConnectors, setTtsConnectors] = useState<RuntimeRouteConnectorOption[]>([]);
  const [chatSelection, setChatSelection] = useState<RouteSelection>(() => loadPersisted(STORAGE_KEY_CHAT));
  const [ttsSelection, setTtsSelection] = useState<RouteSelection>(() => loadPersisted(STORAGE_KEY_TTS));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadInFlightRef = useRef(new Map<RuntimeCanonicalCapability, Promise<RuntimeRouteOptionsSnapshot | null>>());

  const loadRouteOptionsDeduped = useCallback(async (
    capability: RuntimeCanonicalCapability,
  ): Promise<RuntimeRouteOptionsSnapshot | null> => {
    const existing = loadInFlightRef.current.get(capability);
    if (existing) {
      return existing;
    }
    const task = loadRouteOptions(runtimeClient, capability);
    loadInFlightRef.current.set(capability, task);
    void task.finally(() => {
      if (loadInFlightRef.current.get(capability) === task) {
        loadInFlightRef.current.delete(capability);
      }
    });
    return task;
  }, [runtimeClient]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const [resolvedChat, resolvedTts] = await Promise.all([
        resolveRouteBinding(runtimeClient, 'text.generate'),
        resolveRouteBinding(runtimeClient, 'audio.synthesize'),
      ]);
      if (cancelled) return;

      const resolvedChatConnectorId = resolvedChat?.connectorId || '';
      const resolvedChatModel = resolvedChat?.model || '';
      const resolvedTtsConnectorId = resolvedTts?.connectorId || '';
      const resolvedTtsModel = resolvedTts?.model || '';

      for (const delayMs of RETRY_DELAYS_MS) {
        if (cancelled) return;
        if (delayMs > 0) {
          await new Promise<void>((r) => setTimeout(r, delayMs));
          if (cancelled) return;
        }

        const [chatSnapshot, ttsSnapshot] = await Promise.all([
          loadRouteOptionsDeduped('text.generate'),
          loadRouteOptionsDeduped('audio.synthesize'),
        ]);
        if (chatSnapshot || ttsSnapshot) {
          if (cancelled) return;
          const nextChatConnectors = chatSnapshot?.connectors || [];
          const nextTtsConnectors = ttsSnapshot?.connectors || [];
          setChatConnectors(nextChatConnectors);
          setTtsConnectors(nextTtsConnectors);

          const defaultChatConnectorId = chatSnapshot?.selected?.connectorId || resolvedChatConnectorId;
          const defaultChatModel = pickChatModelForConnector(
            nextChatConnectors,
            defaultChatConnectorId,
            resolvedChatModel || chatSnapshot?.selected?.model || '',
          );
          const defaultTtsConnectorId = resolvedTtsConnectorId || ttsSnapshot?.selected?.connectorId || defaultChatConnectorId;
          const defaultTtsModel = pickTtsModelForConnector(
            nextTtsConnectors,
            defaultTtsConnectorId,
            resolvedTtsModel || ttsSnapshot?.selected?.model || '',
          );
          setChatSelection(resolveSelection(nextChatConnectors, {
            connectorId: defaultChatConnectorId,
            model: defaultChatModel,
          }, STORAGE_KEY_CHAT, pickChatModelForConnector, listChatModelsForConnector));
          setTtsSelection(resolveSelection(nextTtsConnectors, {
            connectorId: defaultTtsConnectorId,
            model: defaultTtsModel,
          }, STORAGE_KEY_TTS, pickTtsModelForConnector, (items, id) => {
            const matched = items.find((item) => item.id === id) || null;
            if (!matched) return [];
            return matched.models.map((item) => normalizeModel(item)).filter((item, index, array) => Boolean(item) && !isVoiceDesignTtsModel(item) && array.indexOf(item) === index);
          }));

          console.info(LOG_PREFIX, 'init:loaded', {
            chatConnectorsCount: nextChatConnectors.length,
            defaultChatConnectorId: defaultChatConnectorId || '(none)',
            selectedChatModel: defaultChatModel || '(none)',
            ttsConnectorsCount: nextTtsConnectors.length,
            defaultTtsConnectorId: defaultTtsConnectorId || '(none)',
            resolvedTtsModel: resolvedTtsModel || '(none)',
            selectedTtsModel: defaultTtsModel || '(none)',
          });

          setError(null);
          setLoading(false);
          return;
        }
      }

      // All retries failed — still use resolvedConnectorId if available
      if (!cancelled) {
        console.warn(LOG_PREFIX, 'init:all-retries-failed', {
          resolvedChatConnectorId: resolvedChatConnectorId || '(none)',
          resolvedTtsConnectorId: resolvedTtsConnectorId || '(none)',
        });
        setError(resolvedChatConnectorId || resolvedTtsConnectorId ? null : 'Failed to load route options');
        setLoading(false);
      }
    }

    init();
    return () => { cancelled = true; };
  }, [loadRouteOptionsDeduped, runtimeClient]);

  useEffect(() => {
    const hasConnectors = chatConnectors.length > 0 || ttsConnectors.length > 0;
    const intervalMs = hasConnectors ? POLL_INTERVAL_WITH_CONNECTORS_MS : POLL_INTERVAL_WITHOUT_CONNECTORS_MS;

    const timer = setInterval(async () => {
      const [chatSnapshot, ttsSnapshot] = await Promise.all([
        loadRouteOptionsDeduped('text.generate'),
        loadRouteOptionsDeduped('audio.synthesize'),
      ]);
      if (chatSnapshot) {
        setChatConnectors(chatSnapshot.connectors);
        const defaultChatModel = pickChatModelForConnector(
          chatSnapshot.connectors,
          chatSnapshot.selected?.connectorId || '',
          chatSelection.model || '',
        );
        setChatSelection(resolveSelection(chatSnapshot.connectors, {
          connectorId: chatSnapshot.selected?.connectorId || '',
          model: defaultChatModel,
        }, STORAGE_KEY_CHAT, pickChatModelForConnector, listChatModelsForConnector));
      }
      if (ttsSnapshot) {
        setTtsConnectors(ttsSnapshot.connectors);
        const defaultTtsConnectorId = ttsSelection.connectorId || ttsSnapshot.selected?.connectorId || '';
        const defaultTtsModel = pickTtsModelForConnector(
          ttsSnapshot.connectors,
          defaultTtsConnectorId,
          ttsSelection.model || '',
        );
        setTtsSelection(resolveSelection(ttsSnapshot.connectors, {
          connectorId: defaultTtsConnectorId,
          model: defaultTtsModel,
        }, STORAGE_KEY_TTS, pickTtsModelForConnector, (items, id) => {
          const matched = items.find((item) => item.id === id) || null;
          if (!matched) return [];
          return matched.models.map((item) => normalizeModel(item)).filter((item, index, array) => Boolean(item) && !isVoiceDesignTtsModel(item) && array.indexOf(item) === index);
        }));
      }
      if (chatSnapshot && ttsSnapshot) {
        setError(null);
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [
    chatConnectors.length,
    chatSelection.model,
    loadRouteOptionsDeduped,
    ttsConnectors.length,
    ttsSelection.connectorId,
    ttsSelection.model,
  ]);

  useEffect(() => {
    if (!ttsSelection.connectorId || ttsSelection.routeSource !== 'cloud') return;
    let cancelled = false;

    async function syncSelectedTtsModel() {
      const resolved = await resolveRouteBinding(runtimeClient, 'audio.synthesize', ttsSelection);
      if (cancelled) return;
      const resolvedModel = String(resolved?.model || '').trim();
      const preferredModel = pickTtsModelForConnector(
        ttsConnectors,
        ttsSelection.connectorId,
        resolvedModel,
      );
      const resolvedIsUsable = resolvedModel
        && !isPlaceholderModel(resolvedModel)
        && !isVoiceDesignTtsModel(resolvedModel);
      const nextModel = preferredModel || (resolvedIsUsable ? resolvedModel : '');
      if (!nextModel) return;

      setTtsSelection((previous) => {
        if (previous.connectorId !== ttsSelection.connectorId) return previous;
        if (previous.model === nextModel) return previous;
        const next: RouteSelection = { ...previous, model: nextModel };
        persist(STORAGE_KEY_TTS, next);
        return next;
      });
    }

    void syncSelectedTtsModel();
    return () => { cancelled = true; };
  }, [runtimeClient, ttsConnectors, ttsSelection.connectorId, ttsSelection.model, ttsSelection.routeSource]);

  const selectChatConnector = useCallback((connectorId: string) => {
    const nextModel = connectorId
      ? pickChatModelForConnector(chatConnectors, connectorId, chatSelection.model || '')
      : undefined;
    const selection: RouteSelection = {
      connectorId,
      routeSource: connectorId ? 'cloud' : 'auto',
      model: connectorId ? nextModel : undefined,
    };
    setChatSelection(selection);
    persist(STORAGE_KEY_CHAT, selection);
  }, [chatConnectors, chatSelection.model]);

  const selectChatModel = useCallback((model: string) => {
    const nextModel = normalizeModel(model);
    setChatSelection((previous) => {
      if (!previous.connectorId) return previous;
      const availableModels = listChatModelsForConnector(chatConnectors, previous.connectorId);
      const resolvedModel = hasModelOption(availableModels, nextModel)
        ? nextModel
        : pickChatModelForConnector(chatConnectors, previous.connectorId, previous.model || '');
      const next: RouteSelection = {
        ...previous,
        model: resolvedModel || undefined,
      };
      persist(STORAGE_KEY_CHAT, next);
      return next;
    });
  }, [chatConnectors]);

  const selectTtsConnector = useCallback((connectorId: string) => {
    const nextModel = connectorId
      ? pickTtsModelForConnector(ttsConnectors, connectorId, ttsSelection.model || '')
      : undefined;
    const selection: RouteSelection = {
      connectorId,
      routeSource: connectorId ? 'cloud' : 'auto',
      model: connectorId ? nextModel : undefined,
    };
    setTtsSelection(selection);
    persist(STORAGE_KEY_TTS, selection);
  }, [ttsConnectors, ttsSelection.model]);

  return useMemo(() => ({
    chatConnectors,
    ttsConnectors,
    chatSelection,
    ttsSelection,
    loading,
    error,
    selectChatConnector,
    selectChatModel,
    selectTtsConnector,
  }), [chatConnectors, ttsConnectors, chatSelection, ttsSelection, loading, error, selectChatConnector, selectChatModel, selectTtsConnector]);
}
