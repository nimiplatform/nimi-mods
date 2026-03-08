import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createVoicePlaybackDataUri,
  createVoicePlaybackUrl,
  normalizeVoicePlaybackMimeType,
} from '../src/hooks/use-speech-playback.js';
import {
  createPersistableVoicePlaybackCacheMeta,
  isDirectVoicePlaybackUri,
  resolveCachedVoicePlaybackSource,
} from '../src/services/voice/playback-source.js';
import { resolveSupportedVoiceId } from '../src/services/voice/voice-selection.js';

test('bytes-only TTS artifact creates blob playback URL', () => {
  const createObjectURLCalls: Blob[] = [];
  const previousUrl = globalThis.URL;
  const fakeUrl = {
    ...previousUrl,
    createObjectURL: (blob: Blob) => {
      createObjectURLCalls.push(blob);
      return 'blob:local-chat-audio';
    },
  } as typeof URL;
  globalThis.URL = fakeUrl;

  try {
    let assignedObjectUrl: string | null = null;
    const playbackUrl = createVoicePlaybackUrl({
      source: {
        audioBytes: new Uint8Array([1, 2, 3, 4]),
        mimeType: 'audio/mpeg',
      },
      setObjectUrl: (value) => {
        assignedObjectUrl = value;
      },
    });

    assert.equal(playbackUrl, 'blob:local-chat-audio');
    assert.equal(assignedObjectUrl, 'blob:local-chat-audio');
    assert.equal(createObjectURLCalls.length, 1);
    assert.equal(createObjectURLCalls[0]?.type, 'audio/mpeg');
  } finally {
    globalThis.URL = previousUrl;
  }
});

test('audio/x-wav bytes are normalized to audio/wav for blob playback', () => {
  const createObjectURLCalls: Blob[] = [];
  const previousUrl = globalThis.URL;
  const fakeUrl = {
    ...previousUrl,
    createObjectURL: (blob: Blob) => {
      createObjectURLCalls.push(blob);
      return 'blob:local-chat-wav';
    },
  } as typeof URL;
  globalThis.URL = fakeUrl;

  try {
    createVoicePlaybackUrl({
      source: {
        audioBytes: new Uint8Array([
          0x52, 0x49, 0x46, 0x46, 0x24, 0xfd, 0x02, 0x00,
          0x57, 0x41, 0x56, 0x45,
        ]),
        mimeType: 'audio/x-wav',
      },
      setObjectUrl: () => {},
    });

    assert.equal(createObjectURLCalls[0]?.type, 'audio/wav');
  } finally {
    globalThis.URL = previousUrl;
  }
});

test('wav bytes infer audio/wav when mime type is missing', () => {
  assert.equal(
    normalizeVoicePlaybackMimeType({
      audioBytes: new Uint8Array([
        0x52, 0x49, 0x46, 0x46, 0x24, 0xfd, 0x02, 0x00,
        0x57, 0x41, 0x56, 0x45,
      ]),
    }),
    'audio/wav',
  );
});

test('bytes playback can fall back to a data URI with normalized mime type', () => {
  const dataUri = createVoicePlaybackDataUri({
    audioBytes: new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x24, 0xfd, 0x02, 0x00,
      0x57, 0x41, 0x56, 0x45,
    ]),
    mimeType: 'audio/x-wav',
  });

  assert.match(dataUri, /^data:audio\/wav;base64,/);
});

test('playback prefers bytes over remote URI when both are available', () => {
  const createObjectURLCalls: Blob[] = [];
  const previousUrl = globalThis.URL;
  const fakeUrl = {
    ...previousUrl,
    createObjectURL: (blob: Blob) => {
      createObjectURLCalls.push(blob);
      return 'blob:preferred-audio-bytes';
    },
  } as typeof URL;
  globalThis.URL = fakeUrl;

  try {
    let assignedObjectUrl: string | null = null;
    const playbackUrl = createVoicePlaybackUrl({
      source: {
        audioUri: 'https://dashscope.example/audio.mp3',
        audioBytes: new Uint8Array([9, 8, 7, 6]),
        mimeType: 'audio/mpeg',
      },
      setObjectUrl: (value) => {
        assignedObjectUrl = value;
      },
    });

    assert.equal(playbackUrl, 'blob:preferred-audio-bytes');
    assert.equal(assignedObjectUrl, 'blob:preferred-audio-bytes');
    assert.equal(createObjectURLCalls.length, 1);
  } finally {
    globalThis.URL = previousUrl;
  }
});

test('playback prefers bytes over file URI when both are available', () => {
  const createObjectURLCalls: Blob[] = [];
  const previousUrl = globalThis.URL;
  const fakeUrl = {
    ...previousUrl,
    createObjectURL: (blob: Blob) => {
      createObjectURLCalls.push(blob);
      return 'blob:preferred-audio-bytes';
    },
  } as typeof URL;
  globalThis.URL = fakeUrl;

  try {
    let assignedObjectUrl: string | null = null;
    const playbackUrl = createVoicePlaybackUrl({
      source: {
        audioUri: 'file:///tmp/local-chat-audio.mp3',
        audioBytes: new Uint8Array([9, 8, 7, 6]),
        mimeType: 'audio/mpeg',
      },
      setObjectUrl: (value) => {
        assignedObjectUrl = value;
      },
    });

    assert.equal(playbackUrl, 'blob:preferred-audio-bytes');
    assert.equal(assignedObjectUrl, 'blob:preferred-audio-bytes');
    assert.equal(createObjectURLCalls.length, 1);
  } finally {
    globalThis.URL = previousUrl;
  }
});

test('remote http voice URI is not treated as directly replayable cache', () => {
  assert.equal(isDirectVoicePlaybackUri('https://dashscope.example/audio.mp3'), false);
  assert.equal(
    resolveCachedVoicePlaybackSource({
      audioUri: 'https://dashscope.example/audio.mp3',
    }),
    null,
  );
  assert.equal(
    createPersistableVoicePlaybackCacheMeta({
      audioUri: 'https://dashscope.example/audio.mp3',
    }),
    null,
  );
});

test('local and self-contained voice URIs remain directly replayable', () => {
  assert.equal(isDirectVoicePlaybackUri('/artifacts/audio.mp3'), true);
  assert.equal(isDirectVoicePlaybackUri('blob:local-chat-audio'), true);
  assert.equal(isDirectVoicePlaybackUri('file:///tmp/local-chat-audio.mp3'), false);
  assert.deepEqual(
    resolveCachedVoicePlaybackSource({
      audioUri: '/artifacts/audio.mp3',
    }),
    { audioUri: '/artifacts/audio.mp3' },
  );
  assert.deepEqual(
    createPersistableVoicePlaybackCacheMeta({
      audioUri: '/artifacts/audio.mp3',
    }),
    { audioUri: '/artifacts/audio.mp3' },
  );
});

test('cached bytes remain replayable even when remote URI is present', () => {
  const source = resolveCachedVoicePlaybackSource({
    audioUri: 'https://dashscope.example/audio.mp3',
    audioBytes: new Uint8Array([1, 3, 5, 7]),
    mimeType: 'audio/mpeg',
  });

  assert.ok(source);
  assert.deepEqual(Array.from(source?.audioBytes || []), [1, 3, 5, 7]);
  assert.equal(source?.audioUri, undefined);
  assert.equal(source?.mimeType, 'audio/mpeg');
});

test('cached file URI is skipped so playback can resynthesize or use bytes', () => {
  const source = resolveCachedVoicePlaybackSource({
    audioUri: 'file:///tmp/local-chat-audio.mp3',
    audioBytes: new Uint8Array([1, 3, 5, 7]),
    mimeType: 'audio/mpeg',
  });

  assert.deepEqual(source, {
    audioBytes: new Uint8Array([1, 3, 5, 7]),
    mimeType: 'audio/mpeg',
  });
});

test('file URI is not persisted as replayable voice cache meta', () => {
  assert.equal(
    createPersistableVoicePlaybackCacheMeta({
      audioUri: 'file:///tmp/local-chat-audio.mp3',
    }),
    null,
  );
});

test('unsupported selected voice falls back to the first model-scoped voice', () => {
  assert.equal(
    resolveSupportedVoiceId({
      selectedVoiceId: 'Nini',
      availableVoiceIds: ['Cherry', 'Serena'],
    }),
    'Cherry',
  );
});

test('selected voice is normalized to the canonical model-scoped voice id case', () => {
  assert.equal(
    resolveSupportedVoiceId({
      selectedVoiceId: 'Arthur',
      availableVoiceIds: ['arthur', 'serena'],
    }),
    'arthur',
  );
});

test('gender guard biases automatic voice selection when no manual voice is pinned', () => {
  assert.equal(
    resolveSupportedVoiceId({
      availableVoiceIds: ['alloy', 'shimmer', 'onyx'],
      genderGuard: 'female',
      voiceAffinity: 'high',
    }),
    'shimmer',
  );
  assert.equal(
    resolveSupportedVoiceId({
      availableVoiceIds: ['alloy', 'shimmer', 'onyx'],
      genderGuard: 'male',
      voiceAffinity: 'high',
    }),
    'onyx',
  );
});
