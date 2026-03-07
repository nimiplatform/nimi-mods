import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveCanonicalProfile } from '../src/services/bazi/derive-profile.js';
import { CITY_CATALOG } from '../src/data/city-catalog.js';
import { buildLocationContext } from '../src/services/city-affinity.js';
import { buildDailyDefaults, deriveTodayGanzhi } from '../src/services/daily-context.js';
import { createLocalShareProfile } from '../src/services/local-share-profiles.js';

const INPUT = {
  name: 'Casey',
  gender: 'female' as const,
  birthDate: '1992-07-16',
  birthTime: '14:20',
  birthPlaceId: 'cn-shanghai',
  birthPlaceLabel: '上海',
  timezone: 'Asia/Shanghai',
  consent: {
    allowCityAffinityUse: true,
    allowLocalProfilePersist: true,
    allowLocalProfileMatchUse: true,
  },
};

test('canonical profile derivation is deterministic and sums five elements to 100', () => {
  const left = deriveCanonicalProfile(INPUT);
  const right = deriveCanonicalProfile(INPUT);

  assert.deepEqual(left, right);
  assert.equal(
    left.fiveElementRatio.metal
      + left.fiveElementRatio.wood
      + left.fiveElementRatio.water
      + left.fiveElementRatio.fire
      + left.fiveElementRatio.earth,
    100,
  );
});

test('city catalog weights sum to 100 and location context is deterministic', () => {
  assert.ok(CITY_CATALOG.length >= 80);
  assert.ok(CITY_CATALOG.filter((city) => city.tier === 'cn-major').length >= 30);
  for (const city of CITY_CATALOG) {
    const total = city.elementWeights.metal
      + city.elementWeights.wood
      + city.elementWeights.water
      + city.elementWeights.fire
      + city.elementWeights.earth;
    assert.equal(total, 100);
    const maxWeight = Math.max(...Object.values(city.elementWeights));
    assert.equal(city.elementWeights[city.baseElement], maxWeight);
  }

  const profile = deriveCanonicalProfile(INPUT);
  const left = buildLocationContext({
    profile,
    birthPlaceId: INPUT.birthPlaceId,
    birthPlaceLabel: INPUT.birthPlaceLabel,
  });
  const right = buildLocationContext({
    profile,
    birthPlaceId: INPUT.birthPlaceId,
    birthPlaceLabel: INPUT.birthPlaceLabel,
  });

  assert.equal(left.ok, true);
  assert.deepEqual(left, right);
});

test('daily defaults and today ganzhi are stable for fixed date', () => {
  const profile = deriveCanonicalProfile(INPUT);
  const defaults = buildDailyDefaults(profile, 'Asia/Shanghai', new Date('2026-03-06T10:00:00Z'));
  assert.equal(defaults.date, '2026-03-06');
  assert.equal(defaults.todayGanZhi, deriveTodayGanzhi('2026-03-06'));
  assert.equal(defaults.luckyElements.length, 2);
});

test('local share profile excludes raw birth input fields', () => {
  const profile = deriveCanonicalProfile(INPUT);
  const shareProfile = createLocalShareProfile('Casey', profile);
  const serialized = JSON.stringify(shareProfile);

  assert.match(serialized, /fiveElementRatio/);
  assert.doesNotMatch(serialized, /birthTime/);
  assert.doesNotMatch(serialized, /birthPlaceLabel/);
  assert.doesNotMatch(serialized, /pillars/);
});
