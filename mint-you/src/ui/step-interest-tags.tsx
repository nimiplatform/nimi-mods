import React from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import { useMintYouStore } from '../state/mint-you-store.js';
import {
  INTEREST_CATEGORIES,
  getTagsByCategory,
  MIN_INTEREST_TAGS,
  MAX_INTEREST_TAGS,
} from '../data/interest-tags.js';

export function StepInterestTags() {
  const { t } = useModTranslation('mint-you');
  const store = useMintYouStore();
  const selected = store.selectedInterests;

  const toggleTag = (tagId: string) => {
    if (selected.includes(tagId)) {
      store.setSelectedInterests(selected.filter(id => id !== tagId));
    } else if (selected.length < MAX_INTEREST_TAGS) {
      store.setSelectedInterests([...selected, tagId]);
    }
  };

  const canProceed = selected.length >= MIN_INTEREST_TAGS && selected.length <= MAX_INTEREST_TAGS;

  const handleNext = () => {
    if (canProceed) {
      store.goNext();
    }
  };

  return (
    <div className="ui-sync-card ui-sync-card-inset mx-auto my-4 max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">{t('InterestTags.title')}</h2>
        <span
          className={`ui-sync-pill rounded-full px-2.5 py-0.5 text-xs font-medium ${
            canProceed ? 'bg-[#4ECCA3]/10 text-[#4ECCA3]' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {selected.length}/{MAX_INTEREST_TAGS}
        </span>
      </div>
      <p className="text-sm text-gray-500">{t('InterestTags.subtitle')}</p>

      {INTEREST_CATEGORIES.map((category) => {
        const tags = getTagsByCategory(category);
        return (
          <div key={category}>
            <h3 className="mb-2 text-sm font-medium capitalize text-gray-700">{t(`InterestTags.category.${category}`)}</h3>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const isSelected = selected.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    className={`ui-sync-btn rounded-full border px-3 py-1 text-sm transition-colors ${
                      isSelected
                        ? 'ui-sync-btn-primary border-[#4ECCA3] bg-[#4ECCA3] text-white'
                        : 'ui-sync-btn-secondary border-gray-300 text-gray-600 hover:bg-gray-50'
                    } ${!isSelected && selected.length >= MAX_INTEREST_TAGS ? 'cursor-not-allowed opacity-40' : ''}`}
                    disabled={!isSelected && selected.length >= MAX_INTEREST_TAGS}
                  >
                    {t(`InterestTags.tag.${tag.id}`)}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="flex gap-3 pt-2">
        <button
          onClick={() => store.goBack()}
          className="ui-sync-btn ui-sync-btn-secondary rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          {t('Common.back')}
        </button>
        <button
          onClick={handleNext}
          disabled={!canProceed}
          className="ui-sync-btn ui-sync-btn-primary flex-1 rounded-lg bg-[#4ECCA3] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#3DBB92] disabled:opacity-50"
        >
          {t('InterestTags.next')}
        </button>
      </div>
    </div>
  );
}
