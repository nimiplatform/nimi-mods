import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveRuntimeSidebarDependencyOverview } from '../src/services/runtime/runtime-sidebar-overview.ts';

test('runtime sidebar overview keeps unresolved media capabilities in unknown state', () => {
  const result = resolveRuntimeSidebarDependencyOverview({
    isVoiceEnabled: false,
    mediaPlannerEnabled: true,
    isLocalSnapshotFailure: false,
    dependencySnapshotStatus: 'ready',
    dependencyRepairActionCount: 0,
    chatCapabilityMatched: true,
    chatCapabilityResolved: true,
    ttsCapabilityMatched: false,
    ttsCapabilityResolved: true,
    sttCapabilityMatched: false,
    sttCapabilityResolved: true,
    imageCapabilityMatched: false,
    imageCapabilityResolved: false,
    videoCapabilityMatched: false,
    videoCapabilityResolved: false,
  });

  assert.equal(result.dependencyStatus, 'unknown');
  assert.equal(result.dependencyReasonCode, undefined);
  assert.deepEqual(result.dependencyCapabilities, [
    { capability: 'chat', matched: true, required: true, resolved: true },
    { capability: 'tts', matched: false, required: false, resolved: true },
    { capability: 'stt', matched: false, required: false, resolved: true },
    { capability: 'image', matched: false, required: true, resolved: false },
    { capability: 'video', matched: false, required: true, resolved: false },
  ]);
});

test('runtime sidebar overview reports missing once required media capabilities are resolved and unmatched', () => {
  const result = resolveRuntimeSidebarDependencyOverview({
    isVoiceEnabled: false,
    mediaPlannerEnabled: true,
    isLocalSnapshotFailure: false,
    dependencySnapshotStatus: 'ready',
    imageDependencyStatus: 'missing',
    videoDependencyStatus: 'ready',
    imageDependencyReasonCode: 'LOCAL_AI_DEPENDENCY_SNAPSHOT_FAILED',
    dependencyRepairActionCount: 1,
    chatCapabilityMatched: true,
    chatCapabilityResolved: true,
    ttsCapabilityMatched: false,
    ttsCapabilityResolved: true,
    sttCapabilityMatched: false,
    sttCapabilityResolved: true,
    imageCapabilityMatched: false,
    imageCapabilityResolved: true,
    videoCapabilityMatched: true,
    videoCapabilityResolved: true,
  });

  assert.equal(result.dependencyStatus, 'missing');
  assert.equal(result.dependencyReasonCode, 'LOCAL_AI_DEPENDENCY_SNAPSHOT_FAILED');
});
