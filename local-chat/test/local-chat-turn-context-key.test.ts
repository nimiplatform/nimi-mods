import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLocalChatTurnContextKey,
  buildLocalChatTurnContextSnapshot,
  shouldCancelForTurnContextChange,
} from '../src/hooks/turn-send/context-key.ts';

test('turn context key changes when the same target switches to a different session', () => {
  const first = buildLocalChatTurnContextKey({
    targetId: 'agent-1',
    sessionId: 'session-1',
    routeBinding: {
      source: 'token-api',
      connectorId: 'openai',
      model: 'gpt-5-mini',
    },
  });
  const second = buildLocalChatTurnContextKey({
    targetId: 'agent-1',
    sessionId: 'session-2',
    routeBinding: {
      source: 'local-runtime',
      connectorId: '',
      model: 'qwen2.5-7b',
    },
  });

  assert.notEqual(first, second);
});

test('turn context key keeps the active schedule session during same-target bootstrap alignment', () => {
  const activeSchedule = buildLocalChatTurnContextSnapshot({
    targetId: 'agent-1',
    sessionId: 'session-1',
    routeBinding: null,
  });

  const bootstrapping = buildLocalChatTurnContextKey({
    targetId: 'agent-1',
    sessionId: '',
    routeBinding: null,
    activeSchedule,
  });
  const scheduled = buildLocalChatTurnContextKey({
    targetId: 'agent-1',
    sessionId: 'session-1',
    routeBinding: null,
  });

  assert.equal(bootstrapping, scheduled);
});

test('turn context change does not cancel when active schedule is aligning its own session bootstrap', () => {
  const activeSchedule = buildLocalChatTurnContextSnapshot({
    targetId: 'agent-1',
    sessionId: 'session-1',
    routeBinding: null,
  });

  const shouldCancel = shouldCancelForTurnContextChange({
    previous: buildLocalChatTurnContextSnapshot({
      targetId: 'agent-1',
      sessionId: '',
      routeBinding: null,
    }),
    next: activeSchedule,
    activeSchedule,
  });

  assert.equal(shouldCancel, false);
});

test('turn context change cancels when target switches away from active schedule target', () => {
  const activeSchedule = buildLocalChatTurnContextSnapshot({
    targetId: 'agent-1',
    sessionId: 'session-1',
    routeBinding: null,
  });

  const shouldCancel = shouldCancelForTurnContextChange({
    previous: activeSchedule,
    next: buildLocalChatTurnContextSnapshot({
      targetId: 'agent-2',
      sessionId: 'session-2',
      routeBinding: null,
    }),
    activeSchedule,
  });

  assert.equal(shouldCancel, true);
});

test('turn context change does not cancel when route binding changes on the same target', () => {
  const activeSchedule = buildLocalChatTurnContextSnapshot({
    targetId: 'agent-1',
    sessionId: 'session-1',
    routeBinding: {
      source: 'token-api',
      connectorId: 'openai',
      model: 'gpt-5-mini',
    },
  });

  const shouldCancel = shouldCancelForTurnContextChange({
    previous: activeSchedule,
    next: buildLocalChatTurnContextSnapshot({
      targetId: 'agent-1',
      sessionId: 'session-1',
      routeBinding: {
        source: 'token-api',
        connectorId: 'anthropic',
        model: 'claude-sonnet-4',
      },
    }),
    activeSchedule,
  });

  assert.equal(shouldCancel, false);
});

test('turn context change cancels when the same target switches to a different session', () => {
  const activeSchedule = buildLocalChatTurnContextSnapshot({
    targetId: 'agent-1',
    sessionId: 'session-1',
    routeBinding: null,
  });

  const shouldCancel = shouldCancelForTurnContextChange({
    previous: activeSchedule,
    next: buildLocalChatTurnContextSnapshot({
      targetId: 'agent-1',
      sessionId: 'session-2',
      routeBinding: null,
    }),
    activeSchedule,
  });

  assert.equal(shouldCancel, true);
});
