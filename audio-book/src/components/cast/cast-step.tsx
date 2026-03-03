// ---------------------------------------------------------------------------
// Cast step — connector selector + character list + voice selector + preview
// ---------------------------------------------------------------------------

import React, { useEffect, useState } from 'react';
import type { CharacterProfile, VoiceCasting, TtsClient } from '../../types.js';
import type { TtsRouteState } from '../../controllers/use-tts-route.js';

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

  // Reload voices when connector changes
  useEffect(() => {
    // Skip if route is still loading
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

  return (
    <div className="mx-auto max-w-3xl p-6">
      {/* TTS Connector selector */}
      <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <label className="mb-1 block text-xs font-medium text-gray-600">TTS Provider</label>
        {ttsRoute.loading ? (
          <p className="text-xs text-gray-400">Loading providers...</p>
        ) : ttsRoute.error ? (
          <p className="text-xs text-red-500">{ttsRoute.error}</p>
        ) : ttsRoute.ttsConnectors.length === 0 ? (
          <p className="text-xs text-gray-500">No TTS connectors available. Using default route.</p>
        ) : (
          <select
            value={ttsRoute.ttsSelection.connectorId}
            onChange={(e) => ttsRoute.selectTtsConnector(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-500"
          >
            {ttsRoute.ttsConnectors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label || c.id}
                {c.vendor ? ` (${c.vendor})` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Voice loading error banner */}
      {voiceError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {voiceError}
        </div>
      )}

      <div className="flex gap-4">
        {/* Left: character list */}
        <div className="w-48 shrink-0">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-700">Characters</h4>
            <button
              type="button"
              onClick={onAutoRecommend}
              className="text-[10px] font-medium text-blue-600 hover:underline"
              title="Auto-assign voices via LLM"
            >
              Auto
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
                  className={`block w-full rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                    isSelected ? 'bg-blue-50 text-blue-800' : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <span className="font-medium">{ch.name}</span>
                  <span className="ml-1 text-[10px] opacity-60">({ch.tier})</span>
                  {casting && (
                    <p className="mt-0.5 truncate text-[10px] opacity-60">{casting.voiceName}</p>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: voice config for selected character */}
        <div className="min-w-0 flex-1">
          {selected && selectedCasting ? (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h4 className="mb-3 text-sm font-semibold text-gray-900">
                Voice for {selected}
              </h4>

              {/* Voice selector */}
              <div className="mb-3">
                <label className="mb-1 block text-xs font-medium text-gray-600">Voice</label>
                {loadingVoices ? (
                  <p className="text-xs text-gray-400">Loading voices...</p>
                ) : availableVoices.length === 0 ? (
                  <p className="text-xs text-gray-500">No voices available for this provider.</p>
                ) : (
                  <select
                    value={selectedCasting.voiceId}
                    onChange={(e) => {
                      const voice = availableVoices.find((v) => v.voiceId === e.target.value);
                      if (voice) {
                        onUpdateCasting(selected, {
                          voiceId: voice.voiceId,
                          voiceName: voice.voiceName,
                          providerId: voice.providerId,
                        });
                      }
                    }}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  >
                    {availableVoices.map((v) => (
                      <option key={`${v.providerId}:${v.voiceId}`} value={v.voiceId}>
                        {v.voiceName} ({v.voiceId})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Speaking rate */}
              <div className="mb-3">
                <label className="mb-1 flex items-center justify-between text-xs font-medium text-gray-600">
                  <span>Speaking Rate</span>
                  <span className="text-[10px] text-gray-400">{selectedCasting.speakingRate.toFixed(1)}x</span>
                </label>
                <input
                  type="range"
                  min={0.5}
                  max={2.0}
                  step={0.1}
                  value={selectedCasting.speakingRate}
                  onChange={(e) => onUpdateCasting(selected, { speakingRate: Number(e.target.value) })}
                  className="w-full"
                />
              </div>

              {/* Pitch */}
              <div className="mb-3">
                <label className="mb-1 flex items-center justify-between text-xs font-medium text-gray-600">
                  <span>Pitch</span>
                  <span className="text-[10px] text-gray-400">{selectedCasting.pitch}</span>
                </label>
                <input
                  type="range"
                  min={-10}
                  max={10}
                  step={1}
                  value={selectedCasting.pitch}
                  onChange={(e) => onUpdateCasting(selected, { pitch: Number(e.target.value) })}
                  className="w-full"
                />
              </div>

              {/* Emotion */}
              <div className="mb-4">
                <label className="mb-1 block text-xs font-medium text-gray-600">Emotion / Style</label>
                <input
                  type="text"
                  value={selectedCasting.emotion ?? ''}
                  onChange={(e) => onUpdateCasting(selected, { emotion: e.target.value || undefined })}
                  placeholder="e.g., calm, excited, sad..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </div>

              {/* Preview */}
              <button
                type="button"
                onClick={() => onPreviewVoice(selectedCasting)}
                disabled={previewPlaying !== null || loadingVoices}
                className={`w-full rounded-lg px-4 py-2 text-sm font-medium ${
                  previewPlaying === selectedCasting.voiceId
                    ? 'bg-blue-100 text-blue-700'
                    : previewPlaying || loadingVoices
                      ? 'bg-gray-100 text-gray-400 cursor-default'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {previewPlaying === selectedCasting.voiceId ? 'Playing...' : 'Preview Voice'}
              </button>
            </div>
          ) : selected ? (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-sm text-gray-500">
                No voice assigned for {selected}. Click &ldquo;Auto&rdquo; to auto-assign.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-sm text-gray-500">Select a character to configure voice.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
