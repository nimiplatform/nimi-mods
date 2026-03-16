import test from 'node:test';
import assert from 'node:assert/strict';
import { listEntryAgentOptions } from '../src/data/creator-agents.ts';
import { listMyWorlds } from '../src/data/world-catalog.ts';
import {
  normalizeTextplayLanguage,
  normalizeTextplayRenderLocale,
  resolveTextplayStoryLanguage,
} from '../src/language.ts';

test('language helpers normalize supported zh and en variants', () => {
  assert.equal(normalizeTextplayLanguage('zh-CN'), 'zh');
  assert.equal(normalizeTextplayLanguage('中文'), 'zh');
  assert.equal(normalizeTextplayLanguage('en-US'), 'en');
  assert.equal(normalizeTextplayLanguage('English'), 'en');
  assert.equal(normalizeTextplayLanguage('jp'), null);
  assert.equal(normalizeTextplayRenderLocale('fr-FR'), 'en');
});

test('story language resolution prefers world primary language over agent and prompt language', () => {
  assert.equal(resolveTextplayStoryLanguage({
    worldPrimaryLanguage: 'zh',
    agentLanguage: 'en',
    promptLanguage: 'en',
  }), 'zh');

  assert.equal(resolveTextplayStoryLanguage({
    worldPrimaryLanguage: null,
    agentLanguage: 'en',
    promptLanguage: 'zh',
  }), 'en');

  assert.equal(resolveTextplayStoryLanguage({
    worldPrimaryLanguage: null,
    agentLanguage: null,
    promptLanguage: 'zh',
  }), 'zh');
});

test('world catalog extracts primary and common languages from worlds.mine payload', async () => {
  const worlds = await listMyWorlds({
    hookClient: {
      data: {
        query: async () => ({
          items: [
            {
              id: 'world-1',
              name: 'Harbor',
              updatedAt: '2026-03-16T10:00:00.000Z',
              languages: {
                primary: '中文',
                common: ['English', 'zh-CN', 'jp'],
              },
            },
          ],
        }),
      },
    },
  });

  assert.equal(worlds[0]?.primaryLanguage, 'zh');
  assert.deepEqual(worlds[0]?.commonLanguages, ['en', 'zh']);
});

test('agent option extraction falls back through configured language fields', async () => {
  const options = await listEntryAgentOptions({
    hookClient: {
      data: {
        query: async () => ([
          {
            id: 'agent-1',
            name: 'Harbor Agent',
            voice: { language: 'English' },
          },
          {
            id: 'agent-2',
            displayName: 'Dock Watcher',
            agentProfile: {
              voice: { language: '中文' },
            },
          },
        ]),
      },
    },
    characterRefs: ['agent-1', 'agent-2'],
  });

  assert.equal(options[0]?.agentLanguage, 'en');
  assert.equal(options[1]?.agentLanguage, 'zh');
});
