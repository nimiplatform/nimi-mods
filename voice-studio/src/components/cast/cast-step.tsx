// ---------------------------------------------------------------------------
// Cast step — character list + voice selector + preview + auto-recommend
// ---------------------------------------------------------------------------

import React, { useEffect, useState } from 'react';
import type { CharacterProfile, VoiceCasting, TtsClient } from '../../types.js';

type CastStepProps = {
  characters: CharacterProfile[];
  castings: VoiceCasting[];
  selectedCharacter: string | null;
  previewPlaying: string | null;
  ttsClient: TtsClient;
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

export function CastStep(props: CastStepProps) {
  const {
    characters, castings, selectedCharacter, previewPlaying,
    ttsClient, onSelectCharacter, onUpdateCasting, onPreviewVoice, onAutoRecommend,
  } = props;

  const [availableVoices, setAvailableVoices] = useState<VoiceOption[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);

  // Load available voices
  useEffect(() => {
    let cancelled = false;
    setLoadingVoices(true);
    ttsClient.listVoices().then((voices) => {
      if (!cancelled) {
        setAvailableVoices(voices);
        setLoadingVoices(false);
      }
    }).catch(() => {
      if (!cancelled) setLoadingVoices(false);
    });
    return () => { cancelled = true; };
  }, [ttsClient]);

  const castingMap = new Map(castings.map((c) => [c.characterName, c]));
  const selected = selectedCharacter ?? characters[0]?.name ?? null;
  const selectedCasting = selected ? castingMap.get(selected) : null;

  return (
    <div className="mx-auto flex max-w-3xl gap-4 p-6">
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
              disabled={previewPlaying !== null}
              className={`w-full rounded-lg px-4 py-2 text-sm font-medium ${
                previewPlaying === selectedCasting.voiceId
                  ? 'bg-blue-100 text-blue-700'
                  : previewPlaying
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
  );
}
