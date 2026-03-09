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
import { MINTYOU_DATA_API_WORLD_ACCESS_ME, MINTYOU_REASON } from '../contracts.js';
import { emitMintYouLog } from '../logging.js';
import { createUlid } from '../utils/ulid.js';
import { getMintYouHookClient } from '../runtime-mod.js';
import { extractScopeKeyFromWorldAccess } from '../realm-contract.js';

const DEFAULT_SCOPE_KEY = 'anonymous';

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
        capability: MINTYOU_DATA_API_WORLD_ACCESS_ME,
        query: {},
      });
      const userId = extractScopeKeyFromWorldAccess(response);
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

        // Guard: if saved at agent-create without a result, fall back to confirm
        const resumeStep =
          existing.currentStep === 'agent-create' && !existing.createdAgentId
            ? 'user-confirm'
            : existing.currentStep;
        store.goToStep(resumeStep);

        if (existing.basicInfo) store.setBasicInfo(existing.basicInfo);
        if (existing.selectedInterests.length > 0) store.setSelectedInterests(existing.selectedInterests);

        // Restore interview state
        if (existing.interviewMessages.length > 0) {
          for (const msg of existing.interviewMessages) {
            store.addInterviewMessage(msg);
          }
        }
        if (existing.interviewSignals.length > 0) {
          store.addInterviewSignals(existing.interviewSignals);
        }
        if (existing.interviewTurnCount > 0) {
          store.setInterviewTurnCount(existing.interviewTurnCount);
        }
        if (existing.interviewValidTurnCount > 0) {
          store.setInterviewValidTurnCount(existing.interviewValidTurnCount);
        }
        if (existing.memoryDigest) {
          store.setMemoryDigest(existing.memoryDigest);
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
  const basicInfo = useMintYouStore((s) => s.basicInfo);
  const selectedInterests = useMintYouStore((s) => s.selectedInterests);
  const interviewMessages = useMintYouStore((s) => s.interviewMessages);
  const interviewSignals = useMintYouStore((s) => s.interviewSignals);
  const interviewTurnCount = useMintYouStore((s) => s.interviewTurnCount);
  const interviewValidTurnCount = useMintYouStore((s) => s.interviewValidTurnCount);
  const memoryDigest = useMintYouStore((s) => s.memoryDigest);
  const traitResult = useMintYouStore((s) => s.traitResult);
  const dnaSynthesis = useMintYouStore((s) => s.dnaSynthesis);
  const traitOverrides = useMintYouStore((s) => s.traitOverrides);
  const referenceImageUrl = useMintYouStore((s) => s.referenceImageUrl);
  const worldId = useMintYouStore((s) => s.worldId);
  const confirmed = useMintYouStore((s) => s.confirmed);
  const createdAgentId = useMintYouStore((s) => s.createdAgentId);

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
        interviewMessages: state.interviewMessages,
        interviewSignals: state.interviewSignals,
        interviewTurnCount: state.interviewTurnCount,
        interviewValidTurnCount: state.interviewValidTurnCount,
        memoryDigest: state.memoryDigest,
        traitResult: state.traitResult,
        dnaSynthesis: state.dnaSynthesis,
        traitOverrides: state.traitOverrides,
        referenceImageUrl: state.referenceImageUrl,
        worldId: state.worldId,
        confirmed: state.confirmed,
        createdAgentId: state.createdAgentId,
      });
      const hookClient = tryGetHookClient();
      void saveSession(scopeKeyRef.current, snapshot, { hookClient }).then((warning) => {
        useMintYouStore.getState().setSessionPersistWarning(warning);
      });
    }, 500);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [
    sessionId,
    currentStep,
    basicInfo,
    selectedInterests,
    interviewMessages,
    interviewSignals,
    interviewTurnCount,
    interviewValidTurnCount,
    memoryDigest,
    traitResult,
    dnaSynthesis,
    traitOverrides,
    referenceImageUrl,
    worldId,
    confirmed,
    createdAgentId,
  ]);

  return { initSession };
}
