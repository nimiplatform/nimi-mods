import test from 'node:test';
import assert from 'node:assert/strict';
import { parseResultFromText } from '../src/validation/parse-result-json.js';
import { parseImportedResult } from '../src/services/prompt-import.js';
import { buildNatalUserPrompt } from '../src/prompt/user-prompt.js';

test('parseResultFromText accepts plain json object', () => {
  const result = parseResultFromText('{"analysis":{"summary":"ok","personality":"p","industry":"i","fengShui":"f","wealth":"w","marriage":"m","health":"h","family":"fa","crypto":"c","partnerAffinitySummary":"pa","cryptoYear":"2026","cryptoStyle":"steady","scores":{"summary":6,"personality":6,"industry":6,"fengShui":6,"wealth":6,"marriage":6,"health":6,"family":6,"crypto":6}},"keyNodes":[{"age":1,"daYun":"甲子","score":50,"open":49,"close":50,"high":52,"low":47,"tag":"起势"},{"age":12,"daYun":"乙丑","score":52,"open":51,"close":52,"high":55,"low":49,"tag":"积累"},{"age":24,"daYun":"丙寅","score":58,"open":57,"close":58,"high":60,"low":55,"tag":"转折"},{"age":36,"daYun":"丁卯","score":62,"open":61,"close":62,"high":65,"low":59,"tag":"展开"},{"age":97,"daYun":"戊辰","score":60,"open":58,"close":60,"high":63,"low":56,"tag":"收束"}]}');
  assert.equal(result.ok, true);
});

test('parseResultFromText accepts fenced json', () => {
  const result = parseResultFromText([
    '```json',
    '{"analysis":{"summary":"ok","personality":"p","industry":"i","fengShui":"f","wealth":"w","marriage":"m","health":"h","family":"fa","crypto":"c","partnerAffinitySummary":"pa","cryptoYear":"2026","cryptoStyle":"steady","scores":{"summary":6,"personality":6,"industry":6,"fengShui":6,"wealth":6,"marriage":6,"health":6,"family":6,"crypto":6}},"keyNodes":[{"age":1,"daYun":"甲子","score":50,"open":49,"close":50,"high":52,"low":47,"tag":"起势"},{"age":12,"daYun":"乙丑","score":52,"open":51,"close":52,"high":55,"low":49,"tag":"积累"},{"age":24,"daYun":"丙寅","score":58,"open":57,"close":58,"high":60,"low":55,"tag":"转折"},{"age":36,"daYun":"丁卯","score":62,"open":61,"close":62,"high":65,"low":59,"tag":"展开"},{"age":97,"daYun":"戊辰","score":60,"open":58,"close":60,"high":63,"low":56,"tag":"收束"}]}',
    '```',
  ].join('\n'));
  assert.equal(result.ok, true);
});

test('parseResultFromText extracts first balanced json object from prose', () => {
  const result = parseResultFromText([
    '下面是结果，请直接使用：',
    '{"analysis":{"summary":"ok","personality":"p","industry":"i","fengShui":"f","wealth":"w","marriage":"m","health":"h","family":"fa","crypto":"c","partnerAffinitySummary":"pa","cryptoYear":"2026","cryptoStyle":"steady","scores":{"summary":6,"personality":6,"industry":6,"fengShui":6,"wealth":6,"marriage":6,"health":6,"family":6,"crypto":6}},"keyNodes":[{"age":1,"daYun":"甲子","score":50,"open":49,"close":50,"high":52,"low":47,"tag":"起势"},{"age":12,"daYun":"乙丑","score":52,"open":51,"close":52,"high":55,"low":49,"tag":"积累"},{"age":24,"daYun":"丙寅","score":58,"open":57,"close":58,"high":60,"low":55,"tag":"转折"},{"age":36,"daYun":"丁卯","score":62,"open":61,"close":62,"high":65,"low":59,"tag":"展开"},{"age":97,"daYun":"戊辰","score":60,"open":58,"close":60,"high":63,"low":56,"tag":"收束"}]}',
    '以上是结构化结果。',
  ].join('\n'));
  assert.equal(result.ok, true);
});

test('parseResultFromText accepts unclosed fenced json', () => {
  const result = parseResultFromText([
    '```json',
    '{"analysis":{"summary":"ok","personality":"p","industry":"i","fengShui":"f","wealth":"w","marriage":"m","health":"h","family":"fa","crypto":"c","partnerAffinitySummary":"pa","cryptoYear":"2026","cryptoStyle":"steady","scores":{"summary":6,"personality":6,"industry":6,"fengShui":6,"wealth":6,"marriage":6,"health":6,"family":6,"crypto":6}},"keyNodes":[{"age":1,"daYun":"甲子","score":50,"open":49,"close":50,"high":52,"low":47,"tag":"起势"},{"age":12,"daYun":"乙丑","score":52,"open":51,"close":52,"high":55,"low":49,"tag":"积累"},{"age":24,"daYun":"丙寅","score":58,"open":57,"close":58,"high":60,"low":55,"tag":"转折"},{"age":36,"daYun":"丁卯","score":62,"open":61,"close":62,"high":65,"low":59,"tag":"展开"},{"age":97,"daYun":"戊辰","score":60,"open":58,"close":60,"high":63,"low":56,"tag":"收束"}]}',
  ].join('\n'));
  assert.equal(result.ok, true);
});

test('parseResultFromText rejects text without json object', () => {
  const result = parseResultFromText('I cannot comply with this request.');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.reasonCode, 'KISMET_IMPORT_PARSE_FAILED');
    assert.match(result.error.diagnosticPreview || '', /I cannot comply/);
  }
});

test('parseImportedResult rejects natal user prompt payload', () => {
  const result = parseImportedResult('natal-profile', JSON.stringify({
    canonicalProfile: { pillars: {}, dayMaster: {}, fiveElementRatio: {}, favorableElements: [], unfavorableElements: [] },
    locationContext: { birthCity: {}, topCities: [] },
    instructions: {},
  }));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error.message, /User Prompt/);
  }
});

test('buildNatalUserPrompt includes locationContext for natal analysis', () => {
  const prompt = buildNatalUserPrompt({
    canonicalProfile: {
      pillars: { year: '甲子', month: '乙丑', day: '丙寅', hour: '丁卯' },
      zodiac: '鼠',
      dayMaster: { label: '丙火', stem: '丙', element: 'fire', yinYang: 'yang' },
      fiveElementRatio: { metal: 10, wood: 30, water: 20, fire: 25, earth: 15 },
      favorableElements: ['wood'],
      unfavorableElements: ['water'],
      compatibleArchetypes: ['木旺之人'],
      conflictArchetypes: ['水旺之人'],
      startAge: 1,
      firstDaYun: '戊辰',
      bigLuckCycles: ['戊辰'],
    },
    locationContext: {
      birthCity: {
        cityId: 'cn-macau',
        city: 'Macau',
        cityZh: '澳门',
        country: 'China',
        countryZh: '中国',
        lat: 22.2,
        lng: 113.54,
        baseElement: 'water',
        elementWeights: { metal: 10, wood: 10, water: 40, fire: 30, earth: 10 },
        themeColor: '#2F6BFF',
        score: 48,
        reason: '澳门以水为主。',
        relationToDayMaster: 'supports',
        summary: '澳门偏水，对丙火属于drains环境。',
      },
      topCityId: 'cn-beijing',
      topCities: [{
        cityId: 'cn-beijing',
        city: 'Beijing',
        cityZh: '北京',
        country: 'China',
        countryZh: '中国',
        lat: 39.9,
        lng: 116.4,
        baseElement: 'earth',
        elementWeights: { metal: 30, wood: 10, water: 10, fire: 10, earth: 40 },
        themeColor: '#C9A227',
        score: 90,
        reason: '北京以土为主。',
      }],
    },
  });

  const parsed = JSON.parse(prompt) as Record<string, unknown>;
  const locationContext = parsed.locationContext as Record<string, unknown>;

  assert.ok(locationContext);
  assert.equal('topCities' in locationContext, true);
  assert.equal('topCityId' in locationContext, true);
});

test('parseResultFromText accepts json object wrapped in a json string', () => {
  const wrapped = JSON.stringify('{"analysis":{"summary":"ok","personality":"p","industry":"i","fengShui":"f","wealth":"w","marriage":"m","health":"h","family":"fa","crypto":"c","partnerAffinitySummary":"pa","cryptoYear":"2026","cryptoStyle":"steady","scores":{"summary":6,"personality":6,"industry":6,"fengShui":6,"wealth":6,"marriage":6,"health":6,"family":6,"crypto":6}},"keyNodes":[{"age":1,"daYun":"甲子","score":50,"open":49,"close":50,"high":52,"low":47,"tag":"起势"},{"age":12,"daYun":"乙丑","score":52,"open":51,"close":52,"high":55,"low":49,"tag":"积累"},{"age":24,"daYun":"丙寅","score":58,"open":57,"close":58,"high":60,"low":55,"tag":"转折"},{"age":36,"daYun":"丁卯","score":62,"open":61,"close":62,"high":65,"low":59,"tag":"展开"},{"age":97,"daYun":"戊辰","score":60,"open":58,"close":60,"high":63,"low":56,"tag":"收束"}]}');
  const result = parseResultFromText(wrapped);
  assert.equal(result.ok, true);
});

test('parseResultFromText reports truncated json when closing brace is missing', () => {
  const result = parseResultFromText('```json {"analysis":{"summary":"partial"}');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error.message, /可能已被截断/);
    assert.equal(typeof result.error.diagnosticLength, 'number');
  }
});
