import assert from 'node:assert/strict';
import test from 'node:test';

import { LOCAL_CHAT_MANIFEST } from '../src/manifest.js';

function findProfile(profileId: string) {
  return LOCAL_CHAT_MANIFEST.ai.profiles.find((profile) => profile.id === profileId);
}

test('local-chat manifest profiles align local image stack with canonical local inventory ids', () => {
  for (const profileId of ['local-chat-default', 'local-chat-compact']) {
    const profile = findProfile(profileId);
    assert.ok(profile, `missing profile ${profileId}`);

    const imageModel = profile.entries.find((entry) => entry.entryId === 'local-chat/image-z-image-turbo');
    assert.deepEqual(imageModel, {
      entryId: 'local-chat/image-z-image-turbo',
      kind: 'model',
      capability: 'image',
      modelId: 'local/z_image_turbo',
      repo: 'jayn7/Z-Image-Turbo-GGUF',
      engine: 'media',
      title: 'Z-Image Turbo (GGUF)',
      required: true,
      preferred: true,
    });

    const vaeArtifact = profile.entries.find((entry) => entry.entryId === 'local-chat/image-z-image-ae');
    assert.deepEqual(vaeArtifact, {
      entryId: 'local-chat/image-z-image-ae',
      kind: 'artifact',
      capability: 'image',
      artifactId: 'local/z_image_ae',
      artifactKind: 'vae',
      templateId: 'verified.artifact.z_image.vae',
      engine: 'media',
      title: 'Z-Image AE VAE',
      required: true,
      preferred: true,
    });

    const llmArtifact = profile.entries.find((entry) => entry.entryId === 'local-chat/image-qwen3-4b-companion');
    assert.deepEqual(llmArtifact, {
      entryId: 'local-chat/image-qwen3-4b-companion',
      kind: 'artifact',
      capability: 'image',
      artifactId: 'local/qwen3_4b_companion',
      artifactKind: 'llm',
      templateId: 'verified.artifact.z_image.qwen3_4b',
      engine: 'media',
      title: 'Qwen3 4B Companion LLM',
      required: true,
      preferred: true,
    });
  }
});
