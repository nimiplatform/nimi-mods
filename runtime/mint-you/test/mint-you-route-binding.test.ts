import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeMintYouRouteBinding } from '../src/route-binding.js';
import { type RuntimeRouteOptionsSnapshot } from "@nimiplatform/sdk/mod";
function createRouteOptions(): RuntimeRouteOptionsSnapshot {
    return {
        capability: 'text.generate',
        selected: {
            source: 'cloud',
            connectorId: 'cloud-primary',
            model: 'gpt-4o-mini',
        },
        resolvedDefault: {
            source: 'cloud',
            connectorId: 'cloud-primary',
            model: 'gpt-4o-mini',
        },
        local: {
            models: [
                {
                    localModelId: 'ollama-llama3',
                    model: 'llama3.2:latest',
                    engine: 'ollama',
                },
            ],
        },
        connectors: [
            {
                id: 'cloud-primary',
                label: 'Primary',
                models: ['gpt-4o-mini', 'gpt-4.1-mini'],
            },
            {
                id: 'cloud-secondary',
                label: 'Secondary',
                models: ['claude-3-7-sonnet'],
            },
        ],
    };
}
test('sanitizeMintYouRouteBinding falls back to the first advertised local model', () => {
    const sanitized = sanitizeMintYouRouteBinding({
        source: 'local',
        connectorId: '',
        model: 'removed-local-model',
    }, createRouteOptions());
    assert.deepEqual(sanitized, {
        source: 'local',
        connectorId: '',
        model: 'llama3.2:latest',
        localModelId: 'ollama-llama3',
        engine: 'ollama',
    });
});
test('sanitizeMintYouRouteBinding repairs a removed cloud connector', () => {
    const sanitized = sanitizeMintYouRouteBinding({
        source: 'cloud',
        connectorId: 'removed-connector',
        model: 'missing-model',
    }, createRouteOptions());
    assert.deepEqual(sanitized, {
        source: 'cloud',
        connectorId: 'cloud-primary',
        model: 'gpt-4o-mini',
    });
});
test('sanitizeMintYouRouteBinding repairs a removed cloud model on an existing connector', () => {
    const sanitized = sanitizeMintYouRouteBinding({
        source: 'cloud',
        connectorId: 'cloud-secondary',
        model: 'retired-model',
    }, createRouteOptions());
    assert.deepEqual(sanitized, {
        source: 'cloud',
        connectorId: 'cloud-secondary',
        model: 'claude-3-7-sonnet',
    });
});
test('sanitizeMintYouRouteBinding clears unusable overrides with no advertised fallback', () => {
    const sanitized = sanitizeMintYouRouteBinding({
        source: 'cloud',
        connectorId: 'empty-connector',
        model: 'missing-model',
    }, {
        capability: 'text.generate',
        selected: {
            source: 'local',
            connectorId: '',
            model: 'llama3.2:latest',
        },
        local: {
            models: [],
        },
        connectors: [
            {
                id: 'empty-connector',
                label: 'Empty',
                models: [],
            },
        ],
    });
    assert.equal(sanitized, null);
});
