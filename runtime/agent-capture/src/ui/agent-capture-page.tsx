import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  createHookClient,
  createModRuntimeClient,
  useModTranslation,
} from '@nimiplatform/sdk/mod';
import { AGENT_CAPTURE_MOD_ID } from '../contracts.js';
import { getCreatorAgent, listCreatorAgents } from '../services/agent-data.js';
import {
  clearAgentCaptureDraft,
  loadAgentCaptureDraft,
  persistAgentCaptureDraft,
} from '../services/draft-storage.js';
import {
  generateAgentDraft,
  recomputeCurrentBrief,
  runCaptureTurn,
  storeSourceImage,
} from '../services/generation.js';
import { resolveAgentCapturePreferredLanguage } from '../services/language.js';
import {
  loadAgentCaptureRouteState,
  persistAgentCaptureRouteState,
} from '../services/route-storage.js';
import { sanitizeRouteStateAgainstRuntime } from '../services/route-validation.js';
import {
  clearAgentCaptureSession,
  loadAgentCaptureSession,
  persistAgentCaptureSession,
} from '../services/session-storage.js';
import {
  appendSessionMessage,
  buildSourcePromptFromMessages,
  createEmptyDraftSnapshot,
  createEmptyRouteState,
  createEmptySessionState,
  createTimestamp,
  hasMinimumGenerationInput,
  isDraftFactuallyEmpty,
} from '../services/state.js';
import type {
  AgentCaptureAgentSummary,
  AgentCaptureDraftSnapshot,
  AgentCaptureRouteState,
  AgentCaptureSessionState,
} from '../types.js';
import { AgentCaptureSettingsDrawer } from './agent-capture-settings-drawer.js';

function formatTime(value: string): string {
  try {
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function useAgentCaptureClients() {
  return useMemo(() => ({
    hookClient: createHookClient(AGENT_CAPTURE_MOD_ID),
    runtimeClient: createModRuntimeClient(AGENT_CAPTURE_MOD_ID),
  }), []);
}

function TagEditor(input: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const { t } = useModTranslation('agent-capture');
  const [text, setText] = useState(input.value.join(', '));

  useEffect(() => {
    setText(input.value.join(', '));
  }, [input.value]);

  return (
    <div className="rounded-[20px] bg-[#f4faf8] px-4 py-3 text-sm text-[#35524b]">
      <div className="font-medium text-[#18352d]">{t('draft.tags')}</div>
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          const tags = text
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean);
          input.onChange(tags);
        }}
        placeholder={t('draft.tagsPlaceholder')}
        className="mt-2 h-11 w-full rounded-2xl border border-[#d5e8e1] bg-white px-3 text-sm text-[#1f3a34] outline-none transition focus:border-[#8acbb9]"
      />
    </div>
  );
}

export function AgentCapturePage() {
  const { t, i18n } = useModTranslation('agent-capture');
  const { hookClient, runtimeClient } = useAgentCaptureClients();
  const [draft, setDraft] = useState<AgentCaptureDraftSnapshot>(createEmptyDraftSnapshot());
  const [session, setSession] = useState<AgentCaptureSessionState>(createEmptySessionState());
  const [routeState, setRouteState] = useState<AgentCaptureRouteState>(createEmptyRouteState());
  const [selectedAgent, setSelectedAgent] = useState<AgentCaptureAgentSummary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [inputText, setInputText] = useState('');
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsError, setAgentsError] = useState('');
  const [agentOptions, setAgentOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const briefRefreshTokenRef = useRef(0);

  const preferredLanguage = useMemo(() => {
    return resolveAgentCapturePreferredLanguage(
      String(i18n.resolvedLanguage || i18n.language || 'zh'),
    );
  }, [i18n.language, i18n.resolvedLanguage]);

  useEffect(() => {
    void (async () => {
      const [restoredDraft, restoredSession, restoredRouteState] = await Promise.all([
        loadAgentCaptureDraft(),
        loadAgentCaptureSession(),
        loadAgentCaptureRouteState(),
      ]);
      setDraft(restoredDraft || createEmptyDraftSnapshot());
      setSession(restoredSession || createEmptySessionState());
      setRouteState(restoredRouteState);
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (isDraftFactuallyEmpty(draft)) {
      void Promise.all([
        clearAgentCaptureDraft(),
        clearAgentCaptureSession(),
      ]);
      return;
    }
    void persistAgentCaptureDraft(draft);
    void persistAgentCaptureSession(session);
  }, [draft, session, loaded]);

  useEffect(() => {
    if (!loaded) return;
    void persistAgentCaptureRouteState(routeState);
  }, [routeState, loaded]);

  useEffect(() => {
    let cancelled = false;
    if (!draft.selectedAgentId) {
      setSelectedAgent(null);
      return () => {
        cancelled = true;
      };
    }
    if (selectedAgent?.id === draft.selectedAgentId) {
      return () => {
        cancelled = true;
      };
    }
    void getCreatorAgent(hookClient, draft.selectedAgentId).then((agent) => {
      if (!cancelled) {
        setSelectedAgent(agent);
      }
    }).catch((error) => {
      if (!cancelled) {
        setSelectedAgent(null);
        setSession((current) => ({
          ...current,
          surfaceError: error instanceof Error ? error.message : String(error || 'FAILED_TO_LOAD_SELECTED_AGENT'),
        }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [draft.selectedAgentId, hookClient, selectedAgent?.id]);

  useEffect(() => {
    void (async () => {
      setAgentsLoading(true);
      setAgentsError('');
      try {
        const agents = await listCreatorAgents(hookClient);
        setAgentOptions(agents.map((agent) => ({
          id: agent.id,
          label: agent.displayName || agent.handle || agent.id,
        })));
      } catch (error) {
        setAgentsError(error instanceof Error ? error.message : String(error || 'FAILED_TO_LOAD_AGENTS'));
      } finally {
        setAgentsLoading(false);
      }
    })();
  }, [hookClient]);

  function updateDraft(updater: (current: AgentCaptureDraftSnapshot) => AgentCaptureDraftSnapshot) {
    setDraft((current) => ({
      ...updater(current),
      updatedAt: createTimestamp(),
    }));
  }

  function invalidateBrief(options?: { keepInputMode?: boolean }) {
    setSession((current) => ({
      ...current,
      currentBrief: '',
      pendingBriefConfirmation: false,
      workingState: 'idle',
      surfaceError: '',
      inputMode: options?.keepInputMode
        ? current.inputMode
        : current.messages.length > 0
          ? 'dialogue'
          : current.inputMode,
    }));
  }

  async function ensureUsableRouteState(input: {
    includeText?: boolean;
    includeImage?: boolean;
  }): Promise<AgentCaptureRouteState> {
    const sanitized = await sanitizeRouteStateAgainstRuntime(runtimeClient, routeState, input);
    if (sanitized.changed) {
      setRouteState(sanitized.routeState);
      throw new Error('AGENT_CAPTURE_ROUTE_OVERRIDE_INVALID');
    }
    return sanitized.routeState;
  }

  async function refreshBriefForContext(input: {
    nextDraft: AgentCaptureDraftSnapshot;
    nextSelectedAgent: AgentCaptureAgentSummary | null;
  }) {
    const token = ++briefRefreshTokenRef.current;
    if (!hasMinimumGenerationInput(input.nextDraft)) {
      invalidateBrief({ keepInputMode: true });
      return;
    }
    let usableRouteState: AgentCaptureRouteState;
    try {
      usableRouteState = await ensureUsableRouteState({ includeText: true, includeImage: false });
    } catch (error) {
      if (token !== briefRefreshTokenRef.current) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error || 'AGENT_CAPTURE_ROUTE_OVERRIDE_INVALID');
      setSession((current) => ({
        ...current,
        currentBrief: '',
        pendingBriefConfirmation: false,
        workingState: 'idle',
        surfaceError: message === 'AGENT_CAPTURE_ROUTE_OVERRIDE_INVALID'
          ? t('message.routeOverrideReset')
          : message,
      }));
      return;
    }
    setSession((current) => ({
      ...current,
      currentBrief: '',
      pendingBriefConfirmation: false,
      workingState: 'thinking',
      surfaceError: '',
    }));
    try {
      const result = await recomputeCurrentBrief({
        runtimeClient,
        draft: input.nextDraft,
        session: {
          ...session,
          currentBrief: '',
          pendingBriefConfirmation: false,
          workingState: 'thinking',
          surfaceError: '',
        },
        selectedAgent: input.nextSelectedAgent,
        textBinding: usableRouteState.textRouteBinding,
        preferredLanguage,
      });
      if (token !== briefRefreshTokenRef.current) {
        return;
      }
      setSession((current) => ({
        ...current,
        currentBrief: result.brief,
        pendingBriefConfirmation: false,
        workingState: 'idle',
        surfaceError: '',
        lastTextTraceId: result.traceId || current.lastTextTraceId,
      }));
    } catch (error) {
      if (token !== briefRefreshTokenRef.current) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error || 'AGENT_CAPTURE_BRIEF_FAILED');
      setSession((current) => ({
        ...current,
        currentBrief: '',
        pendingBriefConfirmation: false,
        workingState: 'idle',
        surfaceError: message,
      }));
    }
  }

  const hasValidInput = hasMinimumGenerationInput(draft);
  const canGenerate = hasValidInput
    && Boolean(session.currentBrief)
    && session.workingState === 'idle'
    && !session.pendingBriefConfirmation;
  const selectedAgentLabel = selectedAgent
    ? t('message.selectedAgentLabel', {
        name: selectedAgent.displayName,
        handle: selectedAgent.handle ? ` (@${selectedAgent.handle})` : '',
      })
    : t('message.noSelectedAgent');

  async function handleSendMessage() {
    const trimmed = inputText.trim();
    if (!trimmed || session.workingState !== 'idle') return;
    const usableRouteState = await ensureUsableRouteState({ includeText: true, includeImage: false }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error || 'AGENT_CAPTURE_ROUTE_OVERRIDE_INVALID');
      setSession((current) => ({
        ...current,
        surfaceError: message === 'AGENT_CAPTURE_ROUTE_OVERRIDE_INVALID'
          ? t('message.routeOverrideReset')
          : message,
      }));
      return null;
    });
    if (!usableRouteState) return;

    const nextSessionBase = appendSessionMessage({
      ...session,
      pendingBriefConfirmation: false,
      workingState: 'thinking',
      surfaceError: '',
    }, {
      role: 'user',
      kind: 'chat',
      content: trimmed,
    });
    const nextDraftBase = {
      ...draft,
      sourcePrompt: buildSourcePromptFromMessages(nextSessionBase.messages),
      updatedAt: createTimestamp(),
    };

    setSession(nextSessionBase);
    setDraft(nextDraftBase);
    setInputText('');

    try {
      const turn = await runCaptureTurn({
        runtimeClient,
        draft: nextDraftBase,
        session: nextSessionBase,
        selectedAgent,
        textBinding: usableRouteState.textRouteBinding,
        userMessage: trimmed,
        preferredLanguage,
      });
      setSession((current) => appendSessionMessage({
        ...current,
        currentBrief: turn.brief,
        pendingBriefConfirmation: false,
        workingState: 'idle',
        surfaceError: '',
        lastTextTraceId: turn.traceId || current.lastTextTraceId,
      }, {
        role: 'assistant',
        kind: 'chat',
        content: turn.assistantReply,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'AGENT_CAPTURE_TURN_FAILED');
      setSession((current) => appendSessionMessage({
        ...current,
        workingState: 'idle',
        surfaceError: message,
      }, {
        role: 'system',
        kind: 'error',
        content: t('message.loadTurnFailed', { message }),
      }));
    }
  }

  function handlePrepareGenerate() {
    if (!canGenerate) return;
    setSession((current) => appendSessionMessage({
      ...current,
      pendingBriefConfirmation: true,
      workingState: 'awaiting-confirmation',
      surfaceError: '',
    }, {
      role: 'assistant',
      kind: 'brief-confirm',
      content: current.currentBrief,
    }));
  }

  async function handleConfirmGenerate() {
    if (!session.pendingBriefConfirmation || session.workingState !== 'awaiting-confirmation') return;
    const usableRouteState = await ensureUsableRouteState({ includeText: true, includeImage: true }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error || 'AGENT_CAPTURE_ROUTE_OVERRIDE_INVALID');
      setSession((current) => ({
        ...current,
        pendingBriefConfirmation: false,
        workingState: 'idle',
        surfaceError: message === 'AGENT_CAPTURE_ROUTE_OVERRIDE_INVALID'
          ? t('message.routeOverrideReset')
          : message,
      }));
      return null;
    });
    if (!usableRouteState) return;
    setSession((current) => ({
      ...current,
      workingState: 'generating',
      surfaceError: '',
    }));
    try {
      const result = await generateAgentDraft({
        storage: hookClient.storage,
        runtimeClient,
        draft,
        session,
        selectedAgent,
        textBinding: usableRouteState.textRouteBinding,
        imageBinding: usableRouteState.imageRouteBinding,
        preferredLanguage,
      });
      updateDraft((current) => ({
        ...current,
        generatedImage: result.image,
        name: result.draft.name,
        bio: result.draft.bio,
        personaSeed: result.draft.personaSeed,
        tags: result.draft.tags,
        characterReadout: result.draft.characterReadout,
      }));
      setSession((current) => appendSessionMessage({
        ...current,
        pendingBriefConfirmation: false,
        workingState: 'idle',
        surfaceError: '',
        lastTextTraceId: result.textTraceId || current.lastTextTraceId,
        lastImageTraceId: result.imageTraceId || current.lastImageTraceId,
      }, {
        role: 'assistant',
        kind: 'readout',
        content: result.draft.characterReadout,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'AGENT_CAPTURE_GENERATE_FAILED');
      setSession((current) => appendSessionMessage({
        ...current,
        pendingBriefConfirmation: false,
        workingState: 'idle',
        surfaceError: message,
      }, {
        role: 'system',
        kind: 'error',
        content: t('message.generateFailed', { message }),
      }));
    }
  }

  async function handleSelectAgent(nextAgentId: string) {
    const normalized = String(nextAgentId || '').trim();
    const nextDraft = {
      ...draft,
      selectedAgentId: normalized || null,
      updatedAt: createTimestamp(),
    };
    setDraft(nextDraft);
    if (!normalized) {
      setSelectedAgent(null);
      await refreshBriefForContext({
        nextDraft,
        nextSelectedAgent: null,
      });
      return;
    }
    try {
      const agent = await getCreatorAgent(hookClient, normalized);
      setSelectedAgent(agent);
      await refreshBriefForContext({
        nextDraft,
        nextSelectedAgent: agent,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'FAILED_TO_LOAD_SELECTED_AGENT');
      setSelectedAgent(null);
      setSession((current) => ({
        ...current,
        currentBrief: '',
        pendingBriefConfirmation: false,
        surfaceError: message,
      }));
    }
  }

  async function handlePickImage(file: File | null) {
    if (!file) return;
    try {
      const sourceImage = await storeSourceImage(hookClient.storage, draft.id, file);
      const nextDraft = {
        ...draft,
        sourceImage,
        updatedAt: createTimestamp(),
      };
      setDraft(nextDraft);
      await refreshBriefForContext({
        nextDraft,
        nextSelectedAgent: selectedAgent,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'FAILED_TO_STORE_SOURCE_IMAGE');
      setSession((current) => ({
        ...current,
        surfaceError: message,
      }));
    }
  }

  function handleResetDraft() {
    setDraft(createEmptyDraftSnapshot());
    setSession(createEmptySessionState());
    setSelectedAgent(null);
    setInputText('');
  }

  const composeMode = session.inputMode === 'expanded';
  const hasResultEditor = Boolean(draft.generatedImage || draft.name || draft.bio || draft.tags.length > 0);
  const surfaceError = session.surfaceError || agentsError;
  const latestVisibleMessage = useMemo(
    () => session.messages[session.messages.length - 1] || null,
    [session.messages],
  );
  const displayBoardTone = latestVisibleMessage?.kind === 'error'
    ? 'border-red-200 bg-red-50 text-red-700'
    : latestVisibleMessage?.kind === 'readout'
      ? 'border-amber-200 bg-amber-50 text-[#5f4f34]'
      : latestVisibleMessage?.role === 'user'
        ? 'border-[#b8e8d7] bg-[#eefbf5] text-[#173830]'
        : latestVisibleMessage?.kind === 'status'
        ? 'border-[#d8ebe5] bg-[#f5fbf9] text-[#46625b]'
        : 'border-[#d8ebe5] bg-white text-slate-800';
  const displayBoardTitle = latestVisibleMessage?.role === 'user'
    ? t('page.displayLatestInput')
    : latestVisibleMessage?.kind === 'brief-confirm'
      ? t('page.feedbackConfirm')
      : latestVisibleMessage
        ? t('page.feedbackTitle')
        : t('page.feedbackEmptyTitle');
  const confirmedTraitChips = useMemo(() => {
    const chips: string[] = [];
    if (draft.sourceImage?.fileName) {
      chips.push(t('page.sourceImageChip', { name: draft.sourceImage.fileName }));
    }
    if (selectedAgent) {
      chips.push(t('page.currentAgent', { agent: selectedAgentLabel }));
    }
    for (const tag of draft.tags) {
      const normalized = String(tag || '').trim();
      if (normalized) {
        chips.push(normalized);
      }
    }
    return chips;
  }, [draft.sourceImage?.fileName, draft.tags, selectedAgent, selectedAgentLabel, t]);

  return (
    <div
      data-nimi-mod-root="agent-capture"
      className="relative isolate flex h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-[#edf7f4]"
    >
      <AgentCaptureSettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        runtimeClient={runtimeClient}
        textRouteBinding={routeState.textRouteBinding}
        imageRouteBinding={routeState.imageRouteBinding}
        onTextRouteBindingChange={(binding) => {
          setRouteState((current) => ({
            ...current,
            textRouteBinding: binding,
          }));
        }}
        onImageRouteBindingChange={(binding) => {
          setRouteState((current) => ({
            ...current,
            imageRouteBinding: binding,
          }));
        }}
      />

      {imagePreviewOpen && draft.generatedImage ? (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(10,20,18,0.78)] p-6"
          onClick={() => setImagePreviewOpen(false)}
        >
          <button
            type="button"
            className="absolute right-6 top-6 rounded-full border border-white/30 bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur"
            onClick={() => setImagePreviewOpen(false)}
          >
            {t('page.previewClose')}
          </button>
          <div
            className="flex max-h-full max-w-[min(92vw,1100px)] items-center justify-center overflow-hidden rounded-[28px] border border-white/15 bg-[rgba(255,255,255,0.06)] p-4 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.7)]"
            onClick={(event) => event.stopPropagation()}
          >
            <img
              src={draft.generatedImage.url}
              alt={draft.name || 'Generated role'}
              className="max-h-[85vh] w-auto max-w-full object-contain"
            />
          </div>
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 gap-5 px-5 py-5">
        <aside className="flex min-h-0 w-[430px] shrink-0 flex-col">
          <section className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-[34px] border border-[#d8ebe5] bg-white p-5 shadow-[0_24px_60px_-42px_rgba(35,93,77,0.24)]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a948d]">{t('result.eyebrow')}</div>
                <h2 className="mt-1 text-[1.8rem] font-semibold tracking-[-0.03em] text-[#18352d]">
                  {draft.name || t('result.emptyTitle')}
                </h2>
              </div>
              <div className="rounded-full bg-[#eef7f4] px-3 py-1 text-xs text-[#3e5f56]">
                {draft.generatedImage ? t('result.generated') : t('result.pending')}
              </div>
            </div>

            <div className="mt-4 shrink-0 overflow-hidden rounded-[28px] border border-[#e4efec] bg-[#f7fbfa] p-3">
              {draft.generatedImage ? (
                <button
                  type="button"
                  className="group flex min-h-[420px] w-full items-center justify-center rounded-[22px] bg-[linear-gradient(180deg,#f9fcfb_0%,#eef7f4_100%)] p-0 text-left transition hover:bg-[linear-gradient(180deg,#fdfefe_0%,#eef8f5_100%)]"
                  onClick={() => setImagePreviewOpen(true)}
                >
                  <div className="relative flex w-full items-center justify-center">
                    <img
                      src={draft.generatedImage.url}
                      alt={draft.name || 'Generated role'}
                      className="max-h-[620px] w-full object-contain object-top"
                    />
                    <div className="pointer-events-none absolute bottom-4 right-4 rounded-full bg-[rgba(17,44,37,0.72)] px-3 py-1 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100">
                      {t('page.previewImage')}
                    </div>
                  </div>
                </button>
              ) : (
                <div className="flex min-h-[420px] w-full items-center justify-center rounded-[22px] bg-[linear-gradient(180deg,#f9fcfb_0%,#eef7f4_100%)] px-10 text-center text-sm leading-6 text-[#7d918b]">
                  {t('result.emptyImage')}
                </div>
              )}
            </div>

            <div className="mt-4 shrink-0 rounded-[24px] bg-[#f5faf8] p-4 text-sm leading-6 text-[#35524b]">
              {draft.characterReadout || t('result.emptyReadout')}
            </div>

            {hasResultEditor ? (
              <div className="mt-4 shrink-0 space-y-3">
                <div className="rounded-[20px] bg-[#f4faf8] px-4 py-3 text-sm text-[#35524b]">
                  <div className="font-medium text-[#18352d]">{t('draft.name')}</div>
                  <input
                    value={draft.name}
                    onChange={(event) => updateDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))}
                    placeholder={t('draft.namePlaceholder')}
                    className="mt-2 h-11 w-full rounded-2xl border border-[#d5e8e1] bg-white px-3 text-sm text-[#1f3a34] outline-none transition focus:border-[#8acbb9]"
                  />
                </div>

                <div className="rounded-[20px] bg-[#f4faf8] px-4 py-3 text-sm text-[#35524b]">
                  <div className="font-medium text-[#18352d]">{t('draft.bio')}</div>
                  <textarea
                    value={draft.bio}
                    onChange={(event) => updateDraft((current) => ({
                      ...current,
                      bio: event.target.value,
                    }))}
                    placeholder={t('draft.bioPlaceholder')}
                    className="mt-2 min-h-[110px] w-full resize-none rounded-2xl border border-[#d5e8e1] bg-white px-3 py-3 text-sm leading-6 text-[#1f3a34] outline-none transition focus:border-[#8acbb9]"
                  />
                </div>

                <TagEditor
                  value={draft.tags}
                  onChange={(nextTags) => updateDraft((current) => ({
                    ...current,
                    tags: nextTags,
                  }))}
                />

                {draft.personaSeed ? (
                  <div className="rounded-[20px] bg-[#f4faf8] px-4 py-3 text-sm text-[#35524b]">
                    <div className="font-medium text-[#18352d]">{t('draft.personaSeed')}</div>
                    <div className="mt-1 whitespace-pre-wrap text-xs leading-6">{draft.personaSeed}</div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-[34px] border border-[#d8ebe5] bg-[linear-gradient(180deg,#fbfffe_0%,#f3fbf8_100%)] p-5 shadow-[0_24px_60px_-42px_rgba(35,93,77,0.4)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#76a596]">{t('page.eyebrow')}</p>
              <h1 className="mt-2 text-[2.25rem] font-semibold tracking-[-0.04em] text-[#18352d]">{t('page.title')}</h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="rounded-full border border-[#d7e7e2] bg-white px-4 py-2 text-sm font-medium text-[#36534b]"
                onClick={() => setSession((current) => ({
                  ...current,
                  inputMode: current.inputMode === 'expanded' ? 'dialogue' : 'expanded',
                }))}
              >
                {composeMode ? t('page.advancedCollapse') : t('page.advancedExpand')}
              </button>
              <button
                type="button"
                className="rounded-full border border-[#d7e7e2] bg-white px-4 py-2 text-sm font-medium text-[#36534b]"
                onClick={handleResetDraft}
              >
                {t('page.reset')}
              </button>
              <button
                type="button"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#d7e7e2] bg-white text-[#36534b]"
                onClick={() => setSettingsOpen(true)}
                title={t('page.settings')}
                aria-label={t('page.settings')}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82L4.21 7.2a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            </div>
          </div>

          <div className={`mt-5 grid min-h-0 flex-1 gap-5 ${composeMode ? 'lg:grid-cols-[minmax(0,1fr)_320px]' : 'grid-cols-1'}`}>
            <div className="flex min-h-0 flex-col overflow-hidden rounded-[30px] border border-[#d8ebe5] bg-[#f5fbf9]">
              <div className="shrink-0 border-b border-[#dcece7] bg-white/88 px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a948d]">{t('page.briefPanelTitle')}</div>
                    <div className="mt-2 text-sm leading-7 text-[#35524b]">
                      {session.currentBrief || t('page.currentBriefEmpty')}
                    </div>
                  </div>
                  <div className="shrink-0 rounded-full bg-white px-3 py-1 text-xs text-[#557069]">
                    {session.workingState === 'idle'
                      ? t('page.working.ready')
                      : session.workingState === 'thinking'
                        ? t('page.working.thinking')
                        : session.workingState === 'awaiting-confirmation'
                          ? t('page.working.confirming')
                          : t('page.working.generating')}
                  </div>
                </div>

                <div className="mt-4 rounded-[18px] bg-[#f5faf8] px-3 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7a948d]">
                    {t('page.confirmedTraitsTitle')}
                  </div>
                  {confirmedTraitChips.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {confirmedTraitChips.map((chip) => (
                        <span
                          key={chip}
                          className="rounded-full bg-white px-3 py-1.5 text-xs leading-5 text-[#557069]"
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2 text-xs leading-5 text-[#6a8079]">
                      {t('page.confirmedTraitsEmpty')}
                    </div>
                  )}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                <div className={`flex min-h-full flex-col rounded-[28px] border px-5 py-5 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.18)] ${displayBoardTone}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a948d]">{t('page.displayBoard')}</div>
                    {latestVisibleMessage ? (
                      <div className="text-[11px] text-slate-400">{formatTime(latestVisibleMessage.createdAt)}</div>
                    ) : null}
                  </div>

                  <div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7a948d]">
                    {displayBoardTitle}
                  </div>

                  <div className="mt-3 flex-1 whitespace-pre-wrap break-words text-sm leading-7 [overflow-wrap:anywhere]">
                    {latestVisibleMessage?.content || t('page.emptyState')}
                  </div>

                  {latestVisibleMessage?.kind === 'brief-confirm' && session.pendingBriefConfirmation ? (
                    <div className="mt-5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-full bg-[#173830] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                        disabled={session.workingState === 'generating'}
                        onClick={() => void handleConfirmGenerate()}
                      >
                        {session.workingState === 'generating' ? t('page.generating') : t('page.generateWithBrief')}
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-[#d7e7e2] bg-white px-4 py-2 text-xs font-semibold text-[#36534b]"
                        onClick={() => setSession((current) => ({
                          ...current,
                          pendingBriefConfirmation: false,
                          workingState: 'idle',
                        }))}
                      >
                        {t('page.continueDiscuss')}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="shrink-0 border-t border-[#dcece7] bg-white px-5 py-4">
                <div className="flex flex-col gap-3">
                  <textarea
                    value={inputText}
                    onChange={(event) => setInputText(event.target.value)}
                    placeholder={t('page.inputPlaceholder')}
                    className="min-h-[112px] w-full resize-none rounded-[24px] border border-[#d5e8e1] bg-[#f8fcfb] px-4 py-3 text-sm leading-6 text-[#1f3a34] outline-none transition focus:border-[#8acbb9]"
                  />

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="rounded-full bg-[#173830] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                      onClick={() => void handleSendMessage()}
                      disabled={session.workingState !== 'idle' || !inputText.trim()}
                    >
                      {t('page.continueChat')}
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-[#173830] bg-white px-5 py-2.5 text-sm font-semibold text-[#173830] disabled:opacity-50"
                      onClick={handlePrepareGenerate}
                      disabled={!canGenerate}
                    >
                      {t('page.generate')}
                    </button>
                  </div>

                  {surfaceError ? (
                    <div className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {surfaceError}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {composeMode ? (
              <aside className="flex min-h-0 flex-col overflow-hidden rounded-[30px] border border-[#d8ebe5] bg-[#f5fbf9]">
                <div className="shrink-0 border-b border-[#dcece7] bg-white/88 px-4 py-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a948d]">{t('page.supportTitle')}</div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                  <div className="space-y-4">
                    <div className="rounded-[24px] border border-[#d5e8e1] bg-[#f8fcfb] p-4">
                      <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a948d]">
                        {t('page.sourceImageLabel')}
                      </label>
                      <button
                        type="button"
                        className="mt-3 w-full rounded-[24px] border border-dashed border-[#c7ddd6] bg-white px-4 py-4 text-left text-sm text-[#36534b]"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {draft.sourceImage?.fileName || t('page.sourceImageEmpty')}
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0] || null;
                          void handlePickImage(file);
                          event.currentTarget.value = '';
                        }}
                      />
                      {draft.sourceImage ? (
                        <button
                          type="button"
                          className="mt-2 text-left text-xs text-[#8b6d62]"
                          onClick={() => {
                            const nextDraft = {
                              ...draft,
                              sourceImage: null,
                              updatedAt: createTimestamp(),
                            };
                            setDraft(nextDraft);
                            void refreshBriefForContext({
                              nextDraft,
                              nextSelectedAgent: selectedAgent,
                            });
                          }}
                        >
                          {t('page.sourceImageRemove')}
                        </button>
                      ) : null}
                    </div>

                    <div className="rounded-[24px] border border-[#d5e8e1] bg-[#f8fcfb] p-4">
                      <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a948d]">
                        {t('page.selectedAgentLabel')}
                      </label>
                      <select
                        value={draft.selectedAgentId || ''}
                        onChange={(event) => void handleSelectAgent(event.target.value)}
                        className="mt-3 h-11 w-full rounded-[24px] border border-[#d5e8e1] bg-white px-4 text-sm text-[#1f3a34] outline-none"
                        disabled={agentsLoading}
                      >
                        <option value="">{t('page.selectedAgentEmpty')}</option>
                        {agentOptions.map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </aside>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
