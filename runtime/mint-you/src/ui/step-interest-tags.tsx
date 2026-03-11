import React, { useMemo, useState } from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import { useMintYouStore } from '../state/mint-you-store.js';
import { SocialProfileSchema } from '../schemas.js';
import {
  INTEREST_CATEGORIES,
  getTagsByCategory,
} from '../data/interest-tags.js';
import {
  MBTI_VALUES,
  MINTYOU_AUDIT,
  SOCIAL_PROFILE_LIMITS,
  type MbtiValue,
} from '../contracts.js';
import { emitMintYouLog } from '../logging.js';
import type { SocialProfile } from '../types.js';

function SummaryStat(props: {
  label: string;
  value: string;
}) {
  return (
    <div className="ui-sync-soft-card rounded-2xl px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">{props.label}</p>
      <p className="mt-2 text-sm font-semibold text-gray-900">{props.value}</p>
    </div>
  );
}

export function StepInterestTags() {
  const { t } = useModTranslation('mint-you');
  const store = useMintYouStore();
  const [selectedInterests, setSelectedInterests] = useState(store.selectedInterests);
  const [selfReportedMbti, setSelfReportedMbti] = useState<MbtiValue | null>(store.selfReportedMbti);
  const [currentFocus, setCurrentFocus] = useState(store.currentFocus);
  const [errors, setErrors] = useState<string[]>([]);

  const selectedInterestLabels = useMemo(
    () => selectedInterests.map((tagId) => t(`InterestTags.tag.${tagId}`)),
    [selectedInterests, t],
  );

  const canProceed = (
    selectedInterests.length >= SOCIAL_PROFILE_LIMITS.minInterests
    && selectedInterests.length <= SOCIAL_PROFILE_LIMITS.maxInterests
  );

  const toggleInterest = (tagId: string) => {
    setSelectedInterests((current) => {
      if (current.includes(tagId)) {
        return current.filter((item) => item !== tagId);
      }
      if (current.length >= SOCIAL_PROFILE_LIMITS.maxInterests) {
        return current;
      }
      return [...current, tagId];
    });
  };

  const handleSubmit = () => {
    const parsed = SocialProfileSchema.safeParse({
      selectedInterests,
      selfReportedMbti,
      currentFocus,
    });

    if (!parsed.success) {
      setErrors(parsed.error.issues.map((issue) => issue.message));
      return;
    }

    const socialProfile = parsed.data as SocialProfile;
    setErrors([]);
    store.applySocialProfile(socialProfile);
    emitMintYouLog({
      message: MINTYOU_AUDIT.INTERESTS_SELECTED,
      source: 'StepInterestTags',
      details: {
        interestCount: socialProfile.selectedInterests.length,
        selfReportedMbti: socialProfile.selfReportedMbti,
        hasCurrentFocus: Boolean(socialProfile.currentFocus),
      },
    });
    store.goNext();
  };

  return (
    <div className="mx-auto my-4 max-w-5xl space-y-4 px-4 pb-6">
      <section className="ui-sync-card relative overflow-hidden p-6">
        <div className="absolute inset-y-0 right-0 hidden w-72 bg-[radial-gradient(circle_at_center,_rgba(45,212,191,0.12),_transparent_62%)] md:block" />
        <div className="relative grid gap-5 md:grid-cols-[1.45fr_0.85fr] md:items-start">
          <div className="space-y-3">
            <span className="ui-sync-pill inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]">
              {t('InterestTags.kicker')}
            </span>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-gray-950">{t('InterestTags.title')}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">{t('InterestTags.subtitle')}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedInterestLabels.length > 0 ? selectedInterestLabels.map((label) => (
                <span key={label} className="rounded-full border border-[#b5efe0] bg-[#edfffa] px-3 py-1 text-xs font-medium text-[#0f766e]">
                  {label}
                </span>
              )) : (
                <span className="text-sm text-gray-400">{t('InterestTags.selectedEmpty')}</span>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1">
            <SummaryStat
              label={t('InterestTags.summary.interests')}
              value={t('InterestTags.summary.interestsValue', {
                count: selectedInterests.length,
                max: SOCIAL_PROFILE_LIMITS.maxInterests,
              })}
            />
            <SummaryStat
              label={t('InterestTags.summary.mbti')}
              value={selfReportedMbti || t('InterestTags.summary.mbtiUnset')}
            />
          </div>
        </div>
      </section>

      <section className="ui-sync-card space-y-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">{t('InterestTags.interestsTitle')}</h3>
            <p className="mt-1 text-sm text-gray-500">{t('InterestTags.interestsHint')}</p>
          </div>
          <span className="ui-sync-pill rounded-full px-3 py-1 text-xs font-semibold">
            {selectedInterests.length}/{SOCIAL_PROFILE_LIMITS.maxInterests}
          </span>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {INTEREST_CATEGORIES.map((category) => (
            <section key={category} className="ui-sync-soft-card rounded-[24px] p-4">
              <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
                {t(`InterestTags.category.${category}`)}
              </h4>
              <div className="mt-3 flex flex-wrap gap-2">
                {getTagsByCategory(category).map((tag) => {
                  const active = selectedInterests.includes(tag.id);
                  const disabled = !active && selectedInterests.length >= SOCIAL_PROFILE_LIMITS.maxInterests;
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleInterest(tag.id)}
                      disabled={disabled}
                      className={`ui-sync-btn rounded-full border px-3 py-2 text-sm font-medium transition-colors ${
                        active
                          ? 'ui-sync-btn-primary border-[#4ECCA3] bg-[#4ECCA3] text-white'
                          : 'ui-sync-btn-secondary border-gray-200 text-gray-700 hover:border-[#8fe6d1]'
                      } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
                    >
                      {t(`InterestTags.tag.${tag.id}`)}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_0.95fr]">
        <section className="ui-sync-card space-y-4 p-5">
          <div>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-gray-900">{t('InterestTags.mbtiTitle')}</h3>
              <span className="text-xs font-medium text-gray-400">{t('InterestTags.optional')}</span>
            </div>
            <p className="mt-1 text-sm text-gray-500">{t('InterestTags.mbtiHint')}</p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {MBTI_VALUES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setSelfReportedMbti((current) => current === value ? null : value)}
                className={`ui-sync-btn rounded-2xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
                  selfReportedMbti === value
                    ? 'ui-sync-btn-primary border-[#4ECCA3] bg-[#4ECCA3] text-white'
                    : 'ui-sync-btn-secondary border-gray-200 text-gray-700 hover:border-[#8fe6d1]'
                }`}
              >
                {value}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-dashed border-gray-200 bg-gray-50/80 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-700">{t('InterestTags.mbtiSkipTitle')}</p>
              <p className="mt-0.5 text-xs text-gray-500">{t('InterestTags.mbtiSkipHint')}</p>
            </div>
            <button
              type="button"
              onClick={() => setSelfReportedMbti(null)}
              className="ui-sync-btn ui-sync-btn-ghost rounded-full border px-3 py-1.5 text-xs font-semibold"
            >
              {t('InterestTags.clearMbti')}
            </button>
          </div>
        </section>

        <section className="ui-sync-card space-y-4 p-5">
          <div>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-gray-900">{t('InterestTags.currentFocusTitle')}</h3>
              <span className="text-xs font-medium text-gray-400">{t('InterestTags.optional')}</span>
            </div>
            <p className="mt-1 text-sm text-gray-500">{t('InterestTags.currentFocusHint')}</p>
          </div>
          <div className="ui-sync-soft-card rounded-2xl p-3">
            <input
              value={currentFocus}
              onChange={(event) => setCurrentFocus(event.target.value.slice(0, SOCIAL_PROFILE_LIMITS.currentFocusMaxLength))}
              placeholder={t('InterestTags.currentFocusPlaceholder')}
              className="h-12 w-full border-none bg-transparent px-0 py-0 text-sm text-gray-800 shadow-none focus:ring-0"
            />
            <div className="mt-2 flex items-center justify-end text-xs text-gray-400">
              <span>{currentFocus.length}/{SOCIAL_PROFILE_LIMITS.currentFocusMaxLength}</span>
            </div>
          </div>
        </section>
      </div>

      {errors.length > 0 ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          {errors.map((error, index) => (
            <p key={`${error}-${index}`} className="text-sm text-red-600">{error}</p>
          ))}
        </div>
      ) : null}

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={() => store.goBack()}
          className="ui-sync-btn ui-sync-btn-secondary rounded-2xl border border-gray-300 px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {t('Common.back')}
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canProceed}
          className="ui-sync-btn ui-sync-btn-primary flex-1 rounded-2xl bg-[#4ECCA3] px-5 py-3 text-sm font-semibold text-white hover:bg-[#3DBB92] disabled:opacity-50"
        >
          {t('InterestTags.next')}
        </button>
      </div>
    </div>
  );
}
