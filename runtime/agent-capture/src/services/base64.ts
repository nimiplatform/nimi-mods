export function encodeBytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }

  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    let binary = '';
    for (let cursor = 0; cursor < chunk.length; cursor += 1) {
      binary += String.fromCharCode(chunk[cursor] || 0);
    }
    parts.push(binary);
  }
  return btoa(parts.join(''));
}

export function encodeBytesToDataUrl(input: {
  bytes: Uint8Array;
  mimeType: string;
}): string {
  return `data:${input.mimeType};base64,${encodeBytesToBase64(input.bytes)}`;
}
