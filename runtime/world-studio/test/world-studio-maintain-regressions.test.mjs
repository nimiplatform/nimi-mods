import test from 'node:test';
import assert from 'node:assert/strict';
import { cloneDefaultSnapshot } from '../src/state/workspace/defaults.ts';
import { findLinkedCreatorAgent } from '../src/services/creator-agent-link.ts';
import { syncResourceBindings } from '../src/hooks/actions/maintain/sync-resource-bindings.ts';
import { reloadRemoteForConflict } from '../src/hooks/actions/conflict/reload-remote.ts';

test('findLinkedCreatorAgent prefers stable handle matching before displayName fallback', () => {
  const creatorAgents = [
    {
      id: 'agent-1',
      handle: '~astra_alpha',
      displayName: 'Astra Prime',
      worldId: 'world-1',
    },
    {
      id: 'agent-2',
      handle: '~nova_beta',
      displayName: 'Nova',
      worldId: 'world-1',
    },
  ];

  const linked = findLinkedCreatorAgent({
    creatorAgents,
    draft: { handle: '~astra_alpha' },
    characterName: 'Astra',
    worldId: 'world-1',
  });

  assert.equal(linked?.id, 'agent-1');
});

test('syncResourceBindings publishes world icon/banner and links agent assets by draft handle', async () => {
  const snapshot = cloneDefaultSnapshot();
  snapshot.assets.worldCover.imageUrl = 'https://cdn.example/world-cover.png';
  snapshot.assets.locationImages['Sky Harbor'] = {
    imageUrl: 'https://cdn.example/location.png',
  };
  snapshot.assets.characterPortraits.Astra = {
    imageUrl: 'https://cdn.example/astra.png',
  };
  snapshot.agentSync.draftsByCharacter.Astra = {
    characterName: 'Astra',
    handle: '~astra_alpha',
    concept: '',
    backstory: '',
    coreValues: '',
    relationshipStyle: '',
  };

  const mutationCalls = [];
  const notices = [];
  const banners = [];
  const context = {
    selectedWorldId: 'world-1',
    snapshot,
    patchSnapshot: () => {},
    mutations: {
      syncResourceBindingsMutation: {
        mutateAsync: async (payload) => {
          mutationCalls.push(payload);
          return {};
        },
      },
    },
    queries: {
      resourceBindingsQuery: { refetch: async () => ({}) },
      creatorAgentsQuery: {
        data: [{
          id: 'agent-1',
          handle: '~astra_alpha',
          displayName: 'Astra Prime',
          worldId: 'world-1',
        }],
        refetch: async () => ({ data: [] }),
      },
      selectedAgentQuery: { refetch: async () => ({ data: null }) },
    },
    setStatusBanner: (value) => banners.push(value),
    setNotice: (value) => notices.push(value),
    setError: () => {},
  };

  await syncResourceBindings(context, 'WORLD_ASSETS');
  await syncResourceBindings(context, 'AGENT_ASSETS');

  const upserts = mutationCalls.flatMap((call) => call.bindingUpserts);
  assert.equal(upserts.some((item) => item.slot === 'WORLD_ICON'), true);
  assert.equal(upserts.some((item) => item.slot === 'WORLD_BANNER'), true);
  assert.equal(upserts.some((item) => item.slot === 'WORLD_GALLERY'), true);
  assert.equal(upserts.some((item) => item.slot === 'AGENT_AVATAR' && item.targetId === 'agent-1'), true);
  assert.equal(upserts.some((item) => item.slot === 'AGENT_PORTRAIT' && item.targetId === 'agent-1'), true);
  assert.equal(banners.at(-1)?.kind, 'success');
  assert.equal(typeof notices.at(-1), 'string');
});

test('reloadRemoteForConflict uses creator agent refetch result when restoring selectedAgentId', async () => {
  const snapshot = cloneDefaultSnapshot();
  snapshot.panel.selectedAgentId = '';
  snapshot.knowledgeGraph.events.primary = [];
  snapshot.knowledgeGraph.events.secondary = [];

  let patched = null;
  const context = {
    selectedWorldId: 'world-1',
    snapshot,
    patchSnapshot: (value) => {
      patched = value;
    },
    queries: {
      maintenanceQuery: {
        refetch: async () => ({
          data: {
            world: { id: 'world-1', name: 'World One' },
            worldview: {},
            editorSnapshotVersion: 'snap-2',
          },
        }),
      },
      eventsQuery: {
        refetch: async () => ({ data: [] }),
      },
      lorebooksQuery: {
        refetch: async () => ({ data: { items: [] } }),
      },
      mutationsQuery: {
        refetch: async () => ({ data: [{ id: 'mutation-1' }] }),
      },
      creatorAgentsQuery: {
        refetch: async () => ({
          data: [{
            id: 'agent-1',
            handle: '~astra_alpha',
            displayName: 'Astra Prime',
            worldId: 'world-1',
          }],
        }),
      },
      resourceBindingsQuery: {
        refetch: async () => ({ data: [] }),
      },
    },
    setError: () => {},
    setNotice: () => {},
    setConflictReloadSummary: () => {},
    lastHydratedWorldIdRef: { current: '' },
  };

  await reloadRemoteForConflict(context);

  assert.equal(patched?.panel?.selectedAgentId, 'agent-1');
  assert.match(context.lastHydratedWorldIdRef.current, /^world-1:snap-2:/);
});
