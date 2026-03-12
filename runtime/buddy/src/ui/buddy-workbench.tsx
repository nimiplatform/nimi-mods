import React, { useEffect, useRef, useState } from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
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
  const [showRoutePanel, setShowRoutePanel] = useState(false);
  const [input, setInput] = useState('');

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

  return (
    <div className="relative flex h-full w-full flex-col overflow-x-hidden overflow-y-auto bg-[linear-gradient(180deg,_#f8fbff_0%,_#edf5ff_42%,_#f7fbff_100%)]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-24 top-24 h-56 w-56 rounded-full bg-slate-100/60 blur-3xl" />
        <div className="absolute bottom-14 right-24 h-64 w-64 rounded-full bg-sky-100/40 blur-3xl" />
      </div>

      <div className="relative z-20 flex items-center gap-4 border-b border-white/60 bg-white/72 px-6 py-4 backdrop-blur">
        <div className="flex items-center gap-4">
          <div>
            <div className="text-lg font-semibold text-slate-900">{t('BuddyPage.title')}</div>
            <div className="text-xs text-slate-500">
              {modelState === 'ready'
                ? t('BuddyPage.subtitleReady')
                : modelState === 'loading'
                  ? t('BuddyPage.subtitleLoading')
                  : t('BuddyPage.subtitleIdle')}
            </div>
          </div>
          <div className="hidden rounded-full border border-white/80 bg-white/70 px-3 py-1 text-[11px] font-medium tracking-[0.18em] text-slate-500 md:block">
            {t('BuddyPage.liveBadge')}
          </div>
        </div>
      </div>

      <div className="relative z-10 flex flex-1 flex-col gap-4 px-4 py-4 lg:px-6">
        <div className="relative min-h-[44rem] flex-1 overflow-hidden rounded-[36px] border border-white/70 bg-[linear-gradient(180deg,_rgba(255,255,255,0.76)_0%,_rgba(238,249,255,0.68)_100%)] shadow-[0_24px_80px_rgba(148,163,184,0.16)]">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-[22%] top-14 h-44 rounded-full bg-sky-100/28 blur-3xl" />
            <div className="absolute left-10 top-40 h-44 w-44 rounded-full bg-slate-100/35 blur-3xl" />
            <div className="absolute bottom-8 left-1/2 h-14 w-[26rem] -translate-x-1/2 rounded-full bg-slate-400/14 blur-2xl" />
          </div>

          <div className="pointer-events-none absolute left-6 top-6 z-10 max-w-sm rounded-[24px] border border-white/80 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-600">
              {streamingText || activeAudioMessageId ? t('BuddyPage.stageBroadcast') : t('BuddyPage.stageStatus')}
            </div>
            <div className="text-sm leading-6 text-slate-700">{stageHint}</div>
          </div>

          <div className="absolute right-6 top-6 z-20 flex flex-col items-end gap-3">
            <button
              type="button"
              onClick={() => setShowRoutePanel((value) => !value)}
              className="pointer-events-auto rounded-full border border-white/75 bg-white/78 px-4 py-2 text-sm text-slate-700 shadow-sm backdrop-blur transition hover:border-emerald-300 hover:text-emerald-700"
            >
              {showRoutePanel ? t('BuddyPage.closeConsole') : t('BuddyPage.openConsole')}
            </button>
          </div>

          {showRoutePanel && (
            <div className="absolute inset-y-4 right-4 z-30 flex w-[21.25rem] flex-col gap-5 rounded-[30px] border-l border-white/80 bg-white/78 p-6 shadow-[0_8px_32px_rgba(31,38,135,0.07)] backdrop-blur-[15px]">
              <div className="flex items-start justify-between gap-3">
                <div className="text-[18px] font-semibold text-slate-800">{t('BuddyPage.consoleTitle')}</div>
                <button
                  type="button"
                  onClick={() => setShowRoutePanel(false)}
                  className="rounded-full bg-slate-100 px-3 py-1.5 text-[13px] text-slate-500 transition hover:bg-slate-200"
                >
                  {t('BuddyPage.collapse')}
                </button>
              </div>

              <div className="rounded-[12px] border border-white/60 bg-[linear-gradient(135deg,_rgba(238,249,245,0.95)_0%,_rgba(230,247,255,0.95)_100%)] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="text-sm font-semibold text-slate-900">{t('BuddyPage.voiceMode')}</div>
                  <button
                    type="button"
                    onClick={() => setVoiceModeEnabled(!voiceModeEnabled)}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                      voiceModeEnabled
                        ? 'bg-emerald-400 text-white shadow-[0_10px_24px_rgba(16,185,129,0.24)]'
                        : 'bg-white text-slate-500'
                    }`}
                  >
                    {voiceModeEnabled ? t('BuddyPage.enabled') : t('BuddyPage.disabled')}
                  </button>
                </div>
              </div>

              <div className="rounded-[12px] border border-white/60 bg-white/60 p-4">
                <div className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em] text-slate-400">{t('BuddyPage.modelProfile')}</div>
                <div className="grid gap-3 text-sm text-slate-500">
                  <label className="grid gap-1">
                    <span className="text-[13px] text-slate-500">{t('BuddyPage.currentModel')}</span>
                    <select
                      value={selectedModelId}
                      onChange={(event) => selectModel(event.target.value)}
                      className="h-[38px] rounded-[10px] border border-black/5 bg-white px-3 text-[14px] text-slate-700 outline-none transition focus:border-sky-300 focus:shadow-[0_0_0_3px_rgba(122,186,255,0.18)]"
                    >
                      {BUDDY_MODELS.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="grid gap-3 overflow-y-auto pr-1">
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
                <div className="rounded-[12px] border border-white/60 bg-white/60 p-4">
                  <div className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em] text-slate-400">{t('BuddyPage.ttsVoice')}</div>
                  <div className="grid gap-2">
                    <select
                      value={selectedTtsVoiceId}
                      onChange={(event) => setSelectedTtsVoiceId(event.target.value)}
                      disabled={ttsVoicesLoading || ttsVoiceOptions.length === 0}
                      className="h-[38px] rounded-[10px] border border-black/5 bg-white px-3 text-[14px] text-slate-700 outline-none transition focus:border-sky-300 focus:shadow-[0_0_0_3px_rgba(122,186,255,0.18)] disabled:cursor-not-allowed disabled:opacity-60"
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
            </div>
          )}

            {modelState === 'loading' && (
              <div className="absolute inset-0 z-10 flex items-center justify-center">
                  <div className="rounded-xl bg-white/85 px-6 py-3 text-sm text-slate-500 shadow-sm backdrop-blur">
                  {t('BuddyPage.modelLoading')}
                  </div>
              </div>
            )}

            {modelState === 'error' && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3">
                <div className="rounded-xl bg-red-50 px-6 py-3 text-sm text-red-600">
                  {t('BuddyPage.modelError')}{modelError ? `: ${modelError}` : ''}
                </div>
                <button
                  className="rounded-lg bg-blue-500 px-4 py-2 text-sm text-white hover:bg-blue-600"
                  onClick={retry}
                >
                  {t('BuddyPage.retry')}
                </button>
              </div>
            )}

            <Live2DCanvas
              onReady={onCanvasReady}
              onTap={(event) => tapModel(event.clientX, event.clientY)}
            />
          <div className="absolute bottom-6 right-6 z-20 w-[min(34rem,calc(100%-3rem))]">
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
                <VoiceButton
                  isRecording={isRecording}
                  onStart={startRecording}
                  onStop={stopRecording}
                />
              )}
            />
          </div>

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
