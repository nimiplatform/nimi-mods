import React, { useEffect, useRef, useState } from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod';
import type { BuddyControllerState, BuddyControllerActions } from '../hooks/use-buddy-controller.js';
import { Live2DCanvas } from './live2d-canvas.js';
import { ChatOverlay } from './chat-overlay.js';
import { VoiceButton } from './voice-button.js';
import { BUDDY_MODELS } from '../contracts.js';
import { RouteSelector } from './route-selector.js';
import { resolveBuddyAssetUrl } from '../mod-asset-url.js';
import { stripEmotionTags } from '../services/dialogue-engine.js';

type Props = BuddyControllerState & BuddyControllerActions;

const DEFAULT_MODEL_PATH = 'haru/haru.model3.json';

export function BuddyWorkbench(props: Props) {
  const { t } = useModTranslation('buddy');
  const {
    modelState,
    modelError,
    messages,
    isGenerating,
    isRecording,
    streamingText,
    currentEmotion,
    modelZoom,
    modelPanX,
    modelPanY,
    showRestReminder,
    selectedModelId,
    textRouteOptions,
    ttsRouteOptions,
    sttRouteOptions,
    textRouteBinding,
    ttsRouteBinding,
    sttRouteBinding,
    routeOptionsLoading,
    voiceModeEnabled,
    ttsVoiceOptions,
    ttsVoicesLoading,
    selectedTtsVoiceId,
    activeAudioMessageId,
    audioStatusByMessageId,
    audioErrorByMessageId,
    mountCanvas,
    loadModel,
    tapModel,
    setModelZoom,
    setModelPanX,
    setModelPanY,
    selectModel,
    setVoiceModeEnabled,
    setRouteSource,
    setRouteConnector,
    setRouteModel,
    setSelectedTtsVoiceId,
    sendMessage,
    playAssistantMessageAudio,
    startRecording,
    stopRecording,
    dismissRestReminder,
    retry,
  } = props;

  const initialized = useRef(false);
  const canvasMounted = useRef(false);
  const dragStateRef = useRef({
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    startPanX: 0,
    startPanY: 0,
    moved: false,
  });
  const [input, setInput] = useState('');
  const [showConsole, setShowConsole] = useState(true);

  const selectedModel = BUDDY_MODELS.find((model) => model.id === selectedModelId) || BUDDY_MODELS[0];
  const latestAssistantMessage = [...messages].reverse().find((message) => message.role === 'assistant') || null;
  const stageHint = streamingText
    ? stripEmotionTags(streamingText)
    : stripEmotionTags(latestAssistantMessage?.content || '') || t('BuddyPage.stageHintFallback');

  const onCanvasReady = (canvas: HTMLCanvasElement) => {
    if (initialized.current) return;
    initialized.current = true;
    canvasMounted.current = true;
    mountCanvas(canvas);
  };

  useEffect(() => {
    if (!canvasMounted.current) return;
    const relativePath = selectedModel?.relativePath || DEFAULT_MODEL_PATH;
    void loadModel(resolveBuddyAssetUrl(`models/${relativePath}`));
  }, [loadModel, selectedModel]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!input.trim() || isGenerating) return;
    sendMessage(input.trim());
    setInput('');
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit(event);
    }
  };

  const selectedVoice = ttsVoiceOptions.find((voice) => voice.id === selectedTtsVoiceId) || null;
  const stageReady = modelState === 'ready';
  const stageMetaText = stageReady
    ? `${selectedModel.label} · ${currentEmotion}`
    : modelState === 'loading'
      ? t('BuddyPage.modelLoading')
        : modelState === 'error'
          ? t('BuddyPage.modelError')
          : t('BuddyPage.subtitleIdle');
  const canZoomIn = modelZoom < 2.8;
  const canZoomOut = modelZoom > 0.8;

  const updateModelZoom = (nextZoom: number) => {
    setModelZoom(Number(nextZoom.toFixed(2)));
  };

  const handleStagePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    dragStateRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPanX: modelPanX,
      startPanY: modelPanY,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleStagePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragStateRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
      drag.moved = true;
    }
    setModelPanX(drag.startPanX + deltaX);
    setModelPanY(drag.startPanY + deltaY);
  };

  const handleStagePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragStateRef.current;
    if (drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStateRef.current = {
      active: false,
      pointerId: -1,
      startX: 0,
      startY: 0,
      startPanX: 0,
      startPanY: 0,
      moved: false,
    };
    if (!drag.moved) {
      tapModel(event.clientX, event.clientY);
    }
  };

  const handleStagePointerCancel = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragStateRef.current;
    if (drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStateRef.current = {
      active: false,
      pointerId: -1,
      startX: 0,
      startY: 0,
      startPanX: 0,
      startPanY: 0,
      moved: false,
    };
  };

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,_#ffffff_0%,_#eff6ff_38%,_#eef7ff_70%,_#f8fbff_100%)]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-12 top-16 h-56 w-56 rounded-full bg-sky-100/50 blur-3xl" />
        <div className="absolute bottom-8 right-10 h-72 w-72 rounded-full bg-cyan-100/40 blur-3xl" />
        <div className="absolute inset-x-0 top-0 h-48 bg-[linear-gradient(180deg,_rgba(255,255,255,0.75)_0%,_rgba(255,255,255,0)_100%)]" />
      </div>

      <div className="relative z-10 flex-1 overflow-hidden px-5 py-4">
        <div
          className={`grid h-full min-h-0 gap-5 transition-all duration-200 ${
            showConsole
              ? 'grid-cols-[minmax(0,1.24fr)_minmax(28rem,31rem)_15rem]'
              : 'grid-cols-[minmax(0,1.4fr)_minmax(30rem,34rem)]'
          }`}
        >
          <section className="relative min-h-0 overflow-hidden rounded-[34px] border border-white/55 bg-[linear-gradient(180deg,_rgba(255,255,255,0.54)_0%,_rgba(232,246,255,0.42)_100%)] shadow-[0_24px_80px_rgba(148,163,184,0.16)] backdrop-blur-2xl">
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-8 top-10 h-56 w-56 rounded-full bg-sky-100/45 blur-3xl" />
              <div className="absolute right-10 top-16 h-44 w-44 rounded-full bg-cyan-100/35 blur-3xl" />
              <div className="absolute bottom-10 left-1/2 h-16 w-[20rem] -translate-x-1/2 rounded-full bg-slate-400/10 blur-2xl" />
              <div className="absolute left-[12%] top-[22%] h-4 w-4 rotate-45 bg-slate-300/70" />
              <div className="absolute left-[18%] top-[52%] h-2.5 w-2.5 rounded-full bg-slate-300/70" />
              <div className="absolute right-[16%] top-[28%] h-3.5 w-3.5 rotate-45 bg-slate-300/70" />
              <div className="absolute right-[20%] top-[58%] h-2.5 w-2.5 rounded-full bg-slate-300/70" />
            </div>

            <div className="pointer-events-none absolute left-6 top-6 z-10 inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/86 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-teal-600 shadow-sm">
              <span className={`h-2.5 w-2.5 rounded-full ${stageReady ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              {stageReady ? t('BuddyPage.liveBadge') : t('BuddyPage.subtitleLoading')}
            </div>

            <div className="absolute right-6 top-6 z-10 flex items-center gap-2">
              <div className="rounded-full border border-white/70 bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-500 shadow-sm backdrop-blur-xl">
                {Math.round(modelZoom * 100)}%
              </div>
              <button
                type="button"
                onClick={() => updateModelZoom(modelZoom - 0.1)}
                disabled={!canZoomOut}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/72 text-slate-500 shadow-sm backdrop-blur-xl transition hover:bg-white disabled:opacity-40"
                title="Zoom out"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M5 12h14" strokeLinecap="round" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => updateModelZoom(modelZoom + 0.1)}
                disabled={!canZoomIn}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/72 text-slate-500 shadow-sm backdrop-blur-xl transition hover:bg-white disabled:opacity-40"
                title="Zoom in"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="absolute inset-0">
              <Live2DCanvas
                onReady={onCanvasReady}
                onWheel={(event) => {
                  event.preventDefault();
                  const delta = event.deltaY < 0 ? 0.06 : -0.06;
                  updateModelZoom(modelZoom + delta);
                }}
                onPointerDown={handleStagePointerDown}
                onPointerMove={handleStagePointerMove}
                onPointerUp={handleStagePointerUp}
                onPointerCancel={handleStagePointerCancel}
              />
            </div>

            {modelState === 'loading' && (
              <div className="absolute inset-0 z-20 flex items-center justify-center">
                <div className="rounded-2xl bg-white/88 px-6 py-3 text-sm text-slate-500 shadow-sm backdrop-blur">
                  {t('BuddyPage.modelLoading')}
                </div>
              </div>
            )}

            {modelState === 'error' && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-white/55 backdrop-blur-sm">
                <div className="rounded-2xl bg-rose-50 px-6 py-3 text-sm text-rose-600 shadow-sm">
                  {t('BuddyPage.modelError')}{modelError ? `: ${modelError}` : ''}
                </div>
                <button
                  className="rounded-full bg-teal-500 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-teal-600"
                  onClick={retry}
                >
                  {t('BuddyPage.retry')}
                </button>
              </div>
            )}

            <div className="pointer-events-none absolute bottom-6 left-6 right-6 z-10 flex flex-wrap items-end justify-between gap-4">
              <div className="max-w-md rounded-[24px] border border-white/80 bg-white/82 px-4 py-3 shadow-sm backdrop-blur-xl">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-600">
                  {streamingText || activeAudioMessageId ? t('BuddyPage.stageBroadcast') : t('BuddyPage.stageStatus')}
                </div>
                <div className="text-sm leading-6 text-slate-700">{stageHint}</div>
              </div>

              <div className="rounded-[22px] border border-white/75 bg-white/78 px-4 py-3 text-right shadow-sm backdrop-blur-xl">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  {t('BuddyPage.currentModel')}
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-800">{selectedModel.label}</div>
                <div className="mt-1 text-xs text-slate-500">{stageMetaText}</div>
              </div>
            </div>
          </section>

          <section className="min-h-0">
            <ChatOverlay
              messages={messages}
              streamingText={streamingText}
              voiceModeEnabled={voiceModeEnabled}
              isGenerating={isGenerating}
              isRecording={isRecording}
              input={input}
              activeAudioMessageId={activeAudioMessageId}
              audioStatusByMessageId={audioStatusByMessageId}
              audioErrorByMessageId={audioErrorByMessageId}
              onInputChange={setInput}
              onInputKeyDown={handleInputKeyDown}
              onSubmit={handleSubmit}
              onPlayAssistantMessageAudio={playAssistantMessageAudio}
              inputActions={(
                <>
                  <VoiceButton
                    isRecording={isRecording}
                    onStart={startRecording}
                    onStop={stopRecording}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConsole((current) => !current)}
                    className={`flex h-10 w-10 items-center justify-center rounded-full border transition ${
                      showConsole
                        ? 'border-teal-200 bg-teal-50 text-teal-600 shadow-sm'
                        : 'border-white/70 bg-white/78 text-slate-500 shadow-sm backdrop-blur-xl hover:bg-white'
                    }`}
                    title={t('BuddyPage.consoleTitle')}
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Z" />
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9A1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9V9c0 .68.4 1.3 1.02 1.58.15.07.31.11.48.11H21a2 2 0 1 1 0 4h-.09c-.17 0-.33.04-.48.11-.62.28-1.02.9-1.02 1.58V15Z" />
                    </svg>
                  </button>
                </>
              )}
            />
          </section>

          {showConsole && (
            <aside className="min-h-0 overflow-hidden rounded-[30px] border border-white/55 bg-white/48 shadow-[0_18px_60px_rgba(148,163,184,0.18)] backdrop-blur-2xl">
              <div className="flex items-center justify-between border-b border-white/45 px-4 py-4">
                <h2 className="text-lg font-semibold text-slate-800">{t('BuddyPage.consoleTitle')}</h2>
                <button
                  type="button"
                  onClick={() => setShowConsole(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/70 text-slate-400 shadow-sm transition hover:text-slate-600"
                  title={t('BuddyPage.consoleTitle')}
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              <div className="flex h-[calc(100%-4rem)] flex-col gap-4 overflow-y-auto px-4 py-4">
                <div className="rounded-2xl bg-teal-50/80 px-4 py-3 backdrop-blur">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-slate-700">{t('BuddyPage.voiceMode')}</div>
                    <button
                      type="button"
                      onClick={() => setVoiceModeEnabled(!voiceModeEnabled)}
                      className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                        voiceModeEnabled
                          ? 'bg-teal-500 text-white shadow-[0_10px_24px_rgba(20,184,166,0.22)]'
                          : 'bg-white text-slate-500 shadow-sm'
                      }`}
                    >
                      {voiceModeEnabled ? t('BuddyPage.enabled') : t('BuddyPage.disabled')}
                    </button>
                  </div>
                </div>

                <div className="rounded-[20px] border border-white/60 bg-white/72 px-4 py-4 shadow-[0_8px_24px_rgba(31,38,135,0.05)] backdrop-blur">
                  <div className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em] text-slate-400">
                    {t('BuddyPage.currentModel')}
                  </div>
                  <select
                    value={selectedModelId}
                    onChange={(event) => selectModel(event.target.value)}
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-white/90 px-4 text-sm text-slate-700 outline-none transition focus:border-teal-300 focus:shadow-[0_0_0_3px_rgba(45,212,191,0.15)]"
                  >
                    {BUDDY_MODELS.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="rounded-[20px] border border-white/60 bg-white/72 px-4 py-4 shadow-[0_8px_24px_rgba(31,38,135,0.05)] backdrop-blur">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-slate-400">Zoom</div>
                    <div className="text-xs font-medium text-slate-500">{Math.round(modelZoom * 100)}%</div>
                  </div>
                  <input
                    type="range"
                    min="0.8"
                    max="2.8"
                    step="0.05"
                    value={modelZoom}
                    onChange={(event) => updateModelZoom(Number(event.target.value))}
                    className="w-full accent-teal-500"
                  />
                </div>

                <RouteSelector
                  value={{
                    label: t('RouteSelector.chatRoute'),
                    binding: textRouteBinding,
                    options: textRouteOptions,
                    loading: routeOptionsLoading,
                  }}
                  onChangeSource={(source) => setRouteSource('text', source)}
                  onChangeConnector={(connectorId) => setRouteConnector('text', connectorId)}
                  onChangeModel={(model) => setRouteModel('text', model)}
                />

                <RouteSelector
                  value={{
                    label: t('RouteSelector.ttsRoute'),
                    binding: ttsRouteBinding,
                    options: ttsRouteOptions,
                    loading: routeOptionsLoading,
                  }}
                  onChangeSource={(source) => setRouteSource('tts', source)}
                  onChangeConnector={(connectorId) => setRouteConnector('tts', connectorId)}
                  onChangeModel={(model) => setRouteModel('tts', model)}
                />

                <div className="rounded-[20px] border border-white/60 bg-white/72 px-4 py-4 shadow-[0_8px_24px_rgba(31,38,135,0.05)] backdrop-blur">
                  <div className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em] text-slate-400">
                    {t('BuddyPage.ttsVoice')}
                  </div>
                  <select
                    value={selectedTtsVoiceId}
                    onChange={(event) => setSelectedTtsVoiceId(event.target.value)}
                    disabled={ttsVoicesLoading || ttsVoiceOptions.length === 0}
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-white/90 px-4 text-sm text-slate-700 outline-none transition focus:border-teal-300 focus:shadow-[0_0_0_3px_rgba(45,212,191,0.15)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {ttsVoiceOptions.length === 0 ? (
                      <option value="">
                        {ttsVoicesLoading ? t('BuddyPage.voiceLoading') : t('BuddyPage.voiceUnavailable')}
                      </option>
                    ) : (
                      ttsVoiceOptions.map((voice) => (
                        <option key={voice.id} value={voice.id}>
                          {voice.name}{voice.lang ? ` · ${voice.lang}` : ''}
                        </option>
                      ))
                    )}
                  </select>
                  <div className="mt-2 text-xs text-slate-400">
                    {selectedVoice ? `${selectedVoice.name}${selectedVoice.lang ? ` · ${selectedVoice.lang}` : ''}` : t('BuddyPage.voiceUnavailable')}
                  </div>
                </div>

                <RouteSelector
                  value={{
                    label: t('RouteSelector.sttRoute'),
                    binding: sttRouteBinding,
                    options: sttRouteOptions,
                    loading: routeOptionsLoading,
                  }}
                  onChangeSource={(source) => setRouteSource('stt', source)}
                  onChangeConnector={(connectorId) => setRouteConnector('stt', connectorId)}
                  onChangeModel={(model) => setRouteModel('stt', model)}
                />
              </div>
            </aside>
          )}
        </div>
      </div>

      {showRestReminder && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="mx-4 max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
            <div className="mb-3 text-4xl">😊</div>
            <p className="mb-4 text-gray-700">{t('BuddyPage.restReminder')}</p>
            <button
              className="rounded-lg bg-blue-500 px-6 py-2 text-sm text-white hover:bg-blue-600"
              onClick={dismissRestReminder}
            >
              {t('BuddyPage.continueAction')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
