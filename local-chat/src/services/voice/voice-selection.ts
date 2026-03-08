function equalIgnoreCase(left: string, right: string): boolean {
  return left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0
    || left.toLowerCase() === right.toLowerCase();
}

export function resolveSupportedVoiceId(input: {
  selectedVoiceId?: string;
  availableVoiceIds: string[];
  genderGuard?: 'male' | 'female' | 'neutral' | 'unspecified';
  voiceAffinity?: 'low' | 'medium' | 'high';
}): string {
  const selectedVoiceId = String(input.selectedVoiceId || '').trim();
  const availableVoiceIds = input.availableVoiceIds
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  if (selectedVoiceId && availableVoiceIds.includes(selectedVoiceId)) {
    return selectedVoiceId;
  }
  if (selectedVoiceId) {
    const canonicalVoiceId = availableVoiceIds.find((voiceId) => equalIgnoreCase(voiceId, selectedVoiceId));
    if (canonicalVoiceId) {
      return canonicalVoiceId;
    }
  }
  if (availableVoiceIds.length === 0) {
    return selectedVoiceId;
  }
  const priority = input.genderGuard === 'female'
    ? ['nova', 'shimmer', 'alloy', 'echo', 'fable', 'onyx']
    : input.genderGuard === 'male'
      ? ['onyx', 'echo', 'fable', 'alloy', 'nova', 'shimmer']
      : ['alloy', 'echo', 'fable', 'nova', 'onyx', 'shimmer'];
  if (input.voiceAffinity !== 'low') {
    for (const candidate of priority) {
      const matched = availableVoiceIds.find((voiceId) => equalIgnoreCase(voiceId, candidate));
      if (matched) {
        return matched;
      }
    }
  }
  return availableVoiceIds[0] || selectedVoiceId;
}
