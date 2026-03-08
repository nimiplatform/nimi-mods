import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRendererFlowId, logRendererEvent } from '@nimiplatform/sdk/mod/logging';
import {
  LOCAL_CHAT_DATA_API_CHAT_TARGET_DETAIL,
} from '../contracts.js';
import {
  CORE_DATA_API_FRIENDS_WITH_DETAILS_LIST,
  deriveLocalChatTargetsFromFriendsPayload,
  type LocalChatTarget,
} from '../data/index.js';
import {
  getLocalChatSessionUpdatedEventName,
  listLocalChatTargetPreviews,
} from '../state/index.js';

type UseLocalChatTargetsInput = {
  hookClient: {
    data: {
      query: (input: { capability: string; query: Record<string, unknown> }) => Promise<unknown>;
    };
  };
  viewerId: string;
  runtimeAgentId: string;
  setStatusBanner: (input: { kind: 'warn' | 'error' | 'success' | 'info'; message: string }) => void;
};

const LOCAL_PREVIEW_MAX_LENGTH = 96;
const LOCAL_CHAT_LAST_TARGET_STORAGE_KEY = 'nimi.local-chat.last-target.v1';

function readPersistedTargetId(viewerId: string): string {
  if (typeof window === 'undefined' || !window.localStorage) {
    return '';
  }
  try {
    const raw = window.localStorage.getItem(`${LOCAL_CHAT_LAST_TARGET_STORAGE_KEY}:${viewerId}`);
    return String(raw || '').trim();
  } catch {
    return '';
  }
}

function writePersistedTargetId(viewerId: string, targetId: string): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  const storageKey = `${LOCAL_CHAT_LAST_TARGET_STORAGE_KEY}:${viewerId}`;
  try {
    if (targetId) {
      window.localStorage.setItem(storageKey, targetId);
      return;
    }
    window.localStorage.removeItem(storageKey);
  } catch {
    // Ignore storage write failures; selection still lives in memory.
  }
}

function toTimestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePreviewText(value: unknown): string | null {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  if (normalized.length <= LOCAL_PREVIEW_MAX_LENGTH) return normalized;
  return `${normalized.slice(0, LOCAL_PREVIEW_MAX_LENGTH - 1)}…`;
}

async function buildTargetsWithLocalPreview(source: LocalChatTarget[], viewerId: string): Promise<LocalChatTarget[]> {
  const previews = await listLocalChatTargetPreviews(viewerId);
  const previewsByTargetId = new Map(
    previews.map((preview) => [preview.targetId, preview]),
  );
  const enriched = source.map((target) => {
    const preview = previewsByTargetId.get(target.id);
    return {
      ...target,
      latestLocalMessage: normalizePreviewText(preview?.latestLocalMessage),
      latestLocalMessageAt: String(preview?.latestLocalMessageAt || '').trim() || null,
    };
  });

  enriched.sort((a, b) => {
    const timeDiff = toTimestamp(b.latestLocalMessageAt || null) - toTimestamp(a.latestLocalMessageAt || null);
    if (timeDiff !== 0) return timeDiff;
    return a.displayName.localeCompare(b.displayName, 'en');
  });

  return enriched;
}

export function useLocalChatTargets(input: UseLocalChatTargetsInput) {
  const [targets, setTargets] = useState<LocalChatTarget[]>([]);
  const [targetSearchText, setTargetSearchText] = useState('');
  const [targetDetailsById, setTargetDetailsById] = useState<Record<string, LocalChatTarget>>({});
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [loadingTargetDetail, setLoadingTargetDetail] = useState(false);
  const loadTargetsInFlightRef = useRef<Promise<void> | null>(null);
  const autoLoadStartedRef = useRef(false);
  const previewRefreshTokenRef = useRef(0);
  const previewRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);
  const targetsRef = useRef<LocalChatTarget[]>([]);
  const lastRenderStateKeyRef = useRef('');

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (previewRefreshTimerRef.current) {
        clearTimeout(previewRefreshTimerRef.current);
        previewRefreshTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    targetsRef.current = targets;
  }, [targets]);

  useEffect(() => {
    const targetId = String(selectedTargetId || '').trim();
    if (!targetId) {
      return;
    }
    writePersistedTargetId(input.viewerId, targetId);
  }, [input.viewerId, selectedTargetId]);

  const selectedTargetBase = useMemo(
    () => targets.find((target) => target.id === selectedTargetId) || null,
    [selectedTargetId, targets],
  );
  const selectedTarget = useMemo(() => {
    if (!selectedTargetBase) return null;
    const detail = targetDetailsById[selectedTargetBase.id];
    return detail
      ? {
        ...selectedTargetBase,
        ...detail,
      }
      : selectedTargetBase;
  }, [selectedTargetBase, targetDetailsById]);
  const selectedTargetHasDetail = useMemo(
    () => Boolean(selectedTargetBase && targetDetailsById[selectedTargetBase.id]),
    [selectedTargetBase, targetDetailsById],
  );
  const visibleTargets = useMemo(() => {
    const query = targetSearchText.trim().toLowerCase();
    if (!query) {
      return targets;
    }
    return targets.filter((target) => {
      const displayName = String(target.displayName || '').toLowerCase();
      const handle = String(target.handle || '').toLowerCase();
      const latestLocalMessage = String(target.latestLocalMessage || '').toLowerCase();
      return displayName.includes(query) || handle.includes(query) || latestLocalMessage.includes(query);
    });
  }, [targetSearchText, targets]);

  useEffect(() => {
    const nextKey = [
      targets.length,
      visibleTargets.length,
      loadingTargets ? '1' : '0',
      selectedTargetId,
      targetSearchText,
    ].join('|');
    if (nextKey === lastRenderStateKeyRef.current) {
      return;
    }
    lastRenderStateKeyRef.current = nextKey;
    logRendererEvent({
      level: 'info',
      area: 'local-chat',
      message: 'local-chat:targets-render-state',
      details: {
        targetsCount: targets.length,
        visibleTargetsCount: visibleTargets.length,
        loadingTargets,
        selectedTargetId: selectedTargetId || null,
        targetSearchText,
      },
    });
  }, [loadingTargets, selectedTargetId, targetSearchText, targets.length, visibleTargets.length]);

  const syncTargetsWithLocalPreview = useCallback(async (sourceTargets: LocalChatTarget[], flowId: string) => {
    const previewRefreshToken = previewRefreshTokenRef.current + 1;
    previewRefreshTokenRef.current = previewRefreshToken;
    try {
      const nextTargets = await buildTargetsWithLocalPreview(sourceTargets, input.viewerId);
      if (!mountedRef.current || previewRefreshTokenRef.current !== previewRefreshToken) {
        return;
      }
      targetsRef.current = nextTargets;
      setTargets(nextTargets);
      logRendererEvent({
        level: 'info',
        area: 'local-chat',
        message: 'local-chat:targets-preview-sync:done',
        flowId,
        details: { count: nextTargets.length },
      });
    } catch (error) {
      if (!mountedRef.current || previewRefreshTokenRef.current !== previewRefreshToken) {
        return;
      }
      logRendererEvent({
        level: 'warn',
        area: 'local-chat',
        message: 'local-chat:targets-preview-sync:failed',
        flowId,
        details: { error: error instanceof Error ? error.message : String(error || '') },
      });
    }
  }, [input.viewerId]);

  const schedulePreviewSync = useCallback((sourceTargets: LocalChatTarget[], flowId: string, delayMs = 0) => {
    if (previewRefreshTimerRef.current) {
      clearTimeout(previewRefreshTimerRef.current);
    }
    previewRefreshTimerRef.current = setTimeout(() => {
      previewRefreshTimerRef.current = null;
      if (!mountedRef.current || sourceTargets.length === 0) {
        return;
      }
      void syncTargetsWithLocalPreview(sourceTargets, flowId);
    }, delayMs);
  }, [syncTargetsWithLocalPreview]);

  const loadTargets = useCallback(async () => {
    if (loadTargetsInFlightRef.current) {
      return loadTargetsInFlightRef.current;
    }
    setLoadingTargets(true);
    const flowId = createRendererFlowId('local-chat-targets');
    const task = (async () => {
      try {
        const result = await input.hookClient.data.query({
          capability: CORE_DATA_API_FRIENDS_WITH_DETAILS_LIST,
          query: {},
        });
        const baseTargets = deriveLocalChatTargetsFromFriendsPayload(result);
        if (!mountedRef.current) {
          return;
        }
        targetsRef.current = baseTargets;
        setTargets(baseTargets);
        setTargetDetailsById((previous) => {
          const next = { ...previous };
          const allowed = new Set(baseTargets.map((item) => item.id));
          Object.keys(next).forEach((id) => {
            if (!allowed.has(id)) {
              delete next[id];
            }
          });
          return next;
        });
        setSelectedTargetId((previous) => {
          if (previous && baseTargets.some((item) => item.id === previous)) {
            return previous;
          }
          return '';
        });
        logRendererEvent({
          level: 'info',
          area: 'local-chat',
          message: 'local-chat:targets-sync:done',
          flowId,
          details: {
            count: baseTargets.length,
            previewMode: 'deferred',
          },
        });
        schedulePreviewSync(baseTargets, flowId);
      } catch (error) {
        logRendererEvent({
          level: 'error',
          area: 'local-chat',
          message: 'local-chat:targets-sync:failed',
          flowId,
          details: { error: error instanceof Error ? error.message : String(error || '') },
        });
        input.setStatusBanner({
          kind: 'error',
          message: error instanceof Error ? error.message : String(error || ''),
        });
      } finally {
        if (mountedRef.current) {
          setLoadingTargets(false);
        }
        loadTargetsInFlightRef.current = null;
      }
    })();
    loadTargetsInFlightRef.current = task;
    return task;
  }, [input.hookClient.data, input.setStatusBanner, schedulePreviewSync]);

  useEffect(() => {
    if (autoLoadStartedRef.current) return;
    autoLoadStartedRef.current = true;
    void loadTargets();
  }, [loadTargets]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
      return undefined;
    }
    const eventName = getLocalChatSessionUpdatedEventName();
    const onSessionUpdated = () => {
      const currentTargets = targetsRef.current;
      if (currentTargets.length === 0 || !mountedRef.current) {
        return;
      }
      schedulePreviewSync(currentTargets, createRendererFlowId('local-chat-targets-preview'), 80);
    };
    window.addEventListener(eventName, onSessionUpdated);
    return () => {
      if (previewRefreshTimerRef.current) {
        clearTimeout(previewRefreshTimerRef.current);
        previewRefreshTimerRef.current = null;
      }
      window.removeEventListener(eventName, onSessionUpdated);
    };
  }, [schedulePreviewSync]);

  useEffect(() => {
    if (!selectedTargetBase || selectedTargetHasDetail) return;
    let cancelled = false;
    const flowId = createRendererFlowId('local-chat-target-detail');
    setLoadingTargetDetail(true);
    void input.hookClient.data.query({
      capability: LOCAL_CHAT_DATA_API_CHAT_TARGET_DETAIL,
      query: {
        target: selectedTargetBase,
      },
    }).then((payload) => {
      if (cancelled) return;
      if (!payload || typeof payload !== 'object') return;
      const detail = payload as LocalChatTarget;
      if (!detail.id) return;
      setTargetDetailsById((previous) => ({
        ...previous,
        [detail.id]: detail,
      }));
      logRendererEvent({
        level: 'info',
        area: 'local-chat',
        message: 'local-chat:target-detail:sync-done',
        flowId,
        details: {
          targetId: detail.id,
          worldId: detail.worldId,
          hasWorld: Boolean(detail.world || detail.worldview),
        },
      });
    }).catch((error) => {
      if (cancelled) return;
      logRendererEvent({
        level: 'warn',
        area: 'local-chat',
        message: 'local-chat:target-detail:failed',
        flowId,
        details: {
          targetId: selectedTargetBase.id,
          error: error instanceof Error ? error.message : String(error || ''),
        },
      });
    }).finally(() => {
      if (!cancelled) {
        setLoadingTargetDetail(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [input.hookClient.data, selectedTargetBase, selectedTargetHasDetail]);

  return {
    targets,
    selectedTargetId,
    setSelectedTargetId,
    selectedTarget,
    targetSearchText,
    setTargetSearchText,
    visibleTargets,
    loadingTargets,
    loadingTargetDetail,
    loadTargets,
  };
}
