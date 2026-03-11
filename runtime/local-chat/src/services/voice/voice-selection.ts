function equalIgnoreCase(left: string, right: string): boolean {
  return left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0
    || left.toLowerCase() === right.toLowerCase();
}

type VoiceOption = {
  id: string;
  name?: string;
};

function inferVoiceGender(value: string): 'male' | 'female' | 'neutral' | 'unknown' {
  const normalized = value.toLowerCase();
  if (/(^|[\s_-])(alloy|neutral|androgynous)([\s_-]|$)/.test(normalized)) return 'neutral';
  if (/(^|[\s_-])(nova|shimmer|serena|cherry|luna|female|woman|girl)([\s_-]|$)/.test(normalized)) return 'female';
  if (/(^|[\s_-])(onyx|echo|fable|arthur|male|man|boy)([\s_-]|$)/.test(normalized)) return 'male';
  return 'unknown';
}

function findCanonicalVoice(entries: VoiceOption[], voiceId: string): VoiceOption | undefined {
  return entries.find((entry) => equalIgnoreCase(entry.id, voiceId));
}

function applyGenderFilter(entries: VoiceOption[], genderGuard?: 'male' | 'female' | 'neutral' | 'unspecified'): VoiceOption[] {
  if (!genderGuard || genderGuard === 'neutral' || genderGuard === 'unspecified') {
    return entries;
  }
  const filtered = entries.filter((entry) => {
    const inferred = inferVoiceGender(`${entry.id} ${entry.name || ''}`);
    return inferred === 'unknown' || inferred === 'neutral' || inferred === genderGuard;
  });
  return filtered.length > 0 ? filtered : entries;
}

function splitExactAndNeutralCandidates(
  entries: VoiceOption[],
  genderGuard?: 'male' | 'female' | 'neutral' | 'unspecified',
): {
  exact: VoiceOption[];
  neutral: VoiceOption[];
} {
  if (!genderGuard || genderGuard === 'neutral' || genderGuard === 'unspecified') {
    return { exact: entries, neutral: [] };
  }
  const exact = entries.filter((entry) => inferVoiceGender(`${entry.id} ${entry.name || ''}`) === genderGuard);
  const neutral = entries.filter((entry) => inferVoiceGender(`${entry.id} ${entry.name || ''}`) === 'neutral');
  return { exact, neutral };
}

export function resolveSupportedVoiceId(input: {
  selectedVoiceId?: string;
  stableVoiceId?: string;
  preferredVoiceId?: string;
  availableVoiceIds: string[];
  availableVoices?: VoiceOption[];
  genderGuard?: 'male' | 'female' | 'neutral' | 'unspecified';
  voiceAffinity?: 'low' | 'medium' | 'high';
}): string {
  const selectedVoiceId = String(input.selectedVoiceId || '').trim();
  const stableVoiceId = String(input.stableVoiceId || '').trim();
  const preferredVoiceId = String(input.preferredVoiceId || '').trim();
  const availableVoiceIds = input.availableVoiceIds
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  const voiceEntries = (input.availableVoices && input.availableVoices.length > 0
    ? input.availableVoices
    : availableVoiceIds.map((id) => ({ id, name: '' })))
    .map((entry) => ({
      id: String(entry.id || '').trim(),
      name: String(entry.name || '').trim(),
    }))
    .filter((entry) => entry.id);
  if (selectedVoiceId) {
    const selected = findCanonicalVoice(voiceEntries, selectedVoiceId);
    if (selected) {
      return selected.id;
    }
  }
  if (selectedVoiceId) {
    const canonicalVoiceId = availableVoiceIds.find((voiceId) => equalIgnoreCase(voiceId, selectedVoiceId));
    if (canonicalVoiceId) return canonicalVoiceId;
  }
  if (voiceEntries.length === 0) {
    return selectedVoiceId || stableVoiceId || preferredVoiceId;
  }
  const candidateEntries = applyGenderFilter(voiceEntries, input.genderGuard);
  const { exact: exactGenderEntries, neutral: neutralEntries } = splitExactAndNeutralCandidates(candidateEntries, input.genderGuard);
  const prioritizedCandidates = exactGenderEntries.length > 0
    ? [...exactGenderEntries, ...neutralEntries]
    : candidateEntries;
  if (stableVoiceId) {
    const stable = findCanonicalVoice(prioritizedCandidates, stableVoiceId);
    if (stable) return stable.id;
  }
  if (preferredVoiceId) {
    const preferred = findCanonicalVoice(prioritizedCandidates, preferredVoiceId);
    if (preferred) return preferred.id;
  }
  const priority = input.genderGuard === 'female'
    ? ['nova', 'shimmer', 'serena', 'cherry', 'luna', 'alloy', 'echo', 'fable', 'onyx']
    : input.genderGuard === 'male'
      ? ['onyx', 'echo', 'fable', 'arthur', 'alloy', 'nova', 'shimmer']
      : ['alloy', 'echo', 'fable', 'nova', 'onyx', 'shimmer'];
  if (input.voiceAffinity !== 'low' || input.genderGuard === 'female' || input.genderGuard === 'male') {
    for (const candidate of priority) {
      const matched = prioritizedCandidates.find((voice) => equalIgnoreCase(voice.id, candidate));
      if (matched) {
        return matched.id;
      }
    }
  }
  return prioritizedCandidates[0]?.id || candidateEntries[0]?.id || voiceEntries[0]?.id || selectedVoiceId || stableVoiceId || preferredVoiceId;
}
