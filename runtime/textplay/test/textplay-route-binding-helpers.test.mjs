import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveRouteBindingByConnector,
  deriveRouteBindingByModel,
  deriveRouteBindingBySource,
  isRouteBindingUsable,
  resolveEffectiveRouteBinding,
  toRouteBindingRecord,
} from '../src/hooks/textplay-helpers.ts';

test('textplay route helpers clear stale local metadata when switching to local without models', () => {
  const binding = deriveRouteBindingBySource({
    source: 'local',
    previous: {
      source: 'cloud',
      connectorId: 'gemini',
      model: 'gemini-2.5-pro',
      localModelId: 'stale-local',
      engine: 'ollama',
    },
    options: {
      connectors: [],
      local: { models: [] },
      selected: null,
    },
  });

  assert.deepEqual(binding, {
    source: 'local',
    connectorId: '',
    model: '',
  });
});

test('textplay route helpers clear cloud route when switching to cloud without connectors', () => {
  const binding = deriveRouteBindingBySource({
    source: 'cloud',
    previous: {
      source: 'local',
      connectorId: '',
      model: 'qwen3:4b',
      localModelId: 'qwen3:4b',
      engine: 'ollama',
    },
    options: {
      connectors: [],
      local: { models: [] },
      selected: null,
    },
  });

  assert.deepEqual(binding, {
    source: 'cloud',
    connectorId: '',
    model: '',
  });
});

test('textplay route helpers clear model when connector changes to one without models', () => {
  const binding = deriveRouteBindingByConnector({
    connectorId: 'empty-connector',
    previous: {
      source: 'cloud',
      connectorId: 'gemini',
      model: 'gemini-2.5-pro',
    },
    options: {
      connectors: [{ id: 'empty-connector', label: 'Empty', models: [] }],
      local: { models: [] },
      selected: null,
    },
  });

  assert.deepEqual(binding, {
    source: 'cloud',
    connectorId: 'empty-connector',
    model: '',
  });
});

test('textplay route helpers clear stale local metadata on manual local model edit', () => {
  const binding = deriveRouteBindingByModel({
    model: 'llama3.2:3b',
    previous: {
      source: 'local',
      connectorId: '',
      model: 'qwen3:4b',
      localModelId: 'qwen3:4b',
      engine: 'ollama',
    },
    options: null,
  });

  assert.deepEqual(binding, {
    source: 'local',
    connectorId: '',
    model: 'llama3.2:3b',
  });
});

test('textplay route helpers require connector plus model for cloud bindings', () => {
  assert.equal(isRouteBindingUsable(null), false);
  assert.equal(isRouteBindingUsable({ source: 'local', connectorId: '', model: 'qwen3:4b' }), true);
  assert.equal(
    isRouteBindingUsable({ source: 'cloud', connectorId: '', model: 'gemini-2.5-pro' }),
    false,
  );
  assert.equal(
    isRouteBindingUsable({ source: 'cloud', connectorId: 'gemini', model: 'gemini-2.5-pro' }),
    true,
  );
});

test('textplay route helpers keep explicit unresolved bindings instead of falling back to selected route', () => {
  const explicit = { source: 'cloud', connectorId: '', model: '' };
  const selected = { source: 'cloud', connectorId: 'gemini', model: 'gemini-2.5-pro' };

  assert.deepEqual(
    resolveEffectiveRouteBinding({ binding: explicit, selected }),
    explicit,
  );
  assert.deepEqual(
    resolveEffectiveRouteBinding({ binding: null, selected }),
    selected,
  );
  assert.equal(toRouteBindingRecord(explicit), undefined);
});
