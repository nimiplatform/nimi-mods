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
import {
  loadDailyOutfitSnapshotFromIndexedDb,
  persistDailyOutfitSnapshotToIndexedDb,
} from './indexed-db.js';

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
let hasHydratedFromPersistence = false;
let pendingPersistBeforeHydration = false;
let stateVersion = 0;
let persistChain: Promise<void> = Promise.resolve();

function nowIso(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function renderDemoGarmentSvg(input: {
  accent: string;
  base: string;
  label: string;
  kind: 'top' | 'outerwear' | 'bottom' | 'shoes' | 'accessory';
}): string {
  const { accent, base, label, kind } = input;
  const shapes = {
    top: `
      <path d="M180 110 250 74h100l70 36 36 88-48 28-24-54v302H216V172l-24 54-48-28z" fill="${base}"/>
      <rect x="268" y="84" width="64" height="24" rx="12" fill="#f5efe9" opacity="0.95"/>
      <rect x="212" y="238" width="196" height="14" rx="7" fill="${accent}" opacity="0.22"/>
      <rect x="212" y="276" width="196" height="10" rx="5" fill="${accent}" opacity="0.18"/>
    `,
    outerwear: `
      <path d="M172 104 242 66h116l70 38 22 104-50 16-20-74v332H220V150l-20 74-50-16z" fill="${base}"/>
      <rect x="294" y="78" width="84" height="32" rx="16" fill="#efe6df"/>
      <rect x="292" y="126" width="16" height="350" rx="8" fill="${accent}" opacity="0.55"/>
      <rect x="228" y="202" width="72" height="18" rx="9" fill="${accent}" opacity="0.18"/>
      <rect x="320" y="202" width="72" height="18" rx="9" fill="${accent}" opacity="0.18"/>
    `,
    bottom: `
      <path d="M232 74h168l20 120-44 312H274l-36-210-36 210H100l20-312z" fill="${base}"/>
      <rect x="230" y="88" width="172" height="18" rx="9" fill="${accent}" opacity="0.24"/>
      <rect x="266" y="148" width="16" height="302" rx="8" fill="${accent}" opacity="0.18"/>
      <rect x="352" y="148" width="16" height="302" rx="8" fill="${accent}" opacity="0.18"/>
    `,
    shoes: `
      <path d="M106 328c34-4 64-18 92-44l52-50 48 14 42 52 98 24c26 6 40 18 40 34v20H106c-28 0-44-12-44-32 0-12 6-18 18-18z" fill="${base}"/>
      <rect x="126" y="334" width="312" height="18" rx="9" fill="${accent}" opacity="0.22"/>
      <rect x="150" y="278" width="74" height="12" rx="6" fill="${accent}" opacity="0.2"/>
      <rect x="242" y="278" width="70" height="12" rx="6" fill="${accent}" opacity="0.2"/>
    `,
    accessory: `
      <path d="M286 124c52 0 94 42 94 94s-42 94-94 94-94-42-94-94 42-94 94-94z" fill="${base}"/>
      <circle cx="286" cy="218" r="44" fill="${accent}" opacity="0.22"/>
      <rect x="274" y="70" width="24" height="62" rx="12" fill="${accent}" opacity="0.5"/>
    `,
  };
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="572" height="760" viewBox="0 0 572 760" fill="none">
      <rect width="572" height="760" rx="44" fill="#fffdf9"/>
      <circle cx="474" cy="104" r="54" fill="${accent}" opacity="0.08"/>
      <circle cx="110" cy="636" r="84" fill="${accent}" opacity="0.06"/>
      ${shapes[kind]}
      <rect x="50" y="620" width="184" height="54" rx="27" fill="#f7efe8"/>
      <text x="76" y="653" fill="#6b5c53" font-family="ui-sans-serif, system-ui" font-size="26" font-weight="600">${label}</text>
    </svg>
  `;
}

function createDemoGarment(input: {
  id: string;
  category: GarmentItem['category'];
  subcategory: string;
  colors: string[];
  material: string;
  styleTags: string[];
  seasons: GarmentItem['seasons'];
  formalityLevel: number;
  accent: string;
  base: string;
  kind: 'top' | 'outerwear' | 'bottom' | 'shoes' | 'accessory';
}): GarmentItem {
  const imageUrl = svgToDataUrl(renderDemoGarmentSvg({
    accent: input.accent,
    base: input.base,
    label: input.subcategory,
    kind: input.kind,
  }));
  return {
    id: input.id,
    photoUrls: [imageUrl],
    thumbnailUrl: imageUrl,
    category: input.category,
    subcategory: input.subcategory,
    colors: input.colors,
    material: input.material,
    styleTags: input.styleTags,
    seasons: input.seasons,
    formalityLevel: input.formalityLevel,
    status: 'active',
    wearCount: 0,
    createdAt: nowIso(),
  };
}

function normalizeTextList(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function notifyListeners(): void {
  cachedSnapshot = null;
  for (const listener of listeners) {
    listener();
  }
}

function schedulePersist(): void {
  const snapshot = getDailyOutfitSnapshot();
  persistChain = persistChain
    .catch(() => undefined)
    .then(async () => {
      await persistDailyOutfitSnapshotToIndexedDb(snapshot);
    })
    .catch(() => undefined);
}

function emitChange(): void {
  stateVersion += 1;
  cachedSnapshot = null;
  notifyListeners();
  if (hasHydratedFromPersistence) {
    schedulePersist();
  } else {
    pendingPersistBeforeHydration = true;
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

export function updateOutfitCollage(id: string, collageImageUrl: string): OutfitCombo | null {
  const outfit = state.outfits.get(id);
  if (!outfit) {
    return null;
  }
  const next: OutfitCombo = {
    ...outfit,
    collageImageUrl: collageImageUrl.trim() || undefined,
  };
  state.outfits.set(id, next);
  emitChange();
  return next;
}

export function updateOutfitTryOn(id: string, tryOnImageUrl: string): OutfitCombo | null {
  const outfit = state.outfits.get(id);
  if (!outfit) {
    return null;
  }
  const next: OutfitCombo = {
    ...outfit,
    tryOnImageUrl: tryOnImageUrl.trim() || undefined,
  };
  state.outfits.set(id, next);
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

export function seedDemoWardrobe(): GarmentItem[] {
  const demoGarments: GarmentItem[] = [
    createDemoGarment({
      id: 'demo-top-rose-knit',
      category: 'top',
      subcategory: 'rose knit top',
      colors: ['rose', 'cream'],
      material: 'cotton knit',
      styleTags: ['minimal', 'soft', 'date'],
      seasons: ['spring', 'autumn'],
      formalityLevel: 3,
      accent: '#d8a1a3',
      base: '#e9b6bc',
      kind: 'top',
    }),
    createDemoGarment({
      id: 'demo-top-navy-shirt',
      category: 'top',
      subcategory: 'navy pinstripe shirt',
      colors: ['navy', 'white'],
      material: 'cotton blend',
      styleTags: ['workwear', 'minimal', 'casual'],
      seasons: ['spring', 'summer', 'autumn'],
      formalityLevel: 2,
      accent: '#6f93b5',
      base: '#294766',
      kind: 'top',
    }),
    createDemoGarment({
      id: 'demo-outer-charcoal-jacket',
      category: 'outerwear',
      subcategory: 'charcoal denim jacket',
      colors: ['charcoal', 'graphite'],
      material: 'washed denim',
      styleTags: ['street', 'layering', 'minimal'],
      seasons: ['spring', 'autumn', 'winter'],
      formalityLevel: 3,
      accent: '#8d8f94',
      base: '#3f4349',
      kind: 'outerwear',
    }),
    createDemoGarment({
      id: 'demo-bottom-sienna-trousers',
      category: 'bottom',
      subcategory: 'burnt sienna trousers',
      colors: ['sienna', 'camel'],
      material: 'soft twill',
      styleTags: ['tailored', 'minimal', 'date'],
      seasons: ['spring', 'autumn'],
      formalityLevel: 3,
      accent: '#d69c72',
      base: '#b97749',
      kind: 'bottom',
    }),
    createDemoGarment({
      id: 'demo-bottom-cream-skirt',
      category: 'bottom',
      subcategory: 'cream midi skirt',
      colors: ['cream', 'sand'],
      material: 'satin blend',
      styleTags: ['soft', 'feminine', 'date'],
      seasons: ['spring', 'summer'],
      formalityLevel: 4,
      accent: '#d8c7a6',
      base: '#efe3c7',
      kind: 'bottom',
    }),
    createDemoGarment({
      id: 'demo-shoes-leopard-sneakers',
      category: 'shoes',
      subcategory: 'leopard low sneakers',
      colors: ['stone', 'taupe'],
      material: 'canvas',
      styleTags: ['casual', 'street', 'playful'],
      seasons: ['spring', 'summer', 'autumn'],
      formalityLevel: 2,
      accent: '#b18c67',
      base: '#d6c0ab',
      kind: 'shoes',
    }),
    createDemoGarment({
      id: 'demo-shoes-black-heels',
      category: 'shoes',
      subcategory: 'black slingback heels',
      colors: ['black'],
      material: 'leather',
      styleTags: ['date', 'elevated', 'minimal'],
      seasons: ['spring', 'summer', 'autumn'],
      formalityLevel: 4,
      accent: '#6f6f73',
      base: '#1f1f22',
      kind: 'shoes',
    }),
    createDemoGarment({
      id: 'demo-accessory-red-flower',
      category: 'accessory',
      subcategory: 'crimson flower earrings',
      colors: ['crimson', 'gold'],
      material: 'resin',
      styleTags: ['accent', 'date', 'playful'],
      seasons: ['spring', 'summer'],
      formalityLevel: 3,
      accent: '#d94c54',
      base: '#c92838',
      kind: 'accessory',
    }),
  ];

  for (const garment of demoGarments) {
    if (!state.garments.has(garment.id)) {
      state.garments.set(garment.id, garment);
    }
  }

  if (!state.profile) {
    state.profile = {
      id: 'demo-profile',
      gender: 'female',
      ageGroup: '25-30',
      selfieUrl: undefined,
      styleWeights: {
        minimal: 0.7,
        date: 0.6,
        soft: 0.55,
        street: 0.35,
      },
      sceneFrequencies: {
        date: 0.7,
        dinner: 0.55,
        weekend: 0.45,
      },
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
  }

  emitChange();
  return demoGarments;
}

export function queryInsights(): DailyOutfitInsightSummary {
  return buildInsights();
}

function applyPersistedSnapshot(snapshot: DailyOutfitSnapshot): void {
  state.garments = new Map(snapshot.garments.map((garment) => [garment.id, garment]));
  state.outfits = new Map(snapshot.outfits.map((outfit) => [outfit.id, outfit]));
  state.wearLogs = new Map(snapshot.wearLogs.map((wearLog) => [wearLog.id, wearLog]));
  state.profile = snapshot.profile;
}

async function hydrateDailyOutfitStore(): Promise<void> {
  try {
    const snapshot = await loadDailyOutfitSnapshotFromIndexedDb();
    if (snapshot && stateVersion === 0) {
      applyPersistedSnapshot(snapshot);
      notifyListeners();
    }
  } finally {
    hasHydratedFromPersistence = true;
    if (pendingPersistBeforeHydration) {
      pendingPersistBeforeHydration = false;
      schedulePersist();
    }
  }
}

void hydrateDailyOutfitStore();
