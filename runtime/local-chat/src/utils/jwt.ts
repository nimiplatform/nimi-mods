function normalizeText(value: unknown): string {
  return String(value || '').trim();
}

function decodeBase64UrlUtf8(input: string): string {
  const normalized = normalizeText(input).replace(/-/g, '+').replace(/_/g, '/');
  if (!normalized) return '';
  const paddingLength = (4 - (normalized.length % 4)) % 4;
  const padded = `${normalized}${'='.repeat(paddingLength)}`;

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(padded, 'base64').toString('utf8');
  }

  if (typeof atob === 'function') {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    if (typeof TextDecoder !== 'undefined') {
      return new TextDecoder('utf-8').decode(bytes);
    }
    return String.fromCharCode(...bytes);
  }

  return '';
}

export function decodeJwtSubject(accessToken: string | null | undefined): string | null {
  const normalizedToken = normalizeText(accessToken);
  if (!normalizedToken) return null;

  const rawToken = normalizedToken.toLowerCase().startsWith('bearer ')
    ? normalizeText(normalizedToken.slice(7))
    : normalizedToken;
  const parts = rawToken.split('.');
  if (parts.length < 2) return null;

  try {
    const payloadText = decodeBase64UrlUtf8(parts[1] || '');
    if (!payloadText) return null;
    const payload = JSON.parse(payloadText) as Record<string, unknown>;
    const subject = normalizeText(payload.sub || payload.userId || payload.viewerId);
    return subject || null;
  } catch {
    return null;
  }
}
