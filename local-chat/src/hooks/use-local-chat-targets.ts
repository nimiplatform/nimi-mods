import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRendererFlowId, logRendererEvent } from '@nimiplatform/mod-sdk/logging';
import {
  LOCAL_CHAT_DATA_API_CHAT_TARGET_DETAIL,
  LOCAL_CHAT_DATA_API_CHAT_TARGETS_LIST,
} from '../contracts.js';
import type { LocalChatTarget } from '../data/index.js';
import { toTargets } from '../services/view/targets.js';
import {
  getLocalChatSessionUpdatedEventName,
  listLocalChatSessions,
} from '../state/index.js';

type UseLocalChatTargetsInput = {
  hookClient: {
    data: {
      query: (input: { capability: string; query: Record<string, unknown> }) => Promise<unknown>;
    };
  };
  runtimeAgentId: string;
  setStatusBanner: (input: { kind: 'warn' | 'error' | 'success' | 'info'; message: string }) => void;
};

const LOCAL_PREVIEW_MAX_LENGTH = 96;

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

function buildTargetsWithLocalPreview(source: LocalChatTarget[]): LocalChatTarget[] {
  const enriched = source.map((target) => {
    const sessions = listLocalChatSessions(target.id);
    const latestSession = sessions[0] || null;
    const latestTurn = latestSession?.turns?.[latestSession.turns.length - 1] || null;
    const latestLocalMessage = normalizePreviewText(latestTurn?.content);
    const latestLocalMessageAt = latestTurn
      ? String(latestTurn.timestamp || '')
      : String(latestSession?.updatedAt || '').trim();
    return {
      ...target,
      latestLocalMessage,
      latestLocalMessageAt: latestLocalMessageAt || null,
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

  const loadTargets = useCallback(async () => {
    if (loadTargetsInFlightRef.current) {
      return loadTargetsInFlightRef.current;
    }
    setLoadingTargets(true);
    const flowId = createRendererFlowId('local-chat-targets');
    const task = (async () => {
      try {
        const result = await input.hookClient.data.query({
          capability: LOCAL_CHAT_DATA_API_CHAT_TARGETS_LIST,
          query: {},
        });
        const nextTargets = buildTargetsWithLocalPreview(toTargets(result));
        setTargets(nextTargets);
        setTargetDetailsById((previous) => {
          const next = { ...previous };
          const allowed = new Set(nextTargets.map((item) => item.id));
          Object.keys(next).forEach((id) => {
            if (!allowed.has(id)) {
              delete next[id];
            }
          });
          return next;
        });
        setSelectedTargetId((previous) => {
          if (previous && nextTargets.some((item) => item.id === previous)) {
            return previous;
          }
          if (nextTargets.length === 0) {
            return '';
          }
          const preferred = nextTargets.find((item) => item.id === input.runtimeAgentId) || nextTargets[0];
          return preferred?.id || '';
        });
        logRendererEvent({
          level: 'info',
          area: 'local-chat',
          message: 'local-chat:targets-sync:done',
          flowId,
          details: { count: nextTargets.length },
        });
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
        setLoadingTargets(false);
        loadTargetsInFlightRef.current = null;
      }
    })();
    loadTargetsInFlightRef.current = task;
    return task;
  }, [input.hookClient.data, input.runtimeAgentId, input.setStatusBanner]);

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
      setTargets((previous) => buildTargetsWithLocalPreview(previous));
    };
    window.addEventListener(eventName, onSessionUpdated);
    return () => {
      window.removeEventListener(eventName, onSessionUpdated);
    };
  }, []);

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
