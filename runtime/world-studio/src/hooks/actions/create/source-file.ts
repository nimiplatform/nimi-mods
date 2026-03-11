import {
  detectBestEncoding,
  FILE_PREVIEW_LIMIT,
  FILE_STREAM_CHUNK_SIZE,
  type SupportedEncoding,
  streamFileToChunks,
} from '../../../engine/encoding.js';
import type { WorldStudioCreateActionsInput } from './types.js';

const MAX_SOURCE_FILE_BYTES = 10 * 1024 * 1024;

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

async function decodeFileText(file: File, encoding: SupportedEncoding): Promise<string> {
  const decoder = createDecoder(encoding);
  return decoder.decode(new Uint8Array(await file.arrayBuffer()));
}

export async function selectSourceFile(
  input: WorldStudioCreateActionsInput,
  file: File | null,
): Promise<void> {
  if (!file) return;
  const name = file.name.toLowerCase();
  if (!name.endsWith('.txt') && !name.endsWith('.md')) {
    input.setError('Only txt/md files are supported.');
    return;
  }
  if (file.size > MAX_SOURCE_FILE_BYTES) {
    input.setError('File too large. Max size is 10MB.');
    return;
  }
  try {
    const usedEncoding = await detectBestEncoding(file, input.sourceEncoding);
    if (usedEncoding !== input.sourceEncoding) {
      input.setSourceEncoding(usedEncoding);
    }
    const { chunks, preview } = await streamFileToChunks(file, usedEncoding, {
      chunkSize: FILE_STREAM_CHUNK_SIZE,
      previewLimit: FILE_PREVIEW_LIMIT,
      overlap: 300,
    });
    const rawText = await decodeFileText(file, usedEncoding);
    if (chunks.length === 0) {
      throw new Error('Selected file is empty.');
    }
    if (!rawText.trim()) {
      throw new Error('Selected file is empty.');
    }
    input.sourceRawTextRef.current = rawText;
    input.sourceChunksRef.current = chunks;
    input.setSourceMode('FILE');
    input.setFilePreviewText(preview);
    input.patchSnapshot({
      sourceText: '',
      sourceRef: `local://${file.name}`,
    });
    input.setNotice(`Loaded ${file.name} (${Math.ceil(file.size / 1024)} KB), chunks: ${chunks.length}, encoding: ${usedEncoding}.`);
    input.setError(null);
  } catch (fileError) {
    input.setError(fileError instanceof Error ? fileError.message : String(fileError));
  }
}
