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

const PUBLIC_ALMANAC_CASES = [
  {
    label: '1992-07-16 14:20 Asia/Shanghai',
    input: {
      birthDate: '1992-07-16',
      birthTime: '14:20',
      timezone: 'Asia/Shanghai',
    },
    pillars: {
      year: '壬申',
      month: '丁未',
      day: '癸巳',
      hour: '己未',
    },
  },
  {
    label: '2025-04-02 11:30 Asia/Shanghai',
    input: {
      birthDate: '2025-04-02',
      birthTime: '11:30',
      timezone: 'Asia/Shanghai',
    },
    pillars: {
      year: '乙巳',
      month: '己卯',
      day: '辛丑',
      hour: '甲午',
    },
  },
] as const;

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

test('public almanac reference cases stay aligned for all four pillars', () => {
  for (const example of PUBLIC_ALMANAC_CASES) {
    const profile = deriveCanonicalProfile({
      ...INPUT,
      ...example.input,
    });
    assert.deepEqual(profile.pillars, example.pillars, example.label);
  }
});

test('year and month pillars switch at LiChun instead of a fixed civil date', () => {
  const beforeLiChun = deriveCanonicalProfile({
    ...INPUT,
    birthDate: '2026-02-03',
    birthTime: '12:00',
    timezone: 'Asia/Shanghai',
  });
  const afterLiChun = deriveCanonicalProfile({
    ...INPUT,
    birthDate: '2026-02-04',
    birthTime: '12:00',
    timezone: 'Asia/Shanghai',
  });

  assert.equal(beforeLiChun.pillars.year, '乙巳');
  assert.equal(beforeLiChun.pillars.month, '己丑');
  assert.equal(afterLiChun.pillars.year, '丙午');
  assert.equal(afterLiChun.pillars.month, '庚寅');
});

test('timezone-aware LiChun boundaries change pillars once the local birth time crosses the term instant', () => {
  const shanghai = deriveCanonicalProfile({
    ...INPUT,
    birthDate: '2026-02-03',
    birthTime: '12:00',
    timezone: 'Asia/Shanghai',
  });
  const newYork = deriveCanonicalProfile({
    ...INPUT,
    birthDate: '2026-02-03',
    birthTime: '15:00',
    timezone: 'America/New_York',
  });

  assert.equal(shanghai.pillars.year, '乙巳');
  assert.equal(shanghai.pillars.month, '己丑');
  assert.equal(newYork.pillars.year, '丙午');
  assert.equal(newYork.pillars.month, '庚寅');
});

test('zi hour advances the day pillar after 23:00 local time', () => {
  const earlyZi = deriveCanonicalProfile({
    ...INPUT,
    birthDate: '2026-02-03',
    birthTime: '00:30',
    timezone: 'Asia/Shanghai',
  });
  const lateZi = deriveCanonicalProfile({
    ...INPUT,
    birthDate: '2026-02-03',
    birthTime: '23:30',
    timezone: 'Asia/Shanghai',
  });

  assert.equal(earlyZi.pillars.day, '戊申');
  assert.equal(earlyZi.pillars.hour, '壬子');
  assert.equal(lateZi.pillars.day, '己酉');
  assert.equal(lateZi.pillars.hour, '甲子');
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
