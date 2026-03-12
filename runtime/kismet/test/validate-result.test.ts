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
