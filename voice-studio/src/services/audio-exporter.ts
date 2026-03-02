// ---------------------------------------------------------------------------
// Audio exporter — chapter-level export via Web Audio API (optional V1 feature)
// ---------------------------------------------------------------------------

import type { AudioOutput } from '../types.js';

/**
 * Concatenate audio blobs into a single blob using Web Audio API.
 * Returns the merged audio as a WAV blob.
 *
 * Note: This runs in the browser. Callers must provide AudioContext.
 */
export async function exportChapterAudio(
  audioContext: AudioContext,
  segmentBlobs: Blob[],
  chapterIndex: number,
  projectId: string,
): Promise<{ blob: Blob; output: AudioOutput }> {
  if (segmentBlobs.length === 0) {
    throw new Error('VS_EXPORT_NO_SEGMENTS');
  }

  // Decode all blobs to AudioBuffers
  const buffers: AudioBuffer[] = [];
  for (const blob of segmentBlobs) {
    const arrayBuffer = await blob.arrayBuffer();
    const decoded = await audioContext.decodeAudioData(arrayBuffer);
    buffers.push(decoded);
  }

  // Calculate total length
  const sampleRate = buffers[0]!.sampleRate;
  const numberOfChannels = buffers[0]!.numberOfChannels;
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0);

  // Merge into single buffer
  const merged = audioContext.createBuffer(numberOfChannels, totalLength, sampleRate);
  let offset = 0;
  for (const buf of buffers) {
    for (let ch = 0; ch < numberOfChannels; ch++) {
      merged.getChannelData(ch).set(buf.getChannelData(ch), offset);
    }
    offset += buf.length;
  }

  // Encode to WAV
  const wavBlob = encodeWav(merged);
  const totalDurationMs = Math.round((totalLength / sampleRate) * 1000);

  const output: AudioOutput = {
    projectId,
    chapterIndex,
    totalDurationMs,
    segmentIds: [], // caller fills these
  };

  return { blob: wavBlob, output };
}

/**
 * Encode an AudioBuffer to WAV format Blob.
 */
function encodeWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataLength = buffer.length * blockAlign;
  const headerLength = 44;

  const arrayBuffer = new ArrayBuffer(headerLength + dataLength);
  const view = new DataView(arrayBuffer);

  // WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  // Interleave channels
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch]![i]!));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
