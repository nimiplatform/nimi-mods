/**
 * BD-PIPE-002 / BD-PIPE-003 语音引擎
 * 封装 TTS 播放 + 口型同步接入 和 STT 录制 + 转写。
 */

import type { LipSyncFrame } from '../contracts.js';
import {
  getBuddyLipSyncProcessorName,
  getBuddyLipSyncWorkletUrl,
} from './lip-sync-worklet.js';
import { logBuddyConsole } from './debug-log.js';

export interface LipSyncStream {
  subscribe(listener: (frame: LipSyncFrame) => void): () => void;
  dispose(): void;
}

export interface VoicePlaybackResult {
  audioContext: AudioContext;
  analyser: AnalyserNode;
  lipSyncStream: LipSyncStream | null;
  /** 音频播放完毕的 Promise */
  finished: Promise<void>;
  stop: () => Promise<void>;
}

class LipSyncStreamEmitter implements LipSyncStream {
  private listeners = new Set<(frame: LipSyncFrame) => void>();

  emit(frame: LipSyncFrame) {
    for (const listener of this.listeners) {
      listener(frame);
    }
  }

  subscribe(listener: (frame: LipSyncFrame) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose() {
    this.listeners.clear();
  }
}

function normalizeLipSyncFrame(raw: unknown): LipSyncFrame | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const phonemesRaw = record.phonemes;
  if (!phonemesRaw || typeof phonemesRaw !== 'object') return null;
  const phonemesRecord = phonemesRaw as Record<string, unknown>;
  const dominantPhoneme = String(record.dominantPhoneme || 'S').trim().toUpperCase();
  if (!['A', 'E', 'I', 'O', 'U', 'S'].includes(dominantPhoneme)) return null;
  const mfcc = Array.isArray(record.mfcc)
    ? record.mfcc.map((value) => Number(value || 0))
    : [];
  return {
    rms: Number(record.rms || 0),
    dominantPhoneme: dominantPhoneme as LipSyncFrame['dominantPhoneme'],
    phonemes: {
      A: Number(phonemesRecord.A || 0),
      E: Number(phonemesRecord.E || 0),
      I: Number(phonemesRecord.I || 0),
      O: Number(phonemesRecord.O || 0),
      U: Number(phonemesRecord.U || 0),
      S: Number(phonemesRecord.S || 0),
    },
    mfcc,
  };
}

async function createAudioAnalysisChain(
  audioContext: AudioContext,
  sourceNode: AudioNode,
): Promise<{
  analyser: AnalyserNode;
  lipSyncStream: LipSyncStream | null;
  cleanup: () => void;
}> {
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.65;

  let cleanup = () => {
    try {
      analyser.disconnect();
    } catch {
      // Ignore disconnect races.
    }
  };

  if (
    typeof AudioWorkletNode !== 'undefined'
    && audioContext.audioWorklet
  ) {
    try {
      await audioContext.audioWorklet.addModule(getBuddyLipSyncWorkletUrl());
      const workletNode = new AudioWorkletNode(
        audioContext,
        getBuddyLipSyncProcessorName(),
      );
      const emitter = new LipSyncStreamEmitter();
      workletNode.port.onmessage = (event) => {
        const frame = normalizeLipSyncFrame(event.data);
        if (frame) {
          emitter.emit(frame);
        }
      };
      sourceNode.connect(workletNode);
      workletNode.connect(analyser);
      analyser.connect(audioContext.destination);
      cleanup = () => {
        workletNode.port.onmessage = null;
        emitter.dispose();
        try {
          sourceNode.disconnect(workletNode);
        } catch {
          // Ignore disconnect races.
        }
        try {
          workletNode.disconnect();
        } catch {
          // Ignore disconnect races.
        }
        try {
          analyser.disconnect();
        } catch {
          // Ignore disconnect races.
        }
      };
      return {
        analyser,
        lipSyncStream: emitter,
        cleanup,
      };
    } catch (error) {
      logBuddyConsole('warn', 'buddy:lipsync:worklet-fallback', {
        error: error instanceof Error ? error.message : String(error || ''),
      });
      // Fallback to raw analyser-only path below.
    }
  }

  logBuddyConsole('info', 'buddy:lipsync:using-analyser-fallback');
  sourceNode.connect(analyser);
  analyser.connect(audioContext.destination);
  return {
    analyser,
    lipSyncStream: null,
    cleanup,
  };
}

function toUint8Array(audioBytes: ArrayBuffer | Uint8Array): Uint8Array {
  return audioBytes instanceof Uint8Array ? audioBytes : new Uint8Array(audioBytes);
}

function toArrayBuffer(audioBytes: ArrayBuffer | Uint8Array): ArrayBuffer {
  const bytes = toUint8Array(audioBytes);
  if (
    bytes.byteOffset === 0
    && bytes.byteLength === bytes.buffer.byteLength
    && bytes.buffer instanceof ArrayBuffer
  ) {
    return bytes.buffer;
  }
  return bytes.slice().buffer;
}

/**
 * 播放 TTS 音频字节并返回 AnalyserNode 供口型同步使用。
 */
export async function playAudioBytes(
  audioBytes: ArrayBuffer | Uint8Array,
  mimeType: string,
): Promise<VoicePlaybackResult> {
  const audioContext = new AudioContext();
  const audioBuffer = await audioContext.decodeAudioData(toArrayBuffer(audioBytes));
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  const analysis = await createAudioAnalysisChain(audioContext, source);

  const finished = new Promise<void>((resolve) => {
    source.onended = () => {
      analysis.cleanup();
      resolve();
    };
  });

  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    analysis.cleanup();
    try {
      source.stop(0);
    } catch {
      // Ignore stop races.
    }
  };

  source.start(0);

  return {
    audioContext,
    analyser: analysis.analyser,
    lipSyncStream: analysis.lipSyncStream,
    finished,
    stop,
  };
}

export interface AudioPlaybackSource {
  audioBytes?: Uint8Array;
  audioUri?: string;
  mimeType?: string;
}

export async function playAudioSource(source: AudioPlaybackSource): Promise<VoicePlaybackResult> {
  const audioUri = String(source.audioUri || '').trim();
  const bytes = source.audioBytes instanceof Uint8Array && source.audioBytes.length > 0
    ? Uint8Array.from(source.audioBytes)
    : null;

  if (!audioUri && !bytes) {
    throw new Error('BUDDY_TTS_EMPTY_AUDIO_SOURCE');
  }

  const mimeType = String(source.mimeType || '').trim() || (bytes ? detectMimeType(bytes.slice().buffer) : 'audio/mpeg');
  if (bytes) {
    logBuddyConsole('debug', 'buddy:tts:playback-source', {
      kind: 'audio-bytes',
      bytesLength: bytes.length,
      mimeType,
    });
    return playAudioBytes(bytes, mimeType);
  }

  const audioContext = new AudioContext();

  let objectUrl = '';
  const playbackUrl = audioUri;

  logBuddyConsole('debug', 'buddy:tts:playback-source', {
    kind: 'audio-uri',
    audioUri,
    mimeType,
  });

  const audio = new Audio(playbackUrl);
  audio.preload = 'auto';
  const mediaSource = audioContext.createMediaElementSource(audio);
  const analysis = await createAudioAnalysisChain(audioContext, mediaSource);

  let finishedResolve: (() => void) | null = null;
  let finishedReject: ((reason?: unknown) => void) | null = null;
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    audio.src = '';
    analysis.cleanup();
    analysis.lipSyncStream?.dispose();
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = '';
    }
  };

  const finished = new Promise<void>((resolve, reject) => {
    finishedResolve = resolve;
    finishedReject = reject;
  });

  audio.onended = () => {
    cleanup();
    finishedResolve?.();
  };
  audio.onerror = () => {
    cleanup();
    finishedReject?.(new Error('BUDDY_TTS_PLAYBACK_FAILED'));
  };

  const stop = async () => {
    cleanup();
    finishedResolve?.();
  };

  await audioContext.resume();
  await audio.play();

  return {
    audioContext,
    analyser: analysis.analyser,
    lipSyncStream: analysis.lipSyncStream,
    finished,
    stop,
  };
}

/**
 * 检测音频 MIME 类型（从字节头）。
 */
export function detectMimeType(bytes: ArrayBuffer): string {
  const header = new Uint8Array(bytes, 0, 4);
  // WAV: RIFF
  if (
    header[0] === 0x52
    && header[1] === 0x49
    && header[2] === 0x46
    && header[3] === 0x46
  ) {
    return 'audio/wav';
  }
  // MP3: ID3 or 0xFF 0xFB
  if (
    (header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33) ||
    (header[0] === 0xff && header[1] !== undefined && (header[1] & 0xe0) === 0xe0)
  ) {
    return 'audio/mpeg';
  }
  // OGG
  if (header[0] === 0x4f && header[1] === 0x67 && header[2] === 0x67 && header[3] === 0x53) {
    return 'audio/ogg';
  }
  return 'audio/mpeg'; // fallback
}

export function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

/**
 * BD-PIPE-003 录制语音输入
 * 使用 MediaRecorder API 录制用户语音。
 */
export async function recordVoice(
  onChunk?: (blob: Blob) => void,
): Promise<{ stop: () => Promise<Blob>; cancel: () => void }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  // Detect codec support
  const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']
    .find((t) => MediaRecorder.isTypeSupported(t)) ?? '';

  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      chunks.push(e.data);
      onChunk?.(e.data);
    }
  };

  recorder.start(250); // 250ms chunks (BD-PIPE-003)

  return {
    stop: () =>
      new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
        };
        recorder.stop();
      }),
    cancel: () => {
      recorder.stop();
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}
