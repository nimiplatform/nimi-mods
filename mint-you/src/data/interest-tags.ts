import type { InterestTag, InterestCategory } from '../types.js';

type TagCategoryDef = {
  category: InterestCategory;
  tags: string[];
};

const TAG_CATEGORIES: readonly TagCategoryDef[] = [
  {
    category: 'lifestyle',
    tags: ['travel', 'fitness', 'cooking', 'photography', 'pets', 'outdoors'],
  },
  {
    category: 'entertainment',
    tags: ['movies', 'music', 'gaming', 'reading', 'anime', 'podcasts'],
  },
  {
    category: 'intellectual',
    tags: ['technology', 'science', 'psychology', 'history', 'philosophy', 'languages'],
  },
  {
    category: 'creative',
    tags: ['writing', 'painting', 'design', 'filmmaking', 'crafts', 'music-production'],
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
];

export function getTagsByCategory(category: InterestCategory): InterestTag[] {
  return INTEREST_TAGS.filter(t => t.category === category);
}

export const MIN_INTEREST_TAGS = 3;
export const MAX_INTEREST_TAGS = 8;
