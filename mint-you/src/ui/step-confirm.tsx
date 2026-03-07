import React, { useCallback, useEffect } from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import { useMintYouStore } from '../state/mint-you-store.js';
import { useOasisWorldQuery } from '../hooks/use-oasis-world-query.js';
import { MINTYOU_REASON, MINTYOU_AUDIT } from '../contracts.js';
import { getMintYouHookClient } from '../runtime-mod.js';
import { createAgent } from '../pipeline/agent-create.js';
import { emitMintYouLog, createMintYouFlowId } from '../logging.js';
import { PersonaCard } from './persona-card.js';
import { ErrorBanner } from './error-banner.js';

export function StepConfirm() {
  const { t } = useModTranslation('mint-you');
  const store = useMintYouStore();
  const {
    basicInfo, traitResult, dnaSynthesis, selectedInterests,
    traitOverrides, referenceImageUrl, worldId, error, loading,
  } = store;
  const { world: oasisWorld, loading: oasisLoading, error: oasisError } = useOasisWorldQuery();

  if (!basicInfo || !traitResult || !dnaSynthesis) return null;

  const effectivePrimary = traitOverrides?.dnaPrimary ?? traitResult.dnaPrimary;
  const effectiveSecondary = traitOverrides?.dnaSecondary ?? traitResult.dnaSecondary;
  const effectiveRelationshipMode = traitOverrides?.relationshipMode ?? traitResult.relationshipMode;
  const effectiveFormality = traitOverrides?.formality ?? traitResult.formality;
  const effectiveSentiment = traitOverrides?.sentiment ?? traitResult.sentiment;
  const oasisWorldId = oasisWorld?.id ?? '';
  const oasisWorldName = oasisWorld?.name || 'OASIS';

  useEffect(() => {
    if (oasisWorldId && worldId !== oasisWorldId) {
      store.setWorldId(oasisWorldId);
    }
  }, [oasisWorldId, store, worldId]);

  const handleConfirm = useCallback(async () => {
    if (!oasisWorldId) {
      store.setError({
        reasonCode: MINTYOU_REASON.WORLD_NOT_SELECTED,
        message: 'OASIS world is unavailable.',
        actionHint: 'Retry after runtime world data is ready.',
      });
      return;
    }

    store.setConfirmed(true);
    store.setLoading(true);
    store.setError(null);
    store.goNext(); // Move to agent-create step

    const flowId = createMintYouFlowId('agent-create');
    emitMintYouLog({ message: MINTYOU_AUDIT.AGENT_CREATE_STARTED, flowId, source: 'StepConfirm' });

    const hookClient = getMintYouHookClient();
    const result = await createAgent({
      hookClient,
      basicInfo,
      traitResult,
      dnaSynthesis,
      interests: selectedInterests,
      worldId: oasisWorldId,
      referenceImageUrl,
      traitOverrides,
      existingAgentId: store.createdAgentId,
    });

    store.setLoading(false);

    if (result.ok) {
      store.setCreatedAgentId(result.data.agentId);
      emitMintYouLog({ message: MINTYOU_AUDIT.AGENT_CREATE_DONE, flowId, source: 'StepConfirm', details: { agentId: result.data.agentId } });
    } else {
      store.setError(result.error);
      emitMintYouLog({ level: 'error', message: MINTYOU_AUDIT.AGENT_CREATE_FAILED, flowId, source: 'StepConfirm', details: { reasonCode: result.error.reasonCode } });
    }
  }, [oasisWorldId, basicInfo, traitResult, dnaSynthesis, selectedInterests, referenceImageUrl, traitOverrides, store]);

  return (
    <div className="mx-auto my-4 max-w-lg space-y-4 p-4">
      <h2 className="text-lg font-semibold text-gray-900">{t('Confirm.title')}</h2>

      {/* Compact persona card */}
      <PersonaCard
        displayName={basicInfo.displayName}
        dnaPrimary={effectivePrimary}
        dnaSecondary={effectiveSecondary}
        mbti={dnaSynthesis.personality.mbti}
        greeting={dnaSynthesis.greeting}
        personalitySummary={dnaSynthesis.personality.summary}
        formality={effectiveFormality}
        sentiment={effectiveSentiment}
        relationshipMode={effectiveRelationshipMode}
        interests={selectedInterests}
        referenceImageUrl={referenceImageUrl}
        compact
      />

      {/* Fixed world target: OASIS */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          {t('Confirm.worldLabel')}
        </label>
        <input
          value={oasisWorldName}
          readOnly
          disabled={oasisLoading}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#4ECCA3] focus:outline-none focus:ring-1 focus:ring-[#4ECCA3]"
        />
        <p className="mt-1 text-xs text-gray-500">{t('Confirm.worldFixedHint')}</p>
        {oasisError && (
          <p className="mt-1 text-xs text-red-600">{oasisError}</p>
        )}
      </div>

      {error && (
        <ErrorBanner error={error} onDismiss={() => store.setError(null)} />
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={() => store.goBack()}
          className="ui-sync-btn ui-sync-btn-secondary rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          {t('Common.back')}
        </button>
        <button
          onClick={handleConfirm}
          disabled={loading || oasisLoading || !oasisWorldId}
          className="ui-sync-btn ui-sync-btn-primary flex-1 rounded-lg bg-[#4ECCA3] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#3DBB92] disabled:opacity-50"
        >
          {loading ? t('Confirm.creating') : t('Confirm.createAgent')}
        </button>
      </div>
    </div>
  );
}
