// ---------------------------------------------------------------------------
// Route selector — loads available connectors for chat + TTS, manages selection
// Modeled after local-chat's useLocalChatRuntimeRoute pattern:
//   1. data.query for route options (with retry)
//   2. aiClient.resolveRoute() for effective route binding
//   3. Periodic polling to keep options fresh
// ---------------------------------------------------------------------------

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  parseRuntimeRouteOptions,
  type RuntimeRouteConnectorOption,
  type RuntimeRouteOptionsSnapshot,
} from '@nimiplatform/sdk/mod/runtime-route';
import type { ModAiClient } from '@nimiplatform/sdk/mod/ai';
import { AUDIO_BOOK_DATA_API_ROUTE_OPTIONS, AUDIO_BOOK_MOD_ID } from '../contracts.js';

type HookClient = {
  data: { query: (input: { capability: string; query: Record<string, unknown> }) => Promise<unknown> };
};

export type RouteSelection = {
  connectorId: string;
  routeSource: 'auto' | 'local-runtime' | 'token-api';
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

function loadPersisted(key: string): RouteSelection {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      const persistedModel = String(parsed.model || '').trim();
      return {
        connectorId: String(parsed.connectorId || ''),
        routeSource: parsed.routeSource === 'token-api' ? 'token-api' : parsed.routeSource === 'local-runtime' ? 'local-runtime' : 'auto',
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
// Query route options via hookClient.data.query (same as local-chat loadRouteOptions)
// ---------------------------------------------------------------------------
async function loadRouteOptions(
  hookClient: HookClient,
): Promise<RuntimeRouteOptionsSnapshot | null> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  try {
    const payload = await Promise.race<unknown>([
      hookClient.data.query({
        capability: AUDIO_BOOK_DATA_API_ROUTE_OPTIONS,
        query: { capability: 'chat', modId: AUDIO_BOOK_MOD_ID },
      }),
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error(`Route options timeout (${QUERY_TIMEOUT_MS}ms)`)),
          QUERY_TIMEOUT_MS,
        );
      }),
    ]).finally(() => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    });

    const parsed = parseRuntimeRouteOptions(payload, { includeResolvedDefault: true });
    if (parsed) {
      console.info(LOG_PREFIX, 'loadRouteOptions:ok', {
        selectedSource: parsed.selected.source,
        selectedConnectorId: parsed.selected.connectorId || '(none)',
        connectorsCount: parsed.connectors.length,
        connectorIds: parsed.connectors.map((c) => c.id),
      });
    }
    return parsed;
  } catch (err) {
    console.warn(LOG_PREFIX, 'loadRouteOptions:failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Resolve route via aiClient.resolveRoute() (like local-chat resolveRouteSnapshot)
// ---------------------------------------------------------------------------
async function resolveRouteBinding(
  aiClient: ModAiClient,
  input: {
    routeHint: string;
    connectorId?: string;
    routeSource?: 'auto' | 'local-runtime' | 'token-api';
  },
): Promise<{ source: string; connectorId: string; model: string } | null> {
  try {
    const routeOverride = (() => {
      const source = input.routeSource === 'token-api' || input.routeSource === 'local-runtime'
        ? input.routeSource
        : undefined;
      const connectorId = String(input.connectorId || '').trim();
      if (!source && !connectorId) return undefined;
      return {
        ...(source ? { source } : {}),
        ...(connectorId ? { connectorId } : {}),
      };
    })();
    const resolved = await aiClient.resolveRoute({
      routeHint: input.routeHint,
      ...(routeOverride ? { routeOverride } : {}),
    });
    console.info(LOG_PREFIX, 'resolveRoute:ok', {
      routeHint: input.routeHint,
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
      routeHint: input.routeHint,
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

function resolveSelection(
  connectors: RuntimeRouteConnectorOption[],
  fallback: RouteSelectionFallback,
  storageKey: string,
): RouteSelection {
  const persisted = loadPersisted(storageKey);
  const preferredPersistedModel = persisted.model && !isPlaceholderModel(persisted.model)
    && !isVoiceDesignTtsModel(persisted.model)
    ? persisted.model
    : undefined;
  if (persisted.connectorId && connectors.some((c) => c.id === persisted.connectorId)) {
    const next: RouteSelection = {
      connectorId: persisted.connectorId,
      routeSource: 'token-api',
      model: preferredPersistedModel || fallback.model || undefined,
    };
    persist(storageKey, next);
    return next;
  }
  if (fallback.connectorId && connectors.some((c) => c.id === fallback.connectorId)) {
    const next: RouteSelection = {
      connectorId: fallback.connectorId,
      routeSource: 'token-api',
      model: fallback.model || preferredPersistedModel || undefined,
    };
    persist(storageKey, next);
    return next;
  }
  if (connectors.length > 0) {
    const first = connectors[0]?.id || '';
    if (!first) {
      return { connectorId: '', routeSource: 'auto', model: fallback.model || preferredPersistedModel || undefined };
    }
    const selection: RouteSelection = {
      connectorId: first,
      routeSource: 'token-api',
      model: fallback.model || preferredPersistedModel || undefined,
    };
    persist(storageKey, selection);
    return selection;
  }
  if (fallback.connectorId) {
    const selection: RouteSelection = {
      connectorId: fallback.connectorId,
      routeSource: 'token-api',
      model: fallback.model || preferredPersistedModel || undefined,
    };
    persist(storageKey, selection);
    return selection;
  }
  return { connectorId: '', routeSource: 'auto', model: undefined };
}

// ---------------------------------------------------------------------------
// Main hook
// ---------------------------------------------------------------------------
export function useTtsRoute(hookClient: HookClient, aiClient: ModAiClient): TtsRouteState {
  const [chatConnectors, setChatConnectors] = useState<RuntimeRouteConnectorOption[]>([]);
  const [ttsConnectors, setTtsConnectors] = useState<RuntimeRouteConnectorOption[]>([]);
  const [chatSelection, setChatSelection] = useState<RouteSelection>(() => loadPersisted(STORAGE_KEY_CHAT));
  const [ttsSelection, setTtsSelection] = useState<RouteSelection>(() => loadPersisted(STORAGE_KEY_TTS));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadInFlightRef = useRef<Promise<RuntimeRouteOptionsSnapshot | null> | null>(null);

  // Safe setter — don't overwrite valid options with null/empty
  const setRouteOptionsSafely = useCallback((
    connectors: RuntimeRouteConnectorOption[],
    defaults: {
      chat: RouteSelectionFallback;
      tts: RouteSelectionFallback;
    },
  ) => {
    setChatConnectors((prev) => connectors.length > 0 ? connectors : prev);
    setTtsConnectors((prev) => connectors.length > 0 ? connectors : prev);

    const safeConnectors = connectors.length > 0 ? connectors : [];
    const chatSel = resolveSelection(safeConnectors, defaults.chat, STORAGE_KEY_CHAT);
    const ttsSel = resolveSelection(safeConnectors, defaults.tts, STORAGE_KEY_TTS);

    if (chatSel.connectorId) setChatSelection(chatSel);
    if (ttsSel.connectorId) setTtsSelection(ttsSel);
  }, []);

  // Load route options with dedup (like local-chat loadChatRuntimeRouteOptions)
  const loadRouteOptionsDeduped = useCallback(async (): Promise<RuntimeRouteOptionsSnapshot | null> => {
    if (loadInFlightRef.current) return loadInFlightRef.current;

    const task = loadRouteOptions(hookClient);
    loadInFlightRef.current = task;
    void task.finally(() => {
      if (loadInFlightRef.current === task) loadInFlightRef.current = null;
    });
    return task;
  }, [hookClient]);

  // Initial load with retry + resolveRoute fallback
  useEffect(() => {
    let cancelled = false;

    async function init() {
      // 1. Try resolveRoute first (fast, doesn't need data capability)
      const [resolvedChat, resolvedTts] = await Promise.all([
        resolveRouteBinding(aiClient, { routeHint: 'chat/default' }),
        resolveRouteBinding(aiClient, { routeHint: 'tts/default' }),
      ]);
      if (cancelled) return;

      const resolvedChatConnectorId = resolvedChat?.connectorId || '';
      const resolvedChatModel = resolvedChat?.model || '';
      const resolvedTtsConnectorId = resolvedTts?.connectorId || '';
      const resolvedTtsModel = resolvedTts?.model || '';

      // If resolveRoute gave us connector(s), use them immediately as initial fallback.
      if (resolvedChatConnectorId || resolvedTtsConnectorId) {
        setRouteOptionsSafely([], {
          chat: { connectorId: resolvedChatConnectorId, model: resolvedChatModel },
          tts: {
            connectorId: resolvedTtsConnectorId || resolvedChatConnectorId,
            model: resolvedTtsModel,
          },
        });
      }

      // 2. Try loading full route options with retry (like local-chat)
      for (const delayMs of RETRY_DELAYS_MS) {
        if (cancelled) return;
        if (delayMs > 0) {
          await new Promise<void>((r) => setTimeout(r, delayMs));
          if (cancelled) return;
        }

        const snapshot = await loadRouteOptionsDeduped();
        if (snapshot) {
          if (cancelled) return;
          const connectors = snapshot.connectors;
          const defaultChatConnectorId = snapshot.selected?.connectorId || resolvedChatConnectorId;
          const defaultChatModel = pickChatModelForConnector(
            connectors,
            defaultChatConnectorId,
            resolvedChatModel || snapshot.selected?.model || '',
          );
          const defaultTtsConnectorId = resolvedTtsConnectorId || defaultChatConnectorId;
          const defaultTtsModel = pickTtsModelForConnector(
            connectors,
            defaultTtsConnectorId,
            resolvedTtsModel,
          );
          setRouteOptionsSafely(connectors, {
            chat: { connectorId: defaultChatConnectorId, model: defaultChatModel },
            tts: { connectorId: defaultTtsConnectorId, model: defaultTtsModel },
          });

          console.info(LOG_PREFIX, 'init:loaded', {
            connectorsCount: connectors.length,
            defaultChatConnectorId: defaultChatConnectorId || '(none)',
            selectedChatModel: defaultChatModel || '(none)',
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
  }, [hookClient, aiClient, loadRouteOptionsDeduped, setRouteOptionsSafely]);

  // Periodic polling (like local-chat)
  useEffect(() => {
    const hasConnectors = chatConnectors.length > 0;
    const intervalMs = hasConnectors ? POLL_INTERVAL_WITH_CONNECTORS_MS : POLL_INTERVAL_WITHOUT_CONNECTORS_MS;

    const timer = setInterval(async () => {
      const snapshot = await loadRouteOptionsDeduped();
      if (snapshot) {
        const defaultChatConnectorId = snapshot.selected?.connectorId || '';
        const defaultChatModel = pickChatModelForConnector(
          snapshot.connectors,
          defaultChatConnectorId,
          chatSelection.model || '',
        );
        const defaultTtsConnectorId = ttsSelection.connectorId || defaultChatConnectorId;
        const defaultTtsModel = pickTtsModelForConnector(
          snapshot.connectors,
          defaultTtsConnectorId,
          ttsSelection.model || '',
        );
        setRouteOptionsSafely(snapshot.connectors, {
          chat: { connectorId: defaultChatConnectorId, model: defaultChatModel },
          tts: { connectorId: defaultTtsConnectorId, model: defaultTtsModel },
        });
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [
    chatConnectors.length,
    chatSelection.model,
    loadRouteOptionsDeduped,
    setRouteOptionsSafely,
    ttsSelection.connectorId,
    ttsSelection.model,
  ]);

  useEffect(() => {
    if (!ttsSelection.connectorId || ttsSelection.routeSource !== 'token-api') return;
    let cancelled = false;

    async function syncSelectedTtsModel() {
      const resolved = await resolveRouteBinding(aiClient, {
        routeHint: 'tts/default',
        connectorId: ttsSelection.connectorId,
        routeSource: 'token-api',
      });
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
  }, [aiClient, ttsConnectors, ttsSelection.connectorId, ttsSelection.routeSource]);

  const selectChatConnector = useCallback((connectorId: string) => {
    const nextModel = connectorId
      ? pickChatModelForConnector(chatConnectors, connectorId, chatSelection.model || '')
      : undefined;
    const selection: RouteSelection = {
      connectorId,
      routeSource: connectorId ? 'token-api' : 'auto',
      model: connectorId ? nextModel : undefined,
    };
    setChatSelection(selection);
    persist(STORAGE_KEY_CHAT, selection);
  }, [chatConnectors, chatSelection.model]);

  const selectTtsConnector = useCallback((connectorId: string) => {
    const nextModel = connectorId
      ? pickTtsModelForConnector(ttsConnectors, connectorId, ttsSelection.model || '')
      : undefined;
    const selection: RouteSelection = {
      connectorId,
      routeSource: connectorId ? 'token-api' : 'auto',
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
    selectTtsConnector,
  }), [chatConnectors, ttsConnectors, chatSelection, ttsSelection, loading, error, selectChatConnector, selectTtsConnector]);
}
