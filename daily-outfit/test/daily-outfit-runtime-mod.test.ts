import test from 'node:test';
import assert from 'node:assert/strict';
import { DAILY_OUTFIT_CAPABILITIES, DAILY_OUTFIT_MOD_ID } from '../src/contracts.js';
import { DAILY_OUTFIT_MANIFEST } from '../src/manifest.js';
import { createDailyOutfitRuntimeMod, validateDailyOutfitManifest } from '../src/index.js';
import {
  createGarment,
  createWearLog,
  generateOutfitSuggestions,
  queryInsights,
  readProfile,
  resetDailyOutfitStore,
  toggleFavoriteOutfit,
  writeProfile,
} from '../src/state/store.js';

test('daily-outfit manifest stays aligned with contract capabilities', () => {
  assert.equal(DAILY_OUTFIT_MANIFEST.id, DAILY_OUTFIT_MOD_ID);
  assert.deepEqual(DAILY_OUTFIT_MANIFEST.capabilities, [...DAILY_OUTFIT_CAPABILITIES]);
  assert.equal(validateDailyOutfitManifest().valid, true);
});

test('daily-outfit wear log updates garment stats and profile scene frequencies', () => {
  resetDailyOutfitStore();
  const garment = createGarment({
    photoUrls: ['local://shirt-front'],
    category: 'top',
    subcategory: 'shirt',
    colors: ['white'],
    styleTags: ['minimal'],
    seasons: ['spring'],
    formalityLevel: 3,
  });
  writeProfile({
    id: 'profile-1',
    gender: 'female',
    ageGroup: '25-30',
    styleWeights: { minimal: 0.4 },
    sceneFrequencies: {},
  });

  const wearLog = createWearLog({
    itemIds: [garment.id],
    date: '2026-03-11',
    occasion: 'office',
    notes: 'client meeting',
  });

  assert.equal(wearLog.itemIds.length, 1);
  const insights = queryInsights();
  assert.equal(insights.activeGarmentCount, 1);
  assert.equal(insights.wearLogCount, 1);
  assert.equal(readProfile()?.sceneFrequencies.office, 0.1);
});

test('daily-outfit runtime mod exposes the registered capabilities', () => {
  const mod = createDailyOutfitRuntimeMod();
  assert.equal(mod.modId, DAILY_OUTFIT_MOD_ID);
  assert.deepEqual(mod.capabilities, [...DAILY_OUTFIT_CAPABILITIES]);
});

test('daily-outfit generates local outfit suggestions from active garments', () => {
  resetDailyOutfitStore();
  writeProfile({
    id: 'profile-2',
    gender: 'male',
    ageGroup: '31-40',
    styleWeights: { minimal: 0.5, business: 0.4 },
    sceneFrequencies: { office: 0.7 },
  });
  createGarment({
    photoUrls: ['local://top'],
    category: 'top',
    subcategory: 'oxford shirt',
    colors: ['white'],
    styleTags: ['business', 'minimal'],
    seasons: ['spring', 'autumn'],
    formalityLevel: 4,
  });
  createGarment({
    photoUrls: ['local://bottom'],
    category: 'bottom',
    subcategory: 'tailored trousers',
    colors: ['navy'],
    styleTags: ['business'],
    seasons: ['spring', 'autumn'],
    formalityLevel: 4,
  });
  createGarment({
    photoUrls: ['local://shoes'],
    category: 'shoes',
    subcategory: 'loafer',
    colors: ['black'],
    styleTags: ['minimal'],
    seasons: ['spring', 'autumn'],
    formalityLevel: 4,
  });

  const outfits = generateOutfitSuggestions({ occasion: 'client office meeting' });

  assert.equal(outfits.length > 0, true);
  const firstOutfit = outfits[0];
  assert.ok(firstOutfit);
  assert.equal(firstOutfit.itemIds.length >= 3, true);
  assert.equal(firstOutfit.occasionTags.includes('formal'), true);
});

test('daily-outfit favorite action updates outfit state and profile style weights', () => {
  resetDailyOutfitStore();
  writeProfile({
    id: 'profile-3',
    gender: 'female',
    ageGroup: '25-30',
    styleWeights: { minimal: 0.1 },
    sceneFrequencies: {},
  });
  const top = createGarment({
    photoUrls: ['local://top-2'],
    category: 'top',
    subcategory: 'knit top',
    colors: ['cream'],
    styleTags: ['minimal'],
    seasons: ['spring'],
    formalityLevel: 2,
  });
  const bottom = createGarment({
    photoUrls: ['local://bottom-2'],
    category: 'bottom',
    subcategory: 'wide pants',
    colors: ['beige'],
    styleTags: ['minimal'],
    seasons: ['spring'],
    formalityLevel: 2,
  });
  const shoes = createGarment({
    photoUrls: ['local://shoes-2'],
    category: 'shoes',
    subcategory: 'flat',
    colors: ['tan'],
    styleTags: ['minimal'],
    seasons: ['spring'],
    formalityLevel: 2,
  });
  const [outfit] = generateOutfitSuggestions({ occasion: 'weekend coffee' });
  assert.ok(outfit);
  assert.deepEqual(outfit.itemIds.includes(top.id) || outfit.itemIds.includes(bottom.id) || outfit.itemIds.includes(shoes.id), true);

  const favorited = toggleFavoriteOutfit(outfit.id);

  assert.equal(favorited?.isFavorite, true);
  assert.equal((readProfile()?.styleWeights.minimal || 0) > 0.1, true);
});
