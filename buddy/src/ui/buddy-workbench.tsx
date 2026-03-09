import React, { useEffect, useRef, useState } from 'react';
import type { BuddyControllerState, BuddyControllerActions } from '../hooks/use-buddy-controller.js';
import { Live2DCanvas } from './live2d-canvas.js';
import { ChatOverlay } from './chat-overlay.js';
import { VoiceButton } from './voice-button.js';
import { BUDDY_MODELS } from '../contracts.js';
import { RouteSelector } from './route-selector.js';

type Props = BuddyControllerState & BuddyControllerActions;

declare const __NIMI_MOD_DIR__: string;

function resolveModelAssetUrl(relativePath: string): string {
  const absPath = `${__NIMI_MOD_DIR__}/assets/models/${relativePath}`;
  if (typeof window !== 'undefined' && /^https?:\/\//.test(window.location.origin)) {
    return `${window.location.origin}/@fs${absPath}`;
  }
  return `file://${absPath}`;
}

const DEFAULT_MODEL_PATH = 'haru/haru.model3.json';

export function BuddyWorkbench(props: Props) {
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
  const [showRoutePanel, setShowRoutePanel] = useState(true);

  const selectedModel = BUDDY_MODELS.find((model) => model.id === selectedModelId) || BUDDY_MODELS[0];
  const latestAssistantMessage = [...messages].reverse().find((message) => message.role === 'assistant') || null;
  const stageHint = streamingText
    ? streamingText.replace(/\[emotion:\w+\]/, '').trim()
    : latestAssistantMessage?.content || '点一下角色触发动作，或者从下方输入区开始聊天。';

  const onCanvasReady = (canvas: HTMLCanvasElement) => {
    if (initialized.current) return;
    initialized.current = true;
    canvasMounted.current = true;
    mountCanvas(canvas);
  };

  useEffect(() => {
    if (!canvasMounted.current) return;
    const relativePath = selectedModel?.relativePath || DEFAULT_MODEL_PATH;
    void loadModel(resolveModelAssetUrl(relativePath));
  }, [loadModel, selectedModel]);

  return (
    <div className="relative flex h-full w-full flex-col overflow-x-hidden overflow-y-auto bg-[radial-gradient(circle_at_top,_rgba(167,243,208,0.42),_transparent_28%),linear-gradient(180deg,_#f8fbff_0%,_#edf5ff_42%,_#f7fbff_100%)]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-10 h-80 w-80 -translate-x-1/2 rounded-full bg-emerald-100/80 blur-3xl" />
        <div className="absolute left-24 top-28 h-56 w-56 rounded-full bg-cyan-100/70 blur-3xl" />
        <div className="absolute bottom-14 right-24 h-64 w-64 rounded-full bg-sky-100/60 blur-3xl" />
      </div>

      <div className="relative z-20 flex items-center justify-between gap-4 border-b border-white/60 bg-white/78 px-6 py-4 backdrop-blur">
        <div className="flex items-center gap-4">
          <div>
            <div className="text-lg font-semibold text-slate-900">Buddy</div>
            <div className="text-xs text-slate-500">
              {modelState === 'ready' ? '角色在线，可点击角色触发动作或语音播报' : modelState === 'loading' ? '角色加载中' : '选择模型开始互动'}
            </div>
          </div>
          <div className="hidden rounded-full border border-white/80 bg-white/70 px-3 py-1 text-[11px] font-medium tracking-[0.18em] text-slate-500 md:block">
            LIVE COMPANION
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-600">
          <button
            type="button"
            onClick={() => setShowRoutePanel((value) => !value)}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700"
          >
            {showRoutePanel ? '收起控制台' : '打开控制台'}
          </button>
          <span className="hidden sm:inline">模型</span>
          <select
            value={selectedModelId}
            onChange={(event) => selectModel(event.target.value)}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none"
          >
            {BUDDY_MODELS.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="relative z-10 flex flex-1 flex-col gap-3 px-4 py-4 lg:px-6">
        <div className={`grid gap-3 ${showRoutePanel ? 'lg:grid-cols-[minmax(0,1fr)_21rem]' : 'lg:grid-cols-[minmax(0,1fr)]'}`}>
          <div className="relative min-h-[20rem] overflow-hidden rounded-[34px] border border-white/70 bg-[linear-gradient(180deg,_rgba(255,255,255,0.82)_0%,_rgba(238,249,255,0.78)_100%)] shadow-[0_24px_80px_rgba(148,163,184,0.16)]">
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-x-[18%] top-10 h-48 rounded-full bg-emerald-100/70 blur-3xl" />
              <div className="absolute bottom-6 left-1/2 h-12 w-80 -translate-x-1/2 rounded-full bg-slate-400/20 blur-2xl" />
            </div>

            <div className="pointer-events-none absolute left-6 top-6 z-10 max-w-sm rounded-[24px] border border-white/80 bg-white/84 px-4 py-3 shadow-sm backdrop-blur">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-600">
                {streamingText ? '回应中' : '舞台状态'}
              </div>
              <div className="text-sm leading-6 text-slate-700">{stageHint}</div>
            </div>

            <div className="pointer-events-none absolute bottom-6 left-6 z-10 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/80 bg-white/80 px-3 py-1.5 text-xs text-slate-600 backdrop-blur">
                模型：{selectedModel.label}
              </span>
              <span className="rounded-full border border-white/80 bg-white/80 px-3 py-1.5 text-xs text-slate-600 backdrop-blur">
                {voiceModeEnabled ? '语音自动播报开启' : '手动播报模式'}
              </span>
              <span className="rounded-full border border-white/80 bg-white/80 px-3 py-1.5 text-xs text-slate-600 backdrop-blur">
                {activeAudioMessageId ? '角色说话中' : '待机中'}
              </span>
            </div>

            {modelState === 'loading' && (
              <div className="absolute inset-0 z-10 flex items-center justify-center">
                <div className="rounded-xl bg-white/85 px-6 py-3 text-sm text-slate-500 shadow-sm backdrop-blur">
                  角色加载中...
                </div>
              </div>
            )}

            {modelState === 'error' && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3">
                <div className="rounded-xl bg-red-50 px-6 py-3 text-sm text-red-600">
                  角色加载失败{modelError ? `：${modelError}` : ''}
                </div>
                <button
                  className="rounded-lg bg-blue-500 px-4 py-2 text-sm text-white hover:bg-blue-600"
                  onClick={retry}
                >
                  重试
                </button>
              </div>
            )}

            <Live2DCanvas
              onReady={onCanvasReady}
              onTap={(event) => tapModel(event.clientX, event.clientY)}
            />
          </div>

          <div className={`${showRoutePanel ? 'flex' : 'hidden'} flex-col gap-4 rounded-[30px] border border-white/70 bg-white/84 p-4 shadow-[0_24px_60px_rgba(148,163,184,0.16)] backdrop-blur`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-slate-900">控制台</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">
                  把模型、语音模式和 Chat / TTS / STT 路由都收在这里，不再压住舞台。
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRoutePanel(false)}
                className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-500 lg:hidden"
              >
                收起
              </button>
            </div>

            <div className="rounded-[24px] border border-emerald-100 bg-[linear-gradient(135deg,_rgba(236,253,245,0.9)_0%,_rgba(240,249,255,0.95)_100%)] p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-slate-900">语音模式</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">
                    开启后，助手回复会自动生成语音，并同步驱动角色开口播报。
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setVoiceModeEnabled(!voiceModeEnabled)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    voiceModeEnabled
                      ? 'bg-emerald-400 text-white shadow-[0_10px_24px_rgba(16,185,129,0.24)]'
                      : 'bg-white text-slate-500'
                  }`}
                >
                  {voiceModeEnabled ? '已开启' : '已关闭'}
                </button>
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-100 bg-slate-50/80 p-4">
              <div className="mb-3 text-sm font-semibold text-slate-900">模型资料</div>
              <div className="grid gap-3 text-xs text-slate-500">
                <label className="grid gap-1">
                  <span>当前模型</span>
                  <select
                    value={selectedModelId}
                    onChange={(event) => selectModel(event.target.value)}
                    className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none"
                  >
                    {BUDDY_MODELS.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="rounded-2xl border border-white/80 bg-white px-3 py-3 text-slate-600">
                  当前动作、口型和情绪反馈都会跟随这套模型配置切换。
                </div>
              </div>
            </div>

            <div className="grid gap-3">
              <RouteSelector
                value={{
                  label: 'Chat Route',
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
                  label: 'TTS Route',
                  binding: ttsRouteBinding,
                  options: ttsRouteOptions,
                  loading: routeOptionsLoading,
                }}
                onChangeSource={(source) => setRouteSource('tts', source)}
                onChangeConnector={(connectorId) => setRouteConnector('tts', connectorId)}
                onChangeModel={(model) => setRouteModel('tts', model)}
              />
              <div className="rounded-[24px] border border-slate-100 bg-slate-50/80 p-4">
                <div className="mb-3 text-sm font-semibold text-slate-900">TTS Voice</div>
                <div className="grid gap-2">
                  <select
                    value={selectedTtsVoiceId}
                    onChange={(event) => setSelectedTtsVoiceId(event.target.value)}
                    disabled={ttsVoicesLoading || ttsVoiceOptions.length === 0}
                    className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {ttsVoiceOptions.length === 0 ? (
                      <option value="">
                        {ttsVoicesLoading ? '加载 voice 列表中...' : '当前路由没有可用 voice'}
                      </option>
                    ) : (
                      ttsVoiceOptions.map((voice) => (
                        <option key={voice.id} value={voice.id}>
                          {voice.name}{voice.lang ? ` · ${voice.lang}` : ''}
                        </option>
                      ))
                    )}
                  </select>
                  <div className="text-xs leading-5 text-slate-500">
                    qwen3-tts 这类模型通常必须显式传合法 voice。切换 TTS model 后，这里会自动刷新。
                  </div>
                </div>
              </div>
              <RouteSelector
                value={{
                  label: 'STT Route',
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
        </div>

        <div className="relative z-20 grid min-h-[22rem] gap-2 pb-4">
          <div className="flex items-center justify-between gap-3 px-1">
            <div className="text-xs text-slate-500">
              {isRecording ? '录音中，松开后会自动转写并发送。' : '按住说话可直接进入语音输入。'}
            </div>
            <VoiceButton
              isRecording={isRecording}
              onStart={startRecording}
              onStop={stopRecording}
            />
          </div>

          <div className="min-h-[18rem]">
            <ChatOverlay
              messages={messages}
              streamingText={streamingText}
              isGenerating={isGenerating}
              voiceModeEnabled={voiceModeEnabled}
              activeAudioMessageId={activeAudioMessageId}
              audioStatusByMessageId={audioStatusByMessageId}
              audioErrorByMessageId={audioErrorByMessageId}
              onSend={sendMessage}
              onPlayAssistantMessageAudio={playAssistantMessageAudio}
            />
          </div>
        </div>
      </div>

      {showRestReminder && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="mx-4 max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
            <div className="mb-3 text-4xl">😊</div>
            <p className="mb-4 text-gray-700">我们休息一下眼睛吧！</p>
            <button
              className="rounded-lg bg-blue-500 px-6 py-2 text-sm text-white hover:bg-blue-600"
              onClick={dismissRestReminder}
            >
              好的，继续
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
