import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveStageMediaPreviewMetrics } from '../src/components/chat-bubbles.tsx';

test('stage media sizing keeps wide images broad but bounded', () => {
  const result = resolveStageMediaPreviewMetrics({
    kind: 'image',
    width: 1600,
    height: 900,
  });

  assert.equal(result.previewWidthPx, 498);
  assert.equal(result.previewHeightPx, 280);
  assert.ok(result.aspectRatio > 1.7);
});

test('stage media sizing keeps portrait images readable without becoming oversized', () => {
  const result = resolveStageMediaPreviewMetrics({
    kind: 'image',
    width: 900,
    height: 1600,
  });

  assert.equal(result.previewWidthPx, 220);
  assert.equal(result.previewHeightPx, 360);
  assert.ok(result.aspectRatio < 0.7);
});

test('stage media sizing falls back to a balanced square preview when dimensions are missing', () => {
  const result = resolveStageMediaPreviewMetrics({
    kind: 'image',
  });

  assert.equal(result.previewWidthPx, 320);
  assert.equal(result.previewHeightPx, 320);
  assert.equal(result.aspectRatio, 1);
});

test('stage media sizing gives pending videos a stable widescreen preview box', () => {
  const result = resolveStageMediaPreviewMetrics({
    kind: 'video-pending',
  });

  assert.equal(result.previewWidthPx, 498);
  assert.equal(result.previewHeightPx, 280);
  assert.ok(result.aspectRatio > 1.7);
});
