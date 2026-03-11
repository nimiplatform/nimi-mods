import { describe, it, expect } from 'vitest';
import {
  regexPreAnalyze,
  BYPASS_THRESHOLD,
  MIN_SEGMENTS_FOR_BYPASS,
} from '../../src/services/regex-pre-analyzer.js';

describe('regexPreAnalyze', () => {
  // -----------------------------------------------------------------------
  // Basic dialogue detection
  // -----------------------------------------------------------------------

  it('detects dialogue with speaker attribution before quote', () => {
    const text = '叶哲泰站在台上。绍琳说：\u201c这一点你是无法抵赖的！\u201d';
    const result = regexPreAnalyze(text);

    expect(result.segments.length).toBe(2);

    const narration = result.segments[0]!;
    expect(narration.type).toBe('narration');
    expect(narration.speaker).toBe('narrator');
    expect(narration.confidence).toBe('high');

    const dialogue = result.segments[1]!;
    expect(dialogue.type).toBe('dialogue');
    expect(dialogue.speaker).toBe('绍琳');
    expect(dialogue.confidence).toBe('high');
    expect(dialogue.text).toBe('\u201c这一点你是无法抵赖的！\u201d');
  });

  it('detects dialogue with speaker attribution after quote', () => {
    const text = '\u201c这毕竟是目前公认的解释。\u201d叶哲泰说。';
    const result = regexPreAnalyze(text);

    const dialogue = result.segments.find(s => s.type === 'dialogue');
    expect(dialogue).toBeDefined();
    expect(dialogue!.speaker).toBe('叶哲泰');
    expect(dialogue!.confidence).toBe('high');
  });

  it('strips trailing tone modifiers from after-quote speaker attribution', () => {
    const text = '\u201c这毕竟是目前公认的解释。\u201d叶哲泰平静地说。';
    const result = regexPreAnalyze(text);

    const dialogue = result.segments.find(s => s.type === 'dialogue');
    expect(dialogue).toBeDefined();
    expect(dialogue!.speaker).toBe('叶哲泰');
    expect(dialogue!.confidence).toBe('high');
  });

  it('ignores verb complements in after-quote narration like 说完对某人点头', () => {
    const text = '叶哲泰说：“这一点你是无法抵赖的！”说完对绍琳点点头，示意她继续。';
    const result = regexPreAnalyze(text);

    const dialogue = result.segments.find(s => s.type === 'dialogue');
    expect(dialogue).toBeDefined();
    expect(dialogue!.speaker).toBe('叶哲泰');
  });

  it('detects dialogue with 「」 quotes', () => {
    const text = '张三说：\u300c你好啊。\u300d';
    const result = regexPreAnalyze(text);

    const dialogue = result.segments.find(s => s.type === 'dialogue');
    expect(dialogue).toBeDefined();
    expect(dialogue!.speaker).toBe('张三');
    expect(dialogue!.text).toBe('\u300c你好啊。\u300d');
  });

  it('detects dialogue with 『』 quotes', () => {
    const text = '张三说：『你好啊。』';
    const result = regexPreAnalyze(text);

    const dialogue = result.segments.find(s => s.type === 'dialogue');
    expect(dialogue).toBeDefined();
    expect(dialogue!.speaker).toBe('张三');
    expect(dialogue!.text).toBe('『你好啊。』');
  });

  it('detects dialogue with ASCII quotes', () => {
    const text = '张三说: "你好啊。"';
    const result = regexPreAnalyze(text);

    const dialogue = result.segments.find(s => s.type === 'dialogue');
    expect(dialogue).toBeDefined();
    expect(dialogue!.speaker).toBe('张三');
    expect(dialogue!.text).toBe('"你好啊。"');
  });

  it('stops speaker extraction at structural breaks like 对女孩儿点点头', () => {
    const text = '“这给上帝的存在留下了位置。”绍琳对女孩儿点点头提示说。';
    const result = regexPreAnalyze(text);

    const dialogue = result.segments.find(s => s.type === 'dialogue');
    expect(dialogue).toBeDefined();
    expect(dialogue!.speaker).toBe('绍琳');
  });

  it('uses the nearest clause before a speech verb after quote', () => {
    const text = '“上帝是不存在的。”口号平息后，那个小女孩儿大声说。';
    const result = regexPreAnalyze(text);

    const dialogue = result.segments.find(s => s.type === 'dialogue');
    expect(dialogue).toBeDefined();
    expect(dialogue!.speaker).toBe('女孩儿');
  });

  it('strips emotional modifiers from after-quote speaker attribution', () => {
    const text = '“什么……都没有？！”那女孩儿惊恐万状地大叫起来。';
    const result = regexPreAnalyze(text);

    const dialogue = result.segments.find(s => s.type === 'dialogue');
    expect(dialogue).toBeDefined();
    expect(dialogue!.speaker).toBe('女孩儿');
  });

  it('prefers the earliest speech verb when later narration also contains verbs', () => {
    const text = '“什么都没有。”叶哲泰说，像回答任何一个小女孩儿的问题那样，他转头慈祥地看着她。';
    const result = regexPreAnalyze(text);

    const dialogue = result.segments.find(s => s.type === 'dialogue');
    expect(dialogue).toBeDefined();
    expect(dialogue!.speaker).toBe('叶哲泰');
  });

  it('does not steal speaker names from the next quoted sentence', () => {
    const text = '一名男红卫兵喊道：“前一句。” “胡说！”绍琳大叫起来。';
    const result = regexPreAnalyze(text);

    const dialogues = result.segments.filter(s => s.type === 'dialogue');
    expect(dialogues).toHaveLength(2);
    expect(dialogues[0]!.speaker).toBe('一名男红卫兵');
    expect(dialogues[1]!.speaker).toBe('绍琳');
  });

  // -----------------------------------------------------------------------
  // Inner thought detection
  // -----------------------------------------------------------------------

  it('detects inner thought with 心想', () => {
    const text = '李四心想：\u201c这件事不简单。\u201d';
    const result = regexPreAnalyze(text);

    const thought = result.segments.find(s => s.type === 'inner_thought');
    expect(thought).toBeDefined();
    expect(thought!.speaker).toBe('李四');
    expect(thought!.confidence).toBe('high');
  });

  it('detects inner thought with 暗道', () => {
    const text = '王五暗道：\u201c此人武功不弱。\u201d';
    const result = regexPreAnalyze(text);

    const thought = result.segments.find(s => s.type === 'inner_thought');
    expect(thought).toBeDefined();
    expect(thought!.speaker).toBe('王五');
  });

  // -----------------------------------------------------------------------
  // Pure narration
  // -----------------------------------------------------------------------

  it('handles pure narration text (no quotes)', () => {
    const text = '天色渐渐暗了下来。远处传来几声犬吠。山谷中一片寂静。';
    const result = regexPreAnalyze(text);

    expect(result.segments.length).toBe(1);
    expect(result.segments[0]!.type).toBe('narration');
    expect(result.segments[0]!.speaker).toBe('narrator');
    expect(result.segments[0]!.confidence).toBe('high');
    // Pure narration produces only 1 segment → below MIN_SEGMENTS threshold → LLM handles it
    expect(result.canBypassLlm).toBe(false);
  });

  it('treats short unattributed quoted phrases as narration', () => {
    const text = '他们高喊着”红色联合”的口号向前冲去。';
    const result = regexPreAnalyze(text);

    // Narrative quoted phrase merges with surrounding narration into a single segment
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]!.type).toBe('narration');
    expect(result.segments[0]!.speaker).toBe('narrator');
    expect(result.segments[0]!.text).toBe(text);
  });

  // -----------------------------------------------------------------------
  // Mixed dialogue + narration
  // -----------------------------------------------------------------------

  it('splits mixed narration and dialogue correctly', () => {
    const text =
      '叶哲泰站在台上一言不发。' +
      '绍琳说道：\u201c叶哲泰，你认罪吗？\u201d' +
      '叶哲泰沉默不语。' +
      '另一人喊道：\u201c低下头！\u201d';
    const result = regexPreAnalyze(text);

    // Should produce: narration, dialogue, narration, dialogue
    const types = result.segments.map(s => s.type);
    expect(types).toEqual(['narration', 'dialogue', 'narration', 'dialogue']);

    // All should be high confidence
    expect(result.segments.every(s => s.confidence === 'high')).toBe(true);

    // Character names detected
    expect(result.characterNames).toContain('绍琳');

    // Should bypass LLM
    expect(result.canBypassLlm).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Turn-taking heuristic
  // -----------------------------------------------------------------------

  it('uses turn-taking for unattributed dialogue between two speakers', () => {
    const text =
      '张三说：\u201c你好。\u201d' +
      '李四答道：\u201c你好。\u201d' +
      '\u201c今天天气不错。\u201d' + // no attribution → should be 张三 (turn-taking)
      '\u201c是的。\u201d'; // no attribution → should be 李四 (turn-taking)
    const result = regexPreAnalyze(text);

    const dialogues = result.segments.filter(s => s.type === 'dialogue');
    expect(dialogues.length).toBe(4);
    expect(dialogues[0]!.speaker).toBe('张三');
    expect(dialogues[1]!.speaker).toBe('李四');
    expect(dialogues[2]!.speaker).toBe('张三');
    expect(dialogues[2]!.confidence).toBe('medium');
    expect(dialogues[3]!.speaker).toBe('李四');
    expect(dialogues[3]!.confidence).toBe('medium');
  });

  // -----------------------------------------------------------------------
  // Pronoun handling
  // -----------------------------------------------------------------------

  it('marks pronoun-attributed dialogue as low confidence', () => {
    const text = '他说：\u201c走吧。\u201d';
    const result = regexPreAnalyze(text);

    const dialogue = result.segments.find(s => s.type === 'dialogue');
    expect(dialogue).toBeDefined();
    expect(dialogue!.speaker).toBe('他');
    expect(dialogue!.confidence).toBe('low');

    // Pronouns should not appear in characterNames
    expect(result.characterNames).not.toContain('他');
  });

  it('marks pronoun inner thought as low confidence', () => {
    const text = '她心想：\u201c不对劲。\u201d';
    const result = regexPreAnalyze(text);

    const thought = result.segments.find(s => s.type === 'inner_thought');
    expect(thought).toBeDefined();
    expect(thought!.confidence).toBe('low');
  });

  // -----------------------------------------------------------------------
  // Single-char speaker → medium confidence
  // -----------------------------------------------------------------------

  it('marks single-char speaker as medium confidence', () => {
    const text = '平说：\u201c我知道了。\u201d';
    const result = regexPreAnalyze(text);

    const dialogue = result.segments.find(s => s.type === 'dialogue');
    expect(dialogue).toBeDefined();
    expect(dialogue!.speaker).toBe('平');
    expect(dialogue!.confidence).toBe('medium');
  });

  // -----------------------------------------------------------------------
  // Unknown speaker resolution
  // -----------------------------------------------------------------------

  it('resolves unknown speakers to the nearest prior known speaker', () => {
    const text =
      '张三说：\u201c第一句。\u201d' +
      '\u201c第二句。\u201d'; // unknown — only one prior speaker, no turn-taking
    const result = regexPreAnalyze(text);

    const dialogues = result.segments.filter(s => s.type === 'dialogue');
    expect(dialogues.length).toBe(2);
    // Second dialogue has no turn-taking (only 1 distinct speaker),
    // so it starts as 'unknown' and gets resolved to 张三
    expect(dialogues[1]!.speaker).toBe('张三');
  });

  it('resolves unknown speakers to narrator when no prior speaker exists', () => {
    const text = '\u201c独白。\u201d';
    const result = regexPreAnalyze(text);

    expect(result.segments[0]!.speaker).toBe('narrator');
  });

  // -----------------------------------------------------------------------
  // Text offset correctness
  // -----------------------------------------------------------------------

  it('produces segments whose text matches source offsets', () => {
    const text =
      '开头旁白。张三说道：\u201c对话内容。\u201d结尾旁白。';
    const result = regexPreAnalyze(text);

    for (const seg of result.segments) {
      const sliced = text.slice(seg.startOffset, seg.endOffset);
      expect(sliced).toBe(seg.text);
    }
  });

  it('segments cover the chapter text without overlap', () => {
    const text =
      '叶哲泰站在台上。' +
      '绍琳说：\u201c认罪吗？\u201d' +
      '他沉默不语。' +
      '另一人喊道：\u201c低下头！\u201d' +
      '全场鸦雀无声。';
    const result = regexPreAnalyze(text);

    // Verify no overlap and segments are ordered
    for (let i = 1; i < result.segments.length; i++) {
      expect(result.segments[i]!.startOffset).toBeGreaterThanOrEqual(
        result.segments[i - 1]!.endOffset,
      );
    }

    // Verify all segment text matches source slice
    for (const seg of result.segments) {
      expect(text.slice(seg.startOffset, seg.endOffset)).toBe(seg.text);
    }
  });

  // -----------------------------------------------------------------------
  // Bypass threshold
  // -----------------------------------------------------------------------

  it('sets canBypassLlm=true when all segments are high confidence', () => {
    const text =
      '旁白一。张三说：\u201c话一。\u201d' +
      '旁白二。李四说：\u201c话二。\u201d' +
      '旁白三。王五说：\u201c话三。\u201d';
    const result = regexPreAnalyze(text);

    expect(result.stats.totalSegments).toBeGreaterThanOrEqual(MIN_SEGMENTS_FOR_BYPASS);
    expect(result.stats.lowConfidence).toBe(0);
    expect(result.canBypassLlm).toBe(true);
  });

  it('sets canBypassLlm=false when too many low-confidence segments', () => {
    // All dialogue without attribution → all low confidence
    const text =
      '\u201c第一句。\u201d' +
      '\u201c第二句。\u201d' +
      '\u201c第三句。\u201d' +
      '\u201c第四句。\u201d';
    const result = regexPreAnalyze(text);

    expect(result.stats.lowConfidence).toBeGreaterThan(0);
    // ratio of (high+medium)/total should be below threshold
    expect(result.canBypassLlm).toBe(false);
  });

  it('does not bypass for chapters with too few segments', () => {
    const text = '短章节旁白内容。';
    const result = regexPreAnalyze(text);

    expect(result.stats.totalSegments).toBe(1);
    expect(result.stats.totalSegments).toBeLessThan(MIN_SEGMENTS_FOR_BYPASS);
    expect(result.stats.lowConfidence).toBe(0);
    // Too few segments → cannot reliably bypass, let LLM handle it
    expect(result.canBypassLlm).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Character name extraction
  // -----------------------------------------------------------------------

  it('extracts unique character names from dialogue attribution', () => {
    const text =
      '张三说：\u201c你好。\u201d' +
      '李四说：\u201c你好。\u201d' +
      '张三说：\u201c再见。\u201d';
    const result = regexPreAnalyze(text);

    expect(result.characterNames).toEqual(
      expect.arrayContaining(['张三', '李四']),
    );
    expect(result.characterNames.length).toBe(2); // no duplicates
  });

  // -----------------------------------------------------------------------
  // Various speech verbs
  // -----------------------------------------------------------------------

  it('detects various speech verbs', () => {
    const verbs = ['问道', '喊道', '笑道', '怒道', '冷笑道', '叫道'];
    for (const verb of verbs) {
      const text = `某人${verb}：\u201c测试。\u201d`;
      const result = regexPreAnalyze(text);
      const dialogue = result.segments.find(s => s.type === 'dialogue');
      expect(dialogue, `failed for verb: ${verb}`).toBeDefined();
      expect(dialogue!.speaker, `wrong speaker for verb: ${verb}`).toBe('某人');
    }
  });

  it('keeps collective speaker descriptions when directly attributed', () => {
    const text = '一名男红卫兵厉声喝道：\u201c低下头！\u201d';
    const result = regexPreAnalyze(text);

    const dialogue = result.segments.find(s => s.type === 'dialogue');
    expect(dialogue).toBeDefined();
    expect(dialogue!.speaker).toBe('一名男红卫兵');
    expect(dialogue!.confidence).toBe('high');
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  it('handles empty text', () => {
    const result = regexPreAnalyze('');
    expect(result.segments).toEqual([]);
    expect(result.canBypassLlm).toBe(false);
  });

  it('handles whitespace-only text', () => {
    const result = regexPreAnalyze('   \n  \n   ');
    expect(result.segments).toEqual([]);
    expect(result.canBypassLlm).toBe(false);
  });

  it('handles unclosed quote gracefully', () => {
    const text = '张三说：\u201c这句话没有结束';
    const result = regexPreAnalyze(text);

    // Should not crash — treats rest of text as dialogue
    expect(result.segments.length).toBeGreaterThan(0);
    const dialogue = result.segments.find(s => s.type === 'dialogue');
    expect(dialogue).toBeDefined();
  });

  it('handles consecutive dialogues without narration gap', () => {
    const text =
      '张三说：\u201c你好。\u201d\u201c再见。\u201d';
    const result = regexPreAnalyze(text);

    const dialogues = result.segments.filter(s => s.type === 'dialogue');
    expect(dialogues.length).toBe(2);
    expect(dialogues[0]!.speaker).toBe('张三');
  });
});
