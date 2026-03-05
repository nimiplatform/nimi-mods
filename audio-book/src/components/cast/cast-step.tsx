// ---------------------------------------------------------------------------
// Cast step — connector selector + character list + voice selector + preview (matches Pencil)
// ---------------------------------------------------------------------------

import React, { useEffect, useState } from 'react';
import type { CharacterProfile, VoiceCasting, TtsClient } from '../../types.js';
import type { TtsRouteState } from '../../controllers/use-tts-route.js';
import { Select } from '../ui/select.js';
import { Slider } from '../ui/slider.js';
import { TierBadge } from '../ui/badge.js';

type CastStepProps = {
  characters: CharacterProfile[];
  castings: VoiceCasting[];
  selectedCharacter: string | null;
  previewPlaying: string | null;
  ttsClient: TtsClient;
  ttsRoute: TtsRouteState;
  onSelectCharacter: (name: string) => void;
  onUpdateCasting: (characterName: string, patch: Partial<VoiceCasting>) => void;
  onPreviewVoice: (casting: VoiceCasting) => void;
  onAutoRecommend: () => void;
};

type VoiceOption = {
  providerId: string;
  voiceId: string;
  voiceName: string;
  language?: string;
};
const FLOW_LOG_PREFIX = '[audio-book:flow]';

export function CastStep(props: CastStepProps) {
  const {
    characters, castings, selectedCharacter, previewPlaying,
    ttsClient, ttsRoute, onSelectCharacter, onUpdateCasting, onPreviewVoice, onAutoRecommend,
  } = props;

  const [availableVoices, setAvailableVoices] = useState<VoiceOption[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [autoLoading, setAutoLoading] = useState(false);

  // Reload voices when connector changes
  useEffect(() => {
    if (ttsRoute.loading) return;

    let cancelled = false;
    setLoadingVoices(true);
    setVoiceError(null);
    const routeInput = {
      connectorId: ttsRoute.ttsSelection.connectorId || undefined,
      routeSource: ttsRoute.ttsSelection.routeSource,
      model: ttsRoute.ttsSelection.model,
    };
    console.info(FLOW_LOG_PREFIX, 'cast:listVoices:start', routeInput);

    ttsClient.listVoices(routeInput).then((voices) => {
      if (!cancelled) {
        setAvailableVoices(voices);
        setLoadingVoices(false);
        console.info(FLOW_LOG_PREFIX, 'cast:listVoices:ok', {
          ...routeInput,
          voicesCount: voices.length,
          sampleVoiceIds: voices.slice(0, 5).map((voice) => voice.voiceId),
        });
      }
    }).catch((err) => {
      if (!cancelled) {
        setLoadingVoices(false);
        const error = err instanceof Error ? err.message : String(err);
        setVoiceError(error || 'Failed to load voices');
        console.warn(FLOW_LOG_PREFIX, 'cast:listVoices:failed', {
          ...routeInput,
          error,
        });
      }
    });
    return () => { cancelled = true; };
  }, [
    ttsClient,
    ttsRoute.loading,
    ttsRoute.ttsSelection.connectorId,
    ttsRoute.ttsSelection.model,
    ttsRoute.ttsSelection.routeSource,
  ]);

  const castingMap = new Map(castings.map((c) => [c.characterName, c]));
  const selected = selectedCharacter ?? characters[0]?.name ?? null;
  const selectedCasting = selected ? castingMap.get(selected) : null;

  const handleAutoRecommend = async () => {
    setAutoLoading(true);
    try {
      await onAutoRecommend();
    } finally {
      setAutoLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* TTS Connector selector — top bar */}
      <div className="shrink-0 border-b border-gray-100 bg-gray-50 px-6 py-3">
        <div className="flex items-center gap-3">
          <label className="shrink-0 text-xs font-medium text-gray-600">TTS Provider</label>
          <div className="min-w-0 flex-1">
            {ttsRoute.loading ? (
              <p className="text-xs text-gray-400">Loading providers...</p>
            ) : ttsRoute.error ? (
              <p className="text-xs text-red-500">{ttsRoute.error}</p>
            ) : ttsRoute.ttsConnectors.length === 0 ? (
              <p className="text-xs text-gray-500">No TTS connectors available. Using default route.</p>
            ) : (
              <Select
                value={ttsRoute.ttsSelection.connectorId}
                onValueChange={(v) => ttsRoute.selectTtsConnector(v)}
                options={ttsRoute.ttsConnectors.map((c) => ({
                  value: c.id,
                  label: c.label || c.id,
                  description: c.vendor ? `(${c.vendor})` : undefined,
                }))}
                placeholder="Select TTS provider..."
              />
            )}
          </div>
        </div>
      </div>

      {/* Voice loading error banner */}
      {voiceError && (
        <div className="shrink-0 border-b border-red-200 bg-red-50 px-6 py-2 text-xs text-red-700">
          {voiceError}
        </div>
      )}

      {/* Main content: character list + voice config */}
      <div className="flex min-h-0 flex-1">
        {/* Left: character list */}
        <div className="w-56 shrink-0 overflow-y-auto border-r border-gray-100 px-4 py-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-semibold text-gray-700">Characters</h4>
            <button
              type="button"
              onClick={handleAutoRecommend}
              disabled={autoLoading}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-indigo-600 transition-colors hover:bg-indigo-50 disabled:opacity-50"
            >
              {autoLoading && (
                <span className="inline-block h-3 w-3 animate-spin rounded-full border border-indigo-400 border-t-transparent" />
              )}
              {autoLoading ? 'Auto...' : 'Auto'}
            </button>
          </div>
          <div className="space-y-1">
            {characters.map((ch) => {
              const casting = castingMap.get(ch.name);
              const isSelected = ch.name === selected;
              return (
                <button
                  key={ch.name}
                  type="button"
                  onClick={() => onSelectCharacter(ch.name)}
                  className={`block w-full rounded-lg px-3 py-2.5 text-left text-xs transition-colors ${
                    isSelected
                      ? 'border border-indigo-200 bg-indigo-50 text-indigo-800'
                      : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">{ch.name}</span>
                    <TierBadge tier={ch.tier} />
                  </div>
                  {casting && (
                    <p className="mt-0.5 truncate text-[10px] opacity-60">{casting.voiceName}</p>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: voice config for selected character */}
        <div className="min-w-0 flex-1 overflow-y-auto px-6 py-6">
          {selected && selectedCasting ? (
            <div className="mx-auto max-w-md">
              <h3 className="mb-5 text-base font-semibold text-gray-900">
                Voice for {selected}
              </h3>

              {/* Voice selector */}
              <div className="mb-4">
                <label className="mb-1.5 block text-xs font-medium text-gray-600">Voice</label>
                {loadingVoices ? (
                  <div className="flex items-center gap-2 py-2">
                    <div className="h-3 w-3 animate-spin rounded-full border border-gray-400 border-t-transparent" />
                    <span className="text-xs text-gray-400">Loading voices...</span>
                  </div>
                ) : availableVoices.length === 0 ? (
                  <p className="text-xs text-gray-500">No voices available for this provider.</p>
                ) : (
                  <Select
                    value={selectedCasting.voiceId}
                    onValueChange={(v) => {
                      const voice = availableVoices.find((opt) => opt.voiceId === v);
                      if (voice) {
                        onUpdateCasting(selected, {
                          voiceId: voice.voiceId,
                          voiceName: voice.voiceName,
                          providerId: voice.providerId,
                        });
                      }
                    }}
                    options={availableVoices.map((v) => ({
                      value: v.voiceId,
                      label: v.voiceName,
                      description: v.voiceId,
                    }))}
                    placeholder="Select voice..."
                  />
                )}
              </div>

              {/* Speaking rate */}
              <Slider
                className="mb-4"
                label="Speaking Rate"
                value={selectedCasting.speakingRate}
                onValueChange={(v) => onUpdateCasting(selected, { speakingRate: v })}
                min={0.5}
                max={2.0}
                step={0.1}
                formatValue={(v) => `${v.toFixed(1)}x`}
              />

              {/* Pitch */}
              <Slider
                className="mb-4"
                label="Pitch"
                value={selectedCasting.pitch}
                onValueChange={(v) => onUpdateCasting(selected, { pitch: v })}
                min={-10}
                max={10}
                step={1}
                formatValue={(v) => String(v)}
              />

              {/* Emotion */}
              <div className="mb-5">
                <label className="mb-1.5 block text-xs font-medium text-gray-600">Emotion / Style</label>
                <input
                  type="text"
                  value={selectedCasting.emotion ?? ''}
                  onChange={(e) => onUpdateCasting(selected, { emotion: e.target.value || undefined })}
                  placeholder="e.g., calm, excited, sad..."
                  className="w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Preview */}
              <button
                type="button"
                onClick={() => onPreviewVoice(selectedCasting)}
                disabled={previewPlaying !== null || loadingVoices}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                {previewPlaying === selectedCasting.voiceId ? (
                  <>
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
                    Playing...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    Preview Voice
                  </>
                )}
              </button>
            </div>
          ) : selected ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-gray-400">
                No voice assigned for {selected}. Click &ldquo;Auto&rdquo; to auto-assign.
              </p>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-gray-400">Select a character to configure voice.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
