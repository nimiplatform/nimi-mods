export type SupportedEncoding = 'utf-8' | 'gb18030' | 'utf-16le';

export const FILE_PREVIEW_LIMIT = 6000;
export const FILE_STREAM_CHUNK_SIZE = 3000;

function createDecoder(encoding: SupportedEncoding): TextDecoder {
  const labels = encoding === 'gb18030'
    ? ['gb18030', 'gbk', 'gb2312', 'utf-8']
    : encoding === 'utf-16le'
      ? ['utf-16le', 'utf-16', 'utf-8']
      : ['utf-8', 'utf-16le'];
  for (const label of labels) {
    try {
      return new TextDecoder(label);
    } catch {
      // try next label
    }
  }
  return new TextDecoder('utf-8');
}

function countReplacementChars(text: string): number {
  return (String(text || '').match(/\uFFFD/g) || []).length;
}

function countCjkChars(text: string): number {
  return (String(text || '').match(/[\u3400-\u9fff]/g) || []).length;
}

function decodeSampleWithLabel(sample: Uint8Array, label: string): string | null {
  try {
    const decoder = new TextDecoder(label);
    return decoder.decode(sample);
  } catch {
    return null;
  }
}

export async function detectBestEncoding(
  file: File,
  preferred: SupportedEncoding,
): Promise<SupportedEncoding> {
  const sampleBuffer = await file.slice(0, 256 * 1024).arrayBuffer();
  const sample = new Uint8Array(sampleBuffer);
  const labels = preferred === 'gb18030'
    ? ['gb18030', 'gbk', 'gb2312', 'utf-16le', 'utf-8']
    : preferred === 'utf-16le'
      ? ['utf-16le', 'utf-16', 'utf-8', 'gb18030', 'gbk', 'gb2312']
      : ['utf-8', 'utf-16le', 'utf-16', 'gb18030', 'gbk', 'gb2312'];

  let bestLabel: string | null = null;
  let bestReplacement = Number.POSITIVE_INFINITY;
  let bestCjk = -1;

  for (const label of labels) {
    const decoded = decodeSampleWithLabel(sample, label);
    if (decoded == null) continue;
    const replacement = countReplacementChars(decoded);
    const cjk = countCjkChars(decoded);
    if (
      replacement < bestReplacement
      || (replacement === bestReplacement && cjk > bestCjk)
    ) {
      bestReplacement = replacement;
      bestCjk = cjk;
      bestLabel = label;
    }
  }

  if (!bestLabel) return preferred;
  if (bestLabel === 'utf-8') return 'utf-8';
  if (bestLabel === 'utf-16le' || bestLabel === 'utf-16') return 'utf-16le';
  return 'gb18030';
}

export async function streamFileToChunks(
  file: File,
  encoding: SupportedEncoding,
  options?: {
    chunkSize?: number;
    previewLimit?: number;
    overlap?: number;
  },
): Promise<{ chunks: string[]; preview: string }> {
  const chunkSize = options?.chunkSize || FILE_STREAM_CHUNK_SIZE;
  const previewLimit = options?.previewLimit || FILE_PREVIEW_LIMIT;
  const overlap = Math.max(0, Math.min(options?.overlap ?? 300, chunkSize - 1));
  const step = Math.max(1, chunkSize - overlap);
  const reader = file.stream().getReader();
  const decoder = createDecoder(encoding);
  const chunks: string[] = [];
  let pending = '';
  let preview = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    while (pending.length >= chunkSize) {
      const chunk = pending.slice(0, chunkSize);
      chunks.push(chunk);
      if (preview.length < previewLimit) {
        preview += chunk.slice(0, previewLimit - preview.length);
      }
      pending = pending.slice(step);
    }
  }

  pending += decoder.decode();
  if (pending.length > 0) {
    chunks.push(pending);
    if (preview.length < previewLimit) {
      preview += pending.slice(0, previewLimit - preview.length);
    }
  }

  return {
    chunks,
    preview,
  };
}
