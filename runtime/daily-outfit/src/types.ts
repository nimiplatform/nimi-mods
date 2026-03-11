export const DAILY_OUTFIT_CATEGORIES = ['top', 'bottom', 'shoes', 'outerwear', 'accessory'] as const;
export const DAILY_OUTFIT_SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export const DAILY_OUTFIT_GARMENT_STATUSES = ['active', 'retired'] as const;
export const DAILY_OUTFIT_GENDERS = ['male', 'female', 'non-binary'] as const;
export const DAILY_OUTFIT_AGE_GROUPS = ['18-24', '25-30', '31-40', '41-50', '50+'] as const;

export type DailyOutfitCategory = (typeof DAILY_OUTFIT_CATEGORIES)[number];
export type DailyOutfitSeason = (typeof DAILY_OUTFIT_SEASONS)[number];
export type DailyOutfitGarmentStatus = (typeof DAILY_OUTFIT_GARMENT_STATUSES)[number];
export type DailyOutfitGender = (typeof DAILY_OUTFIT_GENDERS)[number];
export type DailyOutfitAgeGroup = (typeof DAILY_OUTFIT_AGE_GROUPS)[number];

export type GarmentItem = {
  id: string;
  photoUrls: string[];
  thumbnailUrl?: string;
  category: DailyOutfitCategory;
  subcategory?: string;
  colors: string[];
  material?: string;
  styleTags: string[];
  seasons: DailyOutfitSeason[];
  formalityLevel: number;
  status: DailyOutfitGarmentStatus;
  wearCount: number;
  lastWornAt?: string;
  createdAt: string;
};

export type UserProfile = {
  id: string;
  gender: DailyOutfitGender;
  ageGroup: DailyOutfitAgeGroup;
  selfieUrl?: string;
  styleWeights: Record<string, number>;
  sceneFrequencies: Record<string, number>;
  createdAt: string;
  updatedAt: string;
};

export type OutfitCombo = {
  id: string;
  itemIds: string[];
  occasion: string;
  occasionTags: string[];
  collageImageUrl?: string;
  tryOnImageUrl?: string;
  aiReasoning: string;
  isFavorite: boolean;
  lockedItemIds?: string[];
  createdAt: string;
};

export type WearLog = {
  id: string;
  outfitComboId?: string;
  itemIds: string[];
  date: string;
  occasion?: string;
  notes?: string;
  createdAt: string;
};

export type GarmentCreateInput = Omit<GarmentItem, 'id' | 'createdAt' | 'wearCount' | 'status'> & {
  id?: string;
  wearCount?: number;
  status?: DailyOutfitGarmentStatus;
};

export type GarmentUpdateInput = Partial<Omit<GarmentItem, 'id' | 'createdAt'>>;

export type UserProfileWriteInput = Omit<UserProfile, 'createdAt' | 'updatedAt'> & {
  createdAt?: string;
  updatedAt?: string;
};

export type WearLogCreateInput = Omit<WearLog, 'id' | 'createdAt'> & {
  id?: string;
  createdAt?: string;
};

export type DailyOutfitInsightSummary = {
  activeGarmentCount: number;
  retiredGarmentCount: number;
  favoriteOutfitCount: number;
  wearLogCount: number;
  retireCandidates: GarmentItem[];
  styleDistribution: Array<{ tag: string; count: number }>;
  gapSuggestions: string[];
};

export type DailyOutfitSnapshot = {
  garments: GarmentItem[];
  outfits: OutfitCombo[];
  wearLogs: WearLog[];
  profile: UserProfile | null;
  insights: DailyOutfitInsightSummary;
};
