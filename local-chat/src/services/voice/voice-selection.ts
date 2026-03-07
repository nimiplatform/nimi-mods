function equalIgnoreCase(left: string, right: string): boolean {
  return left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0
    || left.toLowerCase() === right.toLowerCase();
}

export function resolveSupportedVoiceId(input: {
  selectedVoiceId?: string;
  availableVoiceIds: string[];
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
  return availableVoiceIds[0] || selectedVoiceId;
}
