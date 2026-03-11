import type {
  DailyOutfitInsightSummary,
  DailyOutfitSnapshot,
  GarmentCreateInput,
  GarmentItem,
  GarmentUpdateInput,
  OutfitCombo,
  UserProfile,
  UserProfileWriteInput,
  WearLog,
  WearLogCreateInput,
} from '../types.js';

type DailyOutfitState = {
  garments: Map<string, GarmentItem>;
  outfits: Map<string, OutfitCombo>;
  wearLogs: Map<string, WearLog>;
  profile: UserProfile | null;
};

const listeners = new Set<() => void>();
const state: DailyOutfitState = {
  garments: new Map(),
  outfits: new Map(),
  wearLogs: new Map(),
  profile: null,
};
let cachedSnapshot: DailyOutfitSnapshot | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeTextList(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function emitChange(): void {
  cachedSnapshot = null;
  for (const listener of listeners) {
    listener();
  }
}

function clampWeight(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));
}

function sortByCreatedAt<T extends { createdAt: string }>(items: Iterable<T>): T[] {
  return [...items].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function countStyleDistribution(garments: GarmentItem[]): Array<{ tag: string; count: number }> {
  const distribution = new Map<string, number>();
  for (const garment of garments) {
    for (const tag of garment.styleTags) {
      distribution.set(tag, (distribution.get(tag) || 0) + 1);
    }
  }
  return [...distribution.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag));
}

function inferGapSuggestions(garments: GarmentItem[], profile: UserProfile | null): string[] {
  const active = garments.filter((garment) => garment.status === 'active');
  const categories = new Set(active.map((garment) => garment.category));
  const suggestions: string[] = [];
  if (!categories.has('top')) suggestions.push('Add more tops to improve outfit coverage.');
  if (!categories.has('bottom')) suggestions.push('Add more bottoms to balance wardrobe combinations.');
  if (!categories.has('shoes')) suggestions.push('Add shoes coverage to unlock complete outfit suggestions.');
  if (profile) {
    for (const [scene, weight] of Object.entries(profile.sceneFrequencies)) {
      if (weight >= 0.5 && active.length < 3) {
        suggestions.push(`Wardrobe is still sparse for high-frequency scene "${scene}".`);
      }
    }
  }
  return suggestions;
}

function inferOccasionTags(occasion: string): string[] {
  const normalized = occasion.trim().toLowerCase();
  const tags = new Set<string>();
  if (!normalized) {
    return [];
  }
  if (/(office|client|meeting|formal|work|商务|客户|会议)/u.test(normalized)) tags.add('formal');
  if (/(casual|coffee|weekend|daily|逛街|日常|休闲)/u.test(normalized)) tags.add('casual');
  if (/(sport|gym|run|hike|outdoor|运动|徒步|户外)/u.test(normalized)) tags.add('outdoor');
  if (/(party|date|dinner|夜|约会|聚会)/u.test(normalized)) tags.add('social');
  if (/(rain|cold|winter|snow|冷|冬|雨)/u.test(normalized)) tags.add('winter');
  if (/(summer|hot|beach|sun|热|夏)/u.test(normalized)) tags.add('summer');
  return [...tags];
}

function inferTargetSeason(tags: string[]): string | null {
  if (tags.includes('winter')) return 'winter';
  if (tags.includes('summer')) return 'summer';
  return null;
}

function inferTargetFormality(tags: string[]): number {
  if (tags.includes('formal')) return 4;
  if (tags.includes('social')) return 3;
  if (tags.includes('outdoor')) return 2;
  return 2;
}

function scoreGarmentForOccasion(input: {
  garment: GarmentItem;
  occasionTags: string[];
  profile: UserProfile | null;
}): number {
  const { garment, occasionTags, profile } = input;
  let score = 0;
  for (const tag of garment.styleTags) {
    score += profile?.styleWeights[tag] || 0;
  }
  const targetSeason = inferTargetSeason(occasionTags);
  if (targetSeason && garment.seasons.includes(targetSeason as GarmentItem['seasons'][number])) {
    score += 0.8;
  }
  const targetFormality = inferTargetFormality(occasionTags);
  score += Math.max(0, 1.2 - Math.abs(garment.formalityLevel - targetFormality) * 0.35);
  if (occasionTags.includes('outdoor') && garment.styleTags.some((tag) => /sport|functional|street/u.test(tag))) {
    score += 0.5;
  }
  if (occasionTags.includes('formal') && garment.styleTags.some((tag) => /minimal|business|tailored|商务|极简/u.test(tag))) {
    score += 0.5;
  }
  return score;
}

function pickCategoryCandidates(category: GarmentItem['category'], occasionTags: string[], profile: UserProfile | null): GarmentItem[] {
  return [...state.garments.values()]
    .filter((garment) => garment.status === 'active' && garment.category === category)
    .sort((left, right) => {
      const scoreDiff = scoreGarmentForOccasion({ garment: right, occasionTags, profile })
        - scoreGarmentForOccasion({ garment: left, occasionTags, profile });
      return scoreDiff || right.createdAt.localeCompare(left.createdAt);
    });
}

function buildOutfitReasoning(input: {
  selected: GarmentItem[];
  occasion: string;
  occasionTags: string[];
  missingCategories: string[];
}): string {
  const { selected, occasion, occasionTags, missingCategories } = input;
  const styleSummary = [...new Set(selected.flatMap((item) => item.styleTags))].slice(0, 4).join(', ');
  const colorSummary = [...new Set(selected.flatMap((item) => item.colors))].slice(0, 4).join(', ');
  const tagSummary = occasionTags.join(', ') || 'general';
  const missingSummary = missingCategories.length > 0
    ? ` Missing categories: ${missingCategories.join(', ')}.`
    : '';
  return `Built for "${occasion}" with ${tagSummary} cues. Prioritized ${styleSummary || 'balanced'} styling and ${colorSummary || 'neutral'} color cohesion.${missingSummary}`;
}

function collectOutfitStyleTags(itemIds: string[]): string[] {
  const tags = new Set<string>();
  for (const itemId of itemIds) {
    const garment = state.garments.get(itemId);
    if (!garment) {
      continue;
    }
    for (const tag of garment.styleTags) {
      tags.add(tag);
    }
  }
  return [...tags];
}

function buildInsights(): DailyOutfitInsightSummary {
  const garments = [...state.garments.values()];
  const active = garments.filter((garment) => garment.status === 'active');
  const retired = garments.filter((garment) => garment.status === 'retired');
  const retireThresholdMs = 90 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const retireCandidates = active.filter((garment) => {
    if (!garment.lastWornAt) {
      return false;
    }
    const wornAt = Date.parse(garment.lastWornAt);
    return Number.isFinite(wornAt) && now - wornAt >= retireThresholdMs;
  });

  return {
    activeGarmentCount: active.length,
    retiredGarmentCount: retired.length,
    favoriteOutfitCount: [...state.outfits.values()].filter((outfit) => outfit.isFavorite).length,
    wearLogCount: state.wearLogs.size,
    retireCandidates,
    styleDistribution: countStyleDistribution(active),
    gapSuggestions: inferGapSuggestions(active, state.profile),
  };
}

export function subscribeDailyOutfitStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDailyOutfitSnapshot(): DailyOutfitSnapshot {
  if (cachedSnapshot) {
    return cachedSnapshot;
  }
  cachedSnapshot = {
    garments: sortByCreatedAt(state.garments.values()),
    outfits: sortByCreatedAt(state.outfits.values()),
    wearLogs: sortByCreatedAt(state.wearLogs.values()),
    profile: state.profile,
    insights: buildInsights(),
  };
  return cachedSnapshot;
}

export function resetDailyOutfitStore(): void {
  state.garments.clear();
  state.outfits.clear();
  state.wearLogs.clear();
  state.profile = null;
  emitChange();
}

export function listWardrobe(): GarmentItem[] {
  return getDailyOutfitSnapshot().garments;
}

export function getGarment(id: string): GarmentItem | null {
  return state.garments.get(id) || null;
}

export function createGarment(input: GarmentCreateInput): GarmentItem {
  const garment: GarmentItem = {
    id: input.id || createId('garment'),
    photoUrls: [...input.photoUrls],
    thumbnailUrl: input.thumbnailUrl,
    category: input.category,
    subcategory: input.subcategory,
    colors: [...input.colors],
    material: input.material,
    styleTags: [...input.styleTags],
    seasons: [...input.seasons],
    formalityLevel: clampWeight(input.formalityLevel, 1, 5),
    status: input.status || 'active',
    wearCount: Math.max(0, Math.trunc(input.wearCount || 0)),
    lastWornAt: input.lastWornAt,
    createdAt: nowIso(),
  };
  state.garments.set(garment.id, garment);
  emitChange();
  return garment;
}

export function updateGarment(id: string, patch: GarmentUpdateInput): GarmentItem | null {
  const current = state.garments.get(id);
  if (!current) {
    return null;
  }
  const next: GarmentItem = {
    ...current,
    ...patch,
    photoUrls: patch.photoUrls ? [...patch.photoUrls] : current.photoUrls,
    colors: patch.colors ? [...patch.colors] : current.colors,
    styleTags: patch.styleTags ? [...patch.styleTags] : current.styleTags,
    seasons: patch.seasons ? [...patch.seasons] : current.seasons,
    formalityLevel: patch.formalityLevel == null
      ? current.formalityLevel
      : clampWeight(patch.formalityLevel, 1, 5),
  };
  state.garments.set(id, next);
  emitChange();
  return next;
}

export function retireGarment(id: string): GarmentItem | null {
  return updateGarment(id, { status: 'retired' });
}

export function listOutfits(): OutfitCombo[] {
  return getDailyOutfitSnapshot().outfits;
}

export function listFavoriteOutfits(): OutfitCombo[] {
  return listOutfits().filter((outfit) => outfit.isFavorite);
}

export function getOutfit(id: string): OutfitCombo | null {
  return state.outfits.get(id) || null;
}

export function readProfile(): UserProfile | null {
  return state.profile;
}

export function writeProfile(input: UserProfileWriteInput): UserProfile {
  const createdAt = state.profile?.createdAt || input.createdAt || nowIso();
  const profile: UserProfile = {
    id: input.id,
    gender: input.gender,
    ageGroup: input.ageGroup,
    selfieUrl: input.selfieUrl,
    styleWeights: { ...input.styleWeights },
    sceneFrequencies: { ...input.sceneFrequencies },
    createdAt,
    updatedAt: input.updatedAt || nowIso(),
  };
  state.profile = profile;
  emitChange();
  return profile;
}

export function listWearLogs(): WearLog[] {
  return getDailyOutfitSnapshot().wearLogs;
}

function resolveWearLogItemIds(input: WearLogCreateInput): string[] {
  if (input.itemIds.length > 0) {
    return [...input.itemIds];
  }
  if (!input.outfitComboId) {
    return [];
  }
  const outfit = state.outfits.get(input.outfitComboId);
  return outfit ? [...outfit.itemIds] : [];
}

function applyWearLogStats(itemIds: string[], occasion?: string): void {
  const wornAt = nowIso();
  for (const itemId of itemIds) {
    const garment = state.garments.get(itemId);
    if (!garment) {
      continue;
    }
    state.garments.set(itemId, {
      ...garment,
      wearCount: garment.wearCount + 1,
      lastWornAt: wornAt,
    });
  }

  if (state.profile && occasion) {
    const currentWeight = state.profile.sceneFrequencies[occasion] || 0;
    state.profile = {
      ...state.profile,
      sceneFrequencies: {
        ...state.profile.sceneFrequencies,
        [occasion]: clampWeight(currentWeight + 0.1, 0, 1),
      },
      updatedAt: wornAt,
    };
  }
}

export function createWearLog(input: WearLogCreateInput): WearLog {
  const itemIds = resolveWearLogItemIds(input);
  const wearLog: WearLog = {
    id: input.id || createId('wearlog'),
    outfitComboId: input.outfitComboId,
    itemIds,
    date: input.date,
    occasion: input.occasion,
    notes: input.notes,
    createdAt: input.createdAt || nowIso(),
  };
  state.wearLogs.set(wearLog.id, wearLog);
  applyWearLogStats(itemIds, input.occasion);
  emitChange();
  return wearLog;
}

export function generateOutfitSuggestions(input: {
  occasion: string;
  count?: number;
}): OutfitCombo[] {
  const occasion = input.occasion.trim();
  if (!occasion) {
    return [];
  }
  const profile = state.profile;
  const occasionTags = inferOccasionTags(occasion);
  const topCandidates = pickCategoryCandidates('top', occasionTags, profile);
  const bottomCandidates = pickCategoryCandidates('bottom', occasionTags, profile);
  const shoesCandidates = pickCategoryCandidates('shoes', occasionTags, profile);
  const outerwearCandidates = pickCategoryCandidates('outerwear', occasionTags, profile);
  const accessoryCandidates = pickCategoryCandidates('accessory', occasionTags, profile);
  const count = Math.min(3, Math.max(1, Math.trunc(input.count || 3)));
  const createdAt = nowIso();
  const outfits: OutfitCombo[] = [];

  for (let index = 0; index < count; index += 1) {
    const selected = [
      topCandidates[index] || topCandidates[0],
      bottomCandidates[index] || bottomCandidates[0],
      shoesCandidates[index] || shoesCandidates[0],
      outerwearCandidates[index],
      accessoryCandidates[index],
    ].filter(Boolean) as GarmentItem[];

    const uniqueSelected = [...new Map(selected.map((item) => [item.id, item])).values()];
    if (uniqueSelected.length === 0) {
      continue;
    }

    const missingCategories = [
      topCandidates.length === 0 ? 'top' : '',
      bottomCandidates.length === 0 ? 'bottom' : '',
      shoesCandidates.length === 0 ? 'shoes' : '',
    ].filter(Boolean);

    const outfit: OutfitCombo = {
      id: createId('outfit'),
      itemIds: uniqueSelected.map((item) => item.id),
      occasion,
      occasionTags,
      collageImageUrl: undefined,
      tryOnImageUrl: undefined,
      aiReasoning: buildOutfitReasoning({
        selected: uniqueSelected,
        occasion,
        occasionTags,
        missingCategories,
      }),
      isFavorite: false,
      lockedItemIds: [],
      createdAt,
    };
    state.outfits.set(outfit.id, outfit);
    outfits.push(outfit);
  }

  if (outfits.length > 0) {
    emitChange();
  }
  return outfits;
}

export function toggleFavoriteOutfit(id: string): OutfitCombo | null {
  const outfit = state.outfits.get(id);
  if (!outfit) {
    return null;
  }
  const nextFavorite = !outfit.isFavorite;
  const next: OutfitCombo = {
    ...outfit,
    isFavorite: nextFavorite,
  };
  state.outfits.set(id, next);

  if (nextFavorite && state.profile) {
    const styleTags = collectOutfitStyleTags(next.itemIds);
    const nextWeights = { ...state.profile.styleWeights };
    for (const tag of styleTags) {
      nextWeights[tag] = clampWeight((nextWeights[tag] || 0) + 0.1, -1, 1);
    }
    state.profile = {
      ...state.profile,
      styleWeights: nextWeights,
      updatedAt: nowIso(),
    };
  }

  emitChange();
  return next;
}

export function seedProfileFromPreferences(input: {
  gender: UserProfile['gender'];
  ageGroup: UserProfile['ageGroup'];
  selfieUrl?: string;
  stylesText: string;
  scenesText: string;
}): UserProfile {
  const styleWeights = Object.fromEntries(
    normalizeTextList(input.stylesText).map((tag) => [tag, 0.4]),
  );
  const sceneFrequencies = Object.fromEntries(
    normalizeTextList(input.scenesText).map((tag) => [tag, 0.5]),
  );
  return writeProfile({
    id: state.profile?.id || createId('profile'),
    gender: input.gender,
    ageGroup: input.ageGroup,
    selfieUrl: input.selfieUrl,
    styleWeights,
    sceneFrequencies,
  });
}

export function queryInsights(): DailyOutfitInsightSummary {
  return buildInsights();
}
