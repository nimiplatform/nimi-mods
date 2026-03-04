import React, { useState, useCallback } from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import { useMintYouStore } from '../state/mint-you-store.js';
import {
  PRIMARY_ARCHETYPES,
  SECONDARY_TRAITS,
  RELATIONSHIP_MODES,
  FORMALITY_VALUES,
  SENTIMENT_VALUES,
  MINTYOU_AUDIT,
  type DnaPrimaryType,
  type DnaSecondaryTrait,
  type RelationshipMode,
  type FormalityValue,
  type SentimentValue,
} from '../contracts.js';
import { getMintYouAiClient } from '../runtime-mod.js';
import { synthesizeDna } from '../pipeline/dna-synthesize.js';
import { emitMintYouLog, createMintYouFlowId } from '../logging.js';
import { PersonaCard } from './persona-card.js';
import { ErrorBanner } from './error-banner.js';

export function StepPreviewCard() {
  const { t } = useModTranslation('mint-you');
  const store = useMintYouStore();
  const {
    traitResult,
    dnaSynthesis,
    basicInfo,
    selectedInterests,
    traitOverrides,
    referenceImageUrl,
    error,
    routeOverride,
  } = store;
  const [resynthesizing, setResynthesizing] = useState(false);
  const [editingPrimary, setEditingPrimary] = useState(false);
  const [editingSecondary, setEditingSecondary] = useState(false);

  if (!traitResult || !dnaSynthesis || !basicInfo) return null;

  const effectivePrimary = traitOverrides?.dnaPrimary ?? traitResult.dnaPrimary;
  const effectiveSecondary = traitOverrides?.dnaSecondary ?? traitResult.dnaSecondary;
  const effectiveRelationship = traitOverrides?.relationshipMode ?? traitResult.relationshipMode;
  const effectiveFormality = traitOverrides?.formality ?? traitResult.formality;
  const effectiveSentiment = traitOverrides?.sentiment ?? traitResult.sentiment;

  const handlePrimaryChange = (primary: DnaPrimaryType) => {
    store.setTraitOverrides({
      ...traitOverrides,
      dnaPrimary: primary,
    });
    setEditingPrimary(false);
    emitMintYouLog({
      message: MINTYOU_AUDIT.TRAIT_OVERRIDE,
      source: 'StepPreviewCard',
      details: { field: 'dnaPrimary', value: primary },
    });
  };

  const handleSecondaryToggle = (trait: DnaSecondaryTrait) => {
    const current = traitOverrides?.dnaSecondary ?? [...traitResult.dnaSecondary];
    const updated = current.includes(trait)
      ? current.filter(t => t !== trait)
      : current.length < 3
        ? [...current, trait]
        : current;
    store.setTraitOverrides({
      ...traitOverrides,
      dnaSecondary: updated,
    });
  };

  const handleRelationshipChange = (mode: RelationshipMode) => {
    store.setTraitOverrides({ ...traitOverrides, relationshipMode: mode });
    emitMintYouLog({
      message: MINTYOU_AUDIT.TRAIT_OVERRIDE,
      source: 'StepPreviewCard',
      details: { field: 'relationshipMode', value: mode },
    });
  };

  const handleFormalityChange = (value: FormalityValue) => {
    store.setTraitOverrides({ ...traitOverrides, formality: value });
    emitMintYouLog({
      message: MINTYOU_AUDIT.TRAIT_OVERRIDE,
      source: 'StepPreviewCard',
      details: { field: 'formality', value },
    });
  };

  const handleSentimentChange = (value: SentimentValue) => {
    store.setTraitOverrides({ ...traitOverrides, sentiment: value });
    emitMintYouLog({
      message: MINTYOU_AUDIT.TRAIT_OVERRIDE,
      source: 'StepPreviewCard',
      details: { field: 'sentiment', value },
    });
  };

  const handleResynthesize = useCallback(async () => {
    if (!basicInfo || !traitResult) return;
    setResynthesizing(true);
    store.setError(null);

    const flowId = createMintYouFlowId('resynthesis');
    emitMintYouLog({ message: MINTYOU_AUDIT.RESYNTHESIS_TRIGGERED, flowId, source: 'StepPreviewCard' });

    const effectiveTraitResult = {
      ...traitResult,
      dnaPrimary: traitOverrides?.dnaPrimary ?? traitResult.dnaPrimary,
      dnaSecondary: traitOverrides?.dnaSecondary ?? traitResult.dnaSecondary,
      relationshipMode: traitOverrides?.relationshipMode ?? traitResult.relationshipMode,
      formality: traitOverrides?.formality ?? traitResult.formality,
      sentiment: traitOverrides?.sentiment ?? traitResult.sentiment,
    };

    const aiClient = getMintYouAiClient();
    const result = await synthesizeDna({
      aiClient,
      basicInfo,
      traitResult: effectiveTraitResult,
      interests: selectedInterests,
      routeOverride,
    });

    setResynthesizing(false);

    if (result.ok) {
      store.setDnaSynthesis(result.data);
    } else {
      store.setError(result.error);
    }
  }, [basicInfo, traitResult, traitOverrides, selectedInterests, routeOverride, store]);

  const hasOverrides = traitOverrides && (
    traitOverrides.dnaPrimary !== undefined
    || traitOverrides.dnaSecondary !== undefined
    || traitOverrides.relationshipMode !== undefined
    || traitOverrides.formality !== undefined
    || traitOverrides.sentiment !== undefined
  );

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Convert to base64 data URL for local preview and session persistence.
    // NOTE: For the CreateAgentDto, the backend expects a persistent URL
    // (e.g. from a CDN upload). When a platform file upload API becomes
    // available, this should be replaced with a real upload call.
    // Until then, referenceImageUrl is omitted from the DTO if it is a
    // data: or blob: URL (see dto-assemble.ts).
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      store.setReferenceImageUrl(dataUrl);
      emitMintYouLog({ message: MINTYOU_AUDIT.PHOTO_UPLOADED, source: 'StepPreviewCard' });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <h2 className="text-lg font-semibold text-gray-900">{t('Preview.title')}</h2>

      <PersonaCard
        displayName={basicInfo.displayName}
        dnaPrimary={effectivePrimary}
        dnaSecondary={effectiveSecondary}
        mbti={dnaSynthesis.personality.mbti}
        greeting={dnaSynthesis.greeting}
        personalitySummary={dnaSynthesis.personality.summary}
        formality={effectiveFormality}
        sentiment={effectiveSentiment}
        relationshipMode={effectiveRelationship}
        interests={selectedInterests}
        referenceImageUrl={referenceImageUrl}
      />

      {/* Edit Traits */}
      <div className="rounded-lg border border-gray-200 p-3">
        <h3 className="mb-2 text-sm font-medium text-gray-700">{t('Preview.editTraits')}</h3>

        {/* Primary archetype editor */}
        <div className="mb-2">
          <button
            onClick={() => setEditingPrimary(!editingPrimary)}
            className="text-xs text-[#4ECCA3] hover:underline"
          >
            {t('Preview.changePrimary')}: {effectivePrimary}
          </button>
          {editingPrimary && (
            <div className="mt-1 flex flex-wrap gap-1">
              {PRIMARY_ARCHETYPES.map((arch) => (
                <button
                  key={arch}
                  onClick={() => handlePrimaryChange(arch)}
                  className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                    effectivePrimary === arch
                      ? 'border-[#4ECCA3] bg-[#4ECCA3] text-white'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {arch}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Secondary traits editor */}
        <div className="mb-3">
          <button
            onClick={() => setEditingSecondary(!editingSecondary)}
            className="text-xs text-[#4ECCA3] hover:underline"
          >
            {t('Preview.changeSecondary')}: {effectiveSecondary.join(', ')}
          </button>
          {editingSecondary && (
            <div className="mt-1 flex flex-wrap gap-1">
              {SECONDARY_TRAITS.map((trait) => (
                <button
                  key={trait}
                  onClick={() => handleSecondaryToggle(trait)}
                  className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                    effectiveSecondary.includes(trait)
                      ? 'border-[#4ECCA3] bg-[#4ECCA3] text-white'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {trait}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Relationship mode editor */}
        <div className="mb-2">
          <p className="mb-1 text-xs text-gray-500">{t('Preview.relationshipMode')}</p>
          <div className="flex gap-1">
            {RELATIONSHIP_MODES.map((mode) => (
              <button
                key={mode}
                onClick={() => handleRelationshipChange(mode)}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-xs transition-colors ${
                  effectiveRelationship === mode
                    ? 'border-[#4ECCA3] bg-[#4ECCA3]/10 font-medium text-[#4ECCA3]'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Formality editor */}
        <div className="mb-2">
          <p className="mb-1 text-xs text-gray-500">{t('Preview.formality')}</p>
          <div className="flex gap-1">
            {FORMALITY_VALUES.map((val) => (
              <button
                key={val}
                onClick={() => handleFormalityChange(val)}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-xs transition-colors ${
                  effectiveFormality === val
                    ? 'border-[#4ECCA3] bg-[#4ECCA3]/10 font-medium text-[#4ECCA3]'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {val}
              </button>
            ))}
          </div>
        </div>

        {/* Sentiment editor */}
        <div className="mb-2">
          <p className="mb-1 text-xs text-gray-500">{t('Preview.sentiment')}</p>
          <div className="flex gap-1">
            {SENTIMENT_VALUES.map((val) => (
              <button
                key={val}
                onClick={() => handleSentimentChange(val)}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-xs transition-colors ${
                  effectiveSentiment === val
                    ? 'border-[#4ECCA3] bg-[#4ECCA3]/10 font-medium text-[#4ECCA3]'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {val}
              </button>
            ))}
          </div>
        </div>

        {hasOverrides && (
          <button
            onClick={handleResynthesize}
            disabled={resynthesizing}
            className="mt-2 rounded-lg bg-[#4ECCA3] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3DBB92] disabled:opacity-50"
          >
            {resynthesizing ? t('Preview.resynthesizing') : t('Preview.regenerate')}
          </button>
        )}
      </div>

      {/* Photo upload */}
      <div className="rounded-lg border border-dashed border-gray-300 p-3">
        <label className="flex cursor-pointer flex-col items-center gap-2 text-center">
          <span className="text-sm text-gray-500">{t('Preview.photoUpload')}</span>
          <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
          <span className="rounded-lg border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50">
            {t('Preview.chooseFile')}
          </span>
        </label>
      </div>

      {error && <ErrorBanner error={error} onDismiss={() => store.setError(null)} />}

      {/* Navigation */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={() => store.goBack()}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          {t('Common.back')}
        </button>
        <button
          onClick={() => store.goNext()}
          disabled={resynthesizing}
          className="flex-1 rounded-lg bg-[#4ECCA3] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#3DBB92] disabled:opacity-50"
        >
          {t('Preview.next')}
        </button>
      </div>
    </div>
  );
}
