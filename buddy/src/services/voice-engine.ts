/**
 * BD-PIPE-002 / BD-PIPE-003 语音引擎
 * 封装 TTS 播放 + 口型同步接入 和 STT 录制 + 转写。
 */

export interface VoicePlaybackResult {
  audioContext: AudioContext;
  analyser: AnalyserNode;
  /** 音频播放完毕的 Promise */
  finished: Promise<void>;
  stop: () => Promise<void>;
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
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;

  const audioBuffer = await audioContext.decodeAudioData(toArrayBuffer(audioBytes));
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(analyser);
  analyser.connect(audioContext.destination);

  const finished = new Promise<void>((resolve) => {
    source.onended = () => resolve();
  });

  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    try {
      source.stop(0);
    } catch {
      // Ignore stop races.
    }
  };

  source.start(0);

  return { audioContext, analyser, finished, stop };
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
  const audioContext = new AudioContext();
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;

  let objectUrl = '';
  const playbackUrl = bytes
    ? (() => {
      objectUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
      return objectUrl;
    })()
    : audioUri;

  const audio = new Audio(playbackUrl);
  audio.preload = 'auto';
  const mediaSource = audioContext.createMediaElementSource(audio);
  mediaSource.connect(analyser);
  analyser.connect(audioContext.destination);

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

  return { audioContext, analyser, finished, stop };
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
