import assert from 'node:assert/strict';
import test from 'node:test';

import { createVoicePlaybackUrl } from '../src/hooks/use-speech-playback.js';

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
