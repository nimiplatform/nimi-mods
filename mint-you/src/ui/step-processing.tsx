import React, { useEffect, useCallback } from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import { useMintYouStore } from '../state/mint-you-store.js';
import { getMintYouRuntimeClient } from '../runtime-mod.js';
import { extractTraitsFromInterview } from '../pipeline/trait-extract.js';
import { synthesizeDna } from '../pipeline/dna-synthesize.js';
import { emitMintYouLog, createMintYouFlowId } from '../logging.js';
import { MINTYOU_AUDIT } from '../contracts.js';
import type { MintYouError } from '../types.js';
import { ErrorBanner } from './error-banner.js';

const DNA_SYNTHESIS_MAX_ATTEMPTS = 3;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryDnaSynthesis(error: MintYouError): boolean {
  const text = `${error.reasonCode} ${error.message} ${error.actionHint}`.toLowerCase();
  return (
    text.includes('timeout')
    || text.includes('timed out')
    || text.includes('deadline')
    || text.includes('unavailable')
    || text.includes('rate')
  );
}

export function StepProcessing() {
  const { t } = useModTranslation('mint-you');
  const store = useMintYouStore();
  const {
    currentStep,
    interviewSignals,
    interviewTurnCount,
    interviewValidTurnCount,
    basicInfo,
    selectedInterests,
    loading,
    error,
    routeBinding,
  } = store;

  const isExtracting = currentStep === 'trait-extract';
  const isSynthesizing = currentStep === 'dna-synthesize';

  const runPipeline = useCallback(async () => {
    if (!basicInfo) return;

    const flowId = createMintYouFlowId('processing');

    if (isExtracting) {
      store.setLoading(true);
      store.setError(null);
      emitMintYouLog({ message: MINTYOU_AUDIT.TRAIT_EXTRACT_STARTED, flowId, source: 'StepProcessing' });

      // Use degraded mode if we hit turn 12 with insufficient valid turns
      const allowIncomplete = interviewTurnCount >= 12 && interviewValidTurnCount < 7;
      const result = extractTraitsFromInterview(interviewSignals, { allowIncomplete });

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

      const runtimeClient = getMintYouRuntimeClient();
      let lastError: MintYouError | null = null;
      for (let attempt = 1; attempt <= DNA_SYNTHESIS_MAX_ATTEMPTS; attempt += 1) {
        const result = await synthesizeDna({
          runtimeClient,
          basicInfo,
          traitResult,
          interests: selectedInterests,
          binding: routeBinding,
        });

        if (result.ok) {
          store.setLoading(false);
          store.setDnaSynthesis(result.data);
          emitMintYouLog({
            message: MINTYOU_AUDIT.DNA_SYNTHESIS_DONE,
            flowId,
            source: 'StepProcessing',
            details: { attempt, maxAttempts: DNA_SYNTHESIS_MAX_ATTEMPTS },
          });
          // Auto-advance to preview-card
          store.goNext();
          return;
        }

        lastError = result.error;
        const retryable = shouldRetryDnaSynthesis(result.error);
        const hasNextAttempt = attempt < DNA_SYNTHESIS_MAX_ATTEMPTS;
        emitMintYouLog({
          level: retryable && hasNextAttempt ? 'warn' : 'error',
          message: MINTYOU_AUDIT.DNA_SYNTHESIS_FAILED,
          flowId,
          source: 'StepProcessing',
          details: {
            attempt,
            maxAttempts: DNA_SYNTHESIS_MAX_ATTEMPTS,
            retryable,
            reasonCode: result.error.reasonCode,
          },
        });

        if (!retryable || !hasNextAttempt) {
          break;
        }
        await delay(attempt * 800);
      }

      store.setLoading(false);
      if (lastError) {
        store.setError(lastError);
      }
    }
  }, [isExtracting, isSynthesizing, basicInfo, interviewSignals, interviewTurnCount, interviewValidTurnCount, selectedInterests, routeBinding, store]);

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
