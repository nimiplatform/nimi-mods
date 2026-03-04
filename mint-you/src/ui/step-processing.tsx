import React, { useEffect, useCallback } from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import { useMintYouStore } from '../state/mint-you-store.js';
import { getMintYouAiClient } from '../runtime-mod.js';
import { extractTraits } from '../pipeline/trait-extract.js';
import { synthesizeDna } from '../pipeline/dna-synthesize.js';
import { emitMintYouLog, createMintYouFlowId } from '../logging.js';
import { MINTYOU_AUDIT } from '../contracts.js';
import { ErrorBanner } from './error-banner.js';

export function StepProcessing() {
  const { t } = useModTranslation('mint-you');
  const store = useMintYouStore();
  const { currentStep, scenarioChoices, basicInfo, selectedInterests, loading, error } = store;

  const isExtracting = currentStep === 'trait-extract';
  const isSynthesizing = currentStep === 'dna-synthesize';

  const runPipeline = useCallback(async () => {
    if (!basicInfo) return;

    const flowId = createMintYouFlowId('processing');

    if (isExtracting) {
      store.setLoading(true);
      store.setError(null);
      emitMintYouLog({ message: MINTYOU_AUDIT.TRAIT_EXTRACT_STARTED, flowId, source: 'StepProcessing' });

      const result = extractTraits(scenarioChoices);

      if (result.ok) {
        store.setTraitResult(result.data);
        emitMintYouLog({ message: MINTYOU_AUDIT.TRAIT_EXTRACT_DONE, flowId, source: 'StepProcessing' });
        store.setLoading(false);
        // Auto-advance to dna-synthesize
        store.goNext();
      } else {
        store.setLoading(false);
        store.setError(result.error);
      }
    } else if (isSynthesizing) {
      const traitResult = store.traitResult;
      if (!traitResult) return;

      store.setLoading(true);
      store.setError(null);
      emitMintYouLog({ message: MINTYOU_AUDIT.DNA_SYNTHESIS_STARTED, flowId, source: 'StepProcessing' });

      const aiClient = getMintYouAiClient();
      const result = await synthesizeDna({
        aiClient,
        basicInfo,
        traitResult,
        interests: selectedInterests,
      });

      store.setLoading(false);

      if (result.ok) {
        store.setDnaSynthesis(result.data);
        emitMintYouLog({ message: MINTYOU_AUDIT.DNA_SYNTHESIS_DONE, flowId, source: 'StepProcessing' });
        // Auto-advance to preview-card
        store.goNext();
      } else {
        emitMintYouLog({ level: 'error', message: MINTYOU_AUDIT.DNA_SYNTHESIS_FAILED, flowId, source: 'StepProcessing' });
        store.setError(result.error);
      }
    }
  }, [isExtracting, isSynthesizing, basicInfo, scenarioChoices, selectedInterests, store]);

  useEffect(() => {
    runPipeline();
  }, [currentStep]);

  const handleRetry = () => {
    runPipeline();
  };

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-6 p-8">
      {loading && (
        <>
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-[#4ECCA3]" />
          <p className="text-sm text-gray-600">
            {isExtracting ? t('Processing.extracting') : t('Processing.synthesizing')}
          </p>
        </>
      )}

      {error && !loading && (
        <div className="w-full">
          <ErrorBanner error={error} onRetry={handleRetry} />
        </div>
      )}
    </div>
  );
}
