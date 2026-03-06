import test from 'node:test';
import assert from 'node:assert/strict';
import { processMediaMarkerOverrides } from '../src/hooks/turn-send/media-marker-override.ts';

test('media marker override extracts marker candidates and strips marker text from delivery', () => {
  const result = processMediaMarkerOverrides({
    deliveries: [{
      id: 'delivery-1',
      kind: 'text',
      content: '给你一张图。[[IMG:暖色灯光下的电影感人像]]',
      delayMs: 0,
      meta: {},
    }],
    userText: '来点氛围感',
    turnTxnId: 'txn-marker-strip',
  });

  assert.equal(result.deliveries.length, 1);
  assert.equal(result.deliveries[0]?.content, '给你一张图。');
  assert.equal(result.markerOverrideCandidates.length, 1);
  assert.equal(result.markerOverrideCandidates[0]?.type, 'image');
  assert.equal(result.markerOverrideCandidates[0]?.source, 'tag');
  assert.equal(result.visibleText, '给你一张图。');
});

test('media marker override removes filler-only delivery when marker is the only meaningful content', () => {
  const result = processMediaMarkerOverrides({
    deliveries: [{
      id: 'delivery-2',
      kind: 'text',
      content: '... [[VID:霓虹城市上空缓慢推进的镜头]]',
      delayMs: 800,
      meta: {},
    }],
    userText: '来段视频',
    turnTxnId: 'txn-marker-filler',
  });

  assert.equal(result.deliveries.length, 0);
  assert.equal(result.markerOverrideCandidates.length, 1);
  assert.equal(result.markerOverrideCandidates[0]?.type, 'video');
  assert.equal(result.visibleText, '');
});

test('media marker override keeps non-marker voice deliveries untouched', () => {
  const result = processMediaMarkerOverrides({
    deliveries: [{
      id: 'delivery-3',
      kind: 'voice',
      content: '这段我想认真地说给你听。',
      delayMs: 1200,
      meta: {
        autoPlayVoice: true,
      },
    }],
    userText: '继续说',
    turnTxnId: 'txn-marker-voice',
  });

  assert.equal(result.deliveries.length, 1);
  assert.equal(result.deliveries[0]?.kind, 'voice');
  assert.equal(result.deliveries[0]?.content, '这段我想认真地说给你听。');
  assert.equal(result.markerOverrideCandidates.length, 0);
  assert.equal(result.voiceSegments, 1);
});
