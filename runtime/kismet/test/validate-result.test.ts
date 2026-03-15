import test from 'node:test';
import assert from 'node:assert/strict';
import { validateNatalAiOutput } from '../src/validation/validate-result.js';

test('validateNatalAiOutput backfills missing nested analysis fields instead of failing hard', () => {
  const result = validateNatalAiOutput({
    analysis: {
      summary: '命局中和，行止宜稳。',
      personality: '性情沉静，遇事有度。',
      industry: '事业渐进，利于守成。',
      fengShui: '宅气宜静，忌近燥火。',
      wealth: '财势可守，不宜急逐。',
      marriage: '情缘宜缓，重在相敬。',
      health: '身元平稳，慎防劳神。',
      family: '家宅安宁，长幼有序。',
      crypto: '虚财多险，宜轻仓试水。',
      partnerAffinitySummary: '同气相求，可久可安。',
      cryptoYear: '流年虚财偏震荡。',
      cryptoStyle: '短线宜慎。',
    },
    keyNodes: [
      { age: 1, daYun: '甲子', score: 58, open: 52, close: 58, high: 61, low: 49, tag: '初运' },
      { age: 21, daYun: '乙丑', score: 63, open: 60, close: 63, high: 68, low: 57, tag: '起势' },
      { age: 41, daYun: '丙寅', score: 71, open: 66, close: 71, high: 75, low: 64, tag: '得时' },
      { age: 71, daYun: '丁卯', score: 62, open: 59, close: 62, high: 66, low: 56, tag: '守成' },
      { age: 95, daYun: '戊辰', score: 55, open: 53, close: 55, high: 58, low: 50, tag: '晚景' },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.data.analysis.scores.summary >= 0, true);
  assert.equal(result.data.analysis.scores.crypto <= 10, true);
  assert.equal(result.data.analysis.tags.summary.length > 0, true);
  assert.equal(result.data.analysis.tags.crypto.length > 0, true);
  assert.equal(result.data.analysis.zodiacYearFortune.year.length > 0, true);
  assert.equal(result.data.analysis.zodiacYearFortune.zodiac.length > 0, true);
  assert.deepEqual(result.data.recommendedCities, []);
  assert.equal(result.data.citySummary, '');
});

test('validateNatalAiOutput repairs unordered keyNodes and fixes invalid high/low bounds', () => {
  const result = validateNatalAiOutput({
    analysis: {
      summary: '命局中和，行止宜稳。',
      personality: '性情沉静，遇事有度。',
      industry: '事业渐进，利于守成。',
      fengShui: '宅气宜静，忌近燥火。',
      wealth: '财势可守，不宜急逐。',
      marriage: '情缘宜缓，重在相敬。',
      health: '身元平稳，慎防劳神。',
      family: '家宅安宁，长幼有序。',
      crypto: '虚财多险，宜轻仓试水。',
      partnerAffinitySummary: '同气相求，可久可安。',
      cryptoYear: '流年虚财偏震荡。',
      cryptoStyle: '短线宜慎。',
    },
    keyNodes: [
      { age: 36, daYun: '丙寅', score: 74, open: 72, close: 75, high: 68, low: 73, tag: '腾跃' },
      { age: 12, daYun: '甲子', score: 58, open: 55, close: 58, high: 60, low: 52, tag: '启运' },
      { age: 12, daYun: '乙丑', score: 62, open: 60, close: 61, high: 63, low: 58, tag: '重复' },
      { age: 78, daYun: '丁卯', score: 54, open: 52, close: 54, high: 56, low: 50, tag: '守成' },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.data.keyNodes[0]?.age, 1);
  assert.equal(result.data.keyNodes.at(-1)?.age >= 95, true);
  assert.equal(result.data.keyNodes.length >= 5, true);

  for (let index = 0; index < result.data.keyNodes.length; index += 1) {
    const node = result.data.keyNodes[index]!;
    assert.equal(node.high >= Math.max(node.open, node.close), true);
    assert.equal(node.low <= Math.min(node.open, node.close), true);
    if (index > 0) {
      assert.equal(node.age > result.data.keyNodes[index - 1]!.age, true);
    }
  }
});

test('validateNatalAiOutput extends terminal key node coverage to age 95+', () => {
  const result = validateNatalAiOutput({
    analysis: {
      summary: '命局偏稳，晚景宜守成。',
      personality: '性情谨厚，重诺轻言。',
      industry: '事业以积累见长。',
      fengShui: '宜向阳纳气，忌湿寒。',
      wealth: '财势稳中有升。',
      marriage: '情缘重在陪伴。',
      health: '脾胃需调，作息宜定。',
      family: '家宅以和为贵。',
      crypto: '虚财不宜恋战。',
      partnerAffinitySummary: '相处宜温言笃行。',
      cryptoYear: '流年虚财宜收敛。',
      cryptoStyle: '守正轻仓。',
    },
    keyNodes: [
      { age: 1, daYun: '甲子', score: 52, open: 50, close: 52, high: 55, low: 48, tag: '初运' },
      { age: 24, daYun: '乙丑', score: 60, open: 58, close: 60, high: 63, low: 55, tag: '起势' },
      { age: 47, daYun: '丙寅', score: 66, open: 63, close: 66, high: 70, low: 61, tag: '得时' },
      { age: 72, daYun: '丁卯', score: 57, open: 55, close: 57, high: 60, low: 52, tag: '平守' },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.data.keyNodes.at(-1)?.age >= 95, true);
  assert.equal(result.data.keyNodes.at(-1)?.daYun.length > 0, true);
  assert.equal(result.data.keyNodes.at(-1)?.tag.length > 0, true);
});
