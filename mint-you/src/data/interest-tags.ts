import type { InterestTag, InterestCategory } from '../types.js';

type TagCategoryDef = {
  category: InterestCategory;
  tags: string[];
};

const TAG_CATEGORIES: readonly TagCategoryDef[] = [
  {
    category: 'lifestyle',
    tags: ['travel', 'fitness', 'cooking', 'photography', 'fashion', 'gardening', 'pets', 'outdoors'],
  },
  {
    category: 'entertainment',
    tags: ['movies', 'anime', 'music', 'gaming', 'reading', 'podcasts', 'concerts', 'theater'],
  },
  {
    category: 'intellectual',
    tags: ['technology', 'science', 'philosophy', 'history', 'politics', 'economics', 'psychology', 'languages'],
  },
  {
    category: 'creative',
    tags: ['writing', 'painting', 'design', 'filmmaking', 'crafts', 'music-production'],
  },
  {
    category: 'social',
    tags: ['volunteering', 'mentoring', 'community', 'networking', 'debate', 'public-speaking'],
  },
  {
    category: 'wellness',
    tags: ['meditation', 'yoga', 'mental-health', 'nutrition', 'skincare', 'self-improvement'],
  },
] as const;

function buildInterestTags(): InterestTag[] {
  const result: InterestTag[] = [];
  for (const cat of TAG_CATEGORIES) {
    for (const tag of cat.tags) {
      result.push({
        id: tag,
        label: tag,
        category: cat.category,
      });
    }
  }
  return result;
}

export const INTEREST_TAGS: readonly InterestTag[] = buildInterestTags();

export const INTEREST_CATEGORIES: readonly InterestCategory[] = [
  'lifestyle',
  'entertainment',
  'intellectual',
  'creative',
  'social',
  'wellness',
];

export function getTagsByCategory(category: InterestCategory): InterestTag[] {
  return INTEREST_TAGS.filter(t => t.category === category);
}

export const MIN_INTEREST_TAGS = 3;
export const MAX_INTEREST_TAGS = 8;
