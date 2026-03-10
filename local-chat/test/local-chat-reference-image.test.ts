import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readLocalChatReferenceImageUrl,
  resolveLocalChatTargetReferenceImageUrl,
} from '../src/data/index.ts';

test('readLocalChatReferenceImageUrl reads explicit reference image paths', () => {
  assert.equal(
    readLocalChatReferenceImageUrl({
      referenceImageUrl: 'https://example.com/direct-reference.png',
    }),
    'https://example.com/direct-reference.png',
  );

  assert.equal(
    readLocalChatReferenceImageUrl({
      agentProfile: {
        referenceImageUrl: 'https://example.com/profile-reference.png',
      },
    }),
    'https://example.com/profile-reference.png',
  );

  assert.equal(
    readLocalChatReferenceImageUrl({
      payload: {
        referenceImageUrl: 'https://example.com/payload-reference.png',
      },
    }),
    'https://example.com/payload-reference.png',
  );

  assert.equal(
    resolveLocalChatTargetReferenceImageUrl({
      referenceImageUrl: null,
      agentProfile: {},
      payload: {
        agentProfile: {
          referenceImageUrl: 'https://example.com/payload-profile-reference.png',
        },
      },
    }),
    'https://example.com/payload-profile-reference.png',
  );
});

test('readLocalChatReferenceImageUrl ignores unrelated nested entities', () => {
  assert.equal(
    readLocalChatReferenceImageUrl({
      payload: {
        unrelatedEntity: {
          referenceImageUrl: 'https://example.com/unrelated-reference.png',
        },
      },
    }),
    null,
  );
});
