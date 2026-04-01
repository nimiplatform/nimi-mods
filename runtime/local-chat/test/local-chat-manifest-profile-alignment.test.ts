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
      kind: 'asset',
      capability: 'image',
      assetId: 'local/z_image_turbo',
      assetKind: 'image',
      repo: 'jayn7/Z-Image-Turbo-GGUF',
      engine: 'media',
      title: 'Z-Image Turbo (GGUF)',
      required: true,
      preferred: true,
    });

    const vaeArtifact = profile.entries.find((entry) => entry.entryId === 'local-chat/image-z-image-ae');
    assert.deepEqual(vaeArtifact, {
      entryId: 'local-chat/image-z-image-ae',
      kind: 'asset',
      capability: 'image',
      assetId: 'local/z_image_ae',
      assetKind: 'vae',
      engineSlot: 'vae_path',
      templateId: 'verified.asset.z_image.vae',
      engine: 'media',
      title: 'Z-Image AE VAE',
      required: true,
      preferred: true,
    });

    const llmArtifact = profile.entries.find((entry) => entry.entryId === 'local-chat/image-qwen3-4b-text-encoder');
    assert.deepEqual(llmArtifact, {
      entryId: 'local-chat/image-qwen3-4b-text-encoder',
      kind: 'asset',
      capability: 'image',
      assetId: 'local/qwen3_4b',
      assetKind: 'chat',
      engineSlot: 'llm_path',
      templateId: 'verified.asset.z_image.qwen3_4b',
      engine: 'media',
      title: 'Qwen3 4B Text Encoder',
      required: true,
      preferred: true,
    });
  }
});
