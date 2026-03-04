import { useCallback, useEffect, useRef } from 'react';
import type { HookClient } from '@nimiplatform/sdk/mod/types';
import { useMintYouStore } from '../state/mint-you-store.js';
import {
  loadSession,
  saveSession,
  clearSession,
  isSessionExpired,
  buildSessionSnapshot,
} from '../services/session-manager.js';
import { MINTYOU_DATA_API_WORLDS_MINE, MINTYOU_REASON } from '../contracts.js';
import { emitMintYouLog } from '../logging.js';
import { createUlid } from '../utils/ulid.js';
import { getMintYouHookClient } from '../runtime-mod.js';

const DEFAULT_SCOPE_KEY = 'anonymous';

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function toStringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function extractUserIdFromRecord(record: Record<string, unknown>): string {
  const owner = toRecord(record.owner);
  const user = toRecord(record.user);
  const candidates = [
    record.currentUserId,
    record.userId,
    record.ownerId,
    record.accountId,
    owner.id,
    owner.userId,
    user.id,
    user.userId,
  ];
  for (const value of candidates) {
    const id = toStringOrEmpty(value);
    if (id) return id;
  }
  return '';
}

function extractScopeKeyFromWorldsResponse(response: unknown): string {
  const root = toRecord(response);
  const topLevel = extractUserIdFromRecord(root);
  if (topLevel) return topLevel;

  const itemsRaw = Array.isArray(root.items)
    ? root.items
    : (Array.isArray(root.data) ? root.data : (Array.isArray(response) ? response : []));

  for (const item of itemsRaw) {
    const id = extractUserIdFromRecord(toRecord(item));
    if (id) return id;
  }

  return '';
}

function tryGetHookClient(): HookClient | null {
  try {
    return getMintYouHookClient();
  } catch {
    return null;
  }
}

export function useMintYouSession() {
  const store = useMintYouStore();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scopeKeyRef = useRef<string>(DEFAULT_SCOPE_KEY);

  const resolveScopeKey = useCallback(async (hookClient: HookClient | null): Promise<string> => {
    if (!hookClient) return DEFAULT_SCOPE_KEY;
    try {
      const response = await hookClient.data.query({
        capability: MINTYOU_DATA_API_WORLDS_MINE,
        query: {},
      });
      const userId = extractScopeKeyFromWorldsResponse(response);
      return userId || DEFAULT_SCOPE_KEY;
    } catch {
      return DEFAULT_SCOPE_KEY;
    }
  }, []);

  const initSession = useCallback(async () => {
    const hookClient = tryGetHookClient();
    const scopeKey = await resolveScopeKey(hookClient);
    scopeKeyRef.current = scopeKey;

    const existing = await loadSession(scopeKey, { hookClient });

    if (existing) {
      if (isSessionExpired(existing)) {
        await clearSession(scopeKey, { hookClient });
        store.setError({
          reasonCode: MINTYOU_REASON.SESSION_EXPIRED_WARN,
          message: 'Session data expired after 7 days of inactivity.',
          actionHint: 'Restart intake flow.',
        });
        emitMintYouLog({
          level: 'warn',
          message: 'action:session:expired',
          source: 'useMintYouSession',
          details: { sessionId: existing.sessionId },
        });
        // Start fresh
        const newId = createUlid();
        store.startNewSession(newId);
      } else {
        // Resume existing session
        store.setSessionId(existing.sessionId);
        store.goToStep(existing.currentStep);
        if (existing.basicInfo) store.setBasicInfo(existing.basicInfo);
        if (existing.selectedInterests.length > 0) store.setSelectedInterests(existing.selectedInterests);
        if (Object.keys(existing.scenarioChoices).length > 0) {
          for (const [scenarioId, choiceId] of Object.entries(existing.scenarioChoices)) {
            store.setScenarioChoice(scenarioId, choiceId);
          }
        }
        if (existing.traitResult) store.setTraitResult(existing.traitResult);
        if (existing.dnaSynthesis) store.setDnaSynthesis(existing.dnaSynthesis);
        if (existing.traitOverrides) store.setTraitOverrides(existing.traitOverrides);
        if (existing.referenceImageUrl) store.setReferenceImageUrl(existing.referenceImageUrl);
        if (existing.worldId) store.setWorldId(existing.worldId);
        if (existing.createdAgentId) store.setCreatedAgentId(existing.createdAgentId);

        emitMintYouLog({
          message: 'action:session:resumed',
          source: 'useMintYouSession',
          details: { sessionId: existing.sessionId, step: existing.currentStep, scopeKey },
        });
      }
    } else {
      const newId = createUlid();
      store.startNewSession(newId);
      emitMintYouLog({
        message: 'action:session:started',
        source: 'useMintYouSession',
        details: { sessionId: newId, scopeKey },
      });
    }
  }, [resolveScopeKey, store]);

  // Auto-save on state changes (debounced)
  const currentStep = useMintYouStore((s) => s.currentStep);
  const sessionId = useMintYouStore((s) => s.sessionId);

  useEffect(() => {
    if (!sessionId) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      const state = useMintYouStore.getState();
      const snapshot = buildSessionSnapshot({
        sessionId: state.sessionId!,
        userId: scopeKeyRef.current,
        currentStep: state.currentStep,
        basicInfo: state.basicInfo,
        selectedInterests: state.selectedInterests,
        scenarioChoices: state.scenarioChoices,
        traitResult: state.traitResult,
        dnaSynthesis: state.dnaSynthesis,
        traitOverrides: state.traitOverrides,
        referenceImageUrl: state.referenceImageUrl,
        worldId: state.worldId,
        confirmed: state.confirmed,
        createdAgentId: state.createdAgentId,
      });
      const hookClient = tryGetHookClient();
      void saveSession(scopeKeyRef.current, snapshot, { hookClient });
    }, 500);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [sessionId, currentStep]);

  return { initSession };
}
