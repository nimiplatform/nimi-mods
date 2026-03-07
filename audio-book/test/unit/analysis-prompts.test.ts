import { describe, expect, it } from 'vitest';
import { buildAccumulatedContext, buildAnalysisSystemPrompt } from '../../src/services/analysis-prompts.js';
import type { CharacterProfile, ScriptSegment } from '../../src/types.js';

function createCharacter(index: number): CharacterProfile {
  return {
    name: `Character-${index}`,
    gender: index % 2 === 0 ? 'female' : 'male',
    ageGroup: 'adult',
    traits: ['smart', 'loyal', 'brave', 'funny'],
    segmentCount: 100 - index,
    tier: index < 5 ? 'major' : 'minor',
  };
}

describe('analysis-prompts', () => {
  it('keeps accumulated context compact and prioritizes recent speakers', () => {
    const narrator: CharacterProfile = {
      name: 'narrator',
      gender: 'neutral',
      ageGroup: 'adult',
      traits: [],
      segmentCount: 999,
      tier: 'major',
    };
    const characters: CharacterProfile[] = [
      narrator,
      ...Array.from({ length: 30 }, (_, index) => createCharacter(index)),
    ];
    const recentSegments: ScriptSegment[] = [
      {
        id: 'seg-1',
        chapterIndex: 0,
        index: 0,
        type: 'dialogue',
        speaker: 'Character-29',
        text: '这是一段很长的台词，用来验证最近说话角色会被优先放进上下文，同时预览内容会被截断。'.repeat(3),
        startOffset: 0,
        endOffset: 10,
      },
    ];

    const context = buildAccumulatedContext(characters, recentSegments);

    expect(context).toContain('## Known Characters');
    expect(context).toContain('Character-29');
    expect(context).toContain('minor characters omitted for brevity');
    expect(context).not.toContain('narrator (');
    expect(context).not.toContain('funny');
  });

  it('demands a single JSON object with no markdown wrapper', () => {
    const prompt = buildAnalysisSystemPrompt();

    expect(prompt).toContain('Return exactly one JSON object and nothing else.');
    expect(prompt).toContain('Do not use markdown fences.');
    expect(prompt).toContain('"segments": [');
  });
});
