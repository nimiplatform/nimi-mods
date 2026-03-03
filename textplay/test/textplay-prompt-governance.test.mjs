import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTextplayPrompt } from '../src/pipeline/build-prompt.ts';

test('textplay prompt includes explicit anti-cliche bans and replacement examples', () => {
  const prompt = buildTextplayPrompt({
    normalized: {
      storyId: 'story-1',
      turnId: 'turn-1',
      triggerSource: 'UserTurn',
      userMessage: '我先靠近城门再观察。',
      playerId: 'player-1',
      playerName: '韩云',
      playerIdentity: '',
      sceneSummary: '夜色下的城门，火把摇晃。',
      agentSummary: '守城修士目光冷静，正在巡查。',
      worldStyleSummary: '仙侠写实风，强调感官与行动反馈。',
      systemPayload: {},
    },
    visibleEvents: [
      {
        eventId: 'evt-1',
        visibility: 'public',
        content: '风从城墙豁口灌入，旗角噼啪作响。',
        payload: {},
      },
    ],
  });

  assert.match(prompt, /Banned cliché phrases \(never use verbatim\)/i);
  assert.match(prompt, /双目微眯/);
  assert.match(prompt, /Replacement style examples/i);
  assert.match(prompt, /瞳孔骤然收缩成一线/);
});

test('textplay opening prompt enforces pre-event no-spoiler constraints', () => {
  const prompt = buildTextplayPrompt({
    normalized: {
      storyId: 'story-1',
      turnId: 'turn-start',
      triggerSource: 'SystemEvent',
      userMessage: '',
      playerId: 'player-1',
      playerName: '韩云',
      playerIdentity: '灵界散修',
      sceneSummary: '天幕裂开，灵潮翻涌。',
      agentSummary: '韩立在阵眼旁稳住气息。',
      worldStyleSummary: '仙侠写实风，强调感官与行动反馈。',
      systemPayload: {
        opening: {
          mode: 'story-start',
          noSpoiler: true,
          instruction: '禁止剧透并保持事件前态。',
        },
      },
    },
    visibleEvents: [
      {
        eventId: 'evt-1',
        visibility: 'public',
        content: '高空传来沉闷雷鸣，阵纹明灭不定。',
        payload: {},
      },
    ],
  });

  assert.match(prompt, /Opening mode: this is the pre-event threshold/i);
  assert.match(prompt, /with no future spoilers/i);
  assert.match(prompt, /Non-user trigger: focus on world\/NPC-driven development/i);
});
