import { asRecord } from '@nimiplatform/sdk/mod/utils';
import {
  parseLorebooksArrayInput,
  toUniqueStringArray,
} from '../../../services/snapshot-normalize.js';
import { resolveWorldOwnedAgentHandle } from '../../../services/agent-handle.js';
import { emitWorldStudioLog } from '../../../logging.js';
import type { WorldStudioCreateActionsInput } from './types.js';

type DraftTaskOptions = {
  taskId?: string;
};

// >>> DIAG helper: remove after debugging <<<
function diagLog(message: string, details?: Record<string, unknown>) {
  try {
    emitWorldStudioLog({
      level: 'error',
      message: `[MODS-TEST-DIAG] ${message}`,
      source: 'DIAG',
      details,
    });
  } catch {
    // Ignore diagnostics sink failures in non-runtime environments (tests, headless execution).
  }
}

function toNullableTrimmedString(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value || '').trim();
  return text.length > 0 ? text : null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function normalizeAgentRules(value: unknown): { format: 'rule-lines-v1'; lines: string[]; text: string } | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = asRecord(value);
  if (String(record.format || '').trim() !== 'rule-lines-v1') return undefined;
  const lines = normalizeStringArray(record.lines);
  return {
    format: 'rule-lines-v1',
    lines,
    text: lines.join('\n'),
  };
}

function normalizeWakeStrategy(value: unknown): 'PASSIVE' | 'PROACTIVE' | undefined {
  const text = String(value || '').trim().toUpperCase();
  if (text === 'PASSIVE' || text === 'PROACTIVE') {
    return text;
  }
  return undefined;
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
  return false;
}

function listProducedAgentDraftFields(draft: Record<string, unknown>): string[] {
  return Object.entries(draft)
    .filter(([, value]) => hasMeaningfulValue(value))
    .map(([key]) => key)
    .sort();
}

export async function saveWorldDraft(
  input: WorldStudioCreateActionsInput,
  _options?: DraftTaskOptions,
): Promise<void> {
  const started = input.taskController.startTask({
    kind: 'CREATE_SAVE_DRAFT',
    label: 'Save draft',
    atomic: true,
    resumable: false,
    canPause: false,
    canCancel: false,
    step: 'DRAFT',
    message: 'Saving draft',
  });
  if (!started) {
    input.setError('WORLD_STUDIO_TASK_CONFLICT: another task is running.');
    return;
  }

  input.setError(null);
  input.setNotice(null);
  try {
    const futureHistoricalEvents = parseLorebooksArrayInput(input.snapshot.futureEventsText);
    const draftPayload = {
      world: input.snapshot.worldPatch,
      worldview: input.snapshot.worldviewPatch,
      events: input.snapshot.eventsDraft,
      worldLorebooks: input.snapshot.lorebooksDraft,
      futureHistoricalEvents,
      finalDraftAccumulator: input.snapshot.finalDraftAccumulator,
      agentSync: {
        selectedCharacterIds: toUniqueStringArray(input.snapshot.agentSync.selectedCharacterIds),
        ownershipType: 'WORLD_OWNED' as const,
        targetWorldId: String(input.snapshot.agentSync.targetWorldId || ''),
        draftsByCharacter: input.snapshot.agentSync.draftsByCharacter,
      },
    };
    const pipelineState = {
      checkpoint: 'REVIEWED',
      selectedStartTimeId: input.snapshot.selectedStartTimeId,
      selectedCharacters: input.snapshot.selectedCharacters,
      parseJob: input.snapshot.parseJob,
    };

    // >>> DIAG: snapshot state at save time <<<
    diagLog('saveWorldDraft called', {
      selectedDraftId: input.selectedDraftId || null,
      selectedWorldId: input.selectedWorldId || null,
      selectedCharacters: input.snapshot.selectedCharacters,
      agentSyncSelectedCharacterIds: input.snapshot.agentSync.selectedCharacterIds,
      agentSyncDraftsByCharacterKeys: Object.keys(input.snapshot.agentSync.draftsByCharacter || {}),
      agentSyncDraftFieldCoverage: Object.entries(input.snapshot.agentSync.draftsByCharacter || {}).map(([name, draft]) => {
        const record = asRecord(draft);
        const ruleLines = asRecord(record.rules).lines;
        return {
          name,
          fields: Object.keys(record).sort(),
          hasDna: Boolean(record.dna && typeof record.dna === 'object'),
          ruleCount: Array.isArray(ruleLines) ? ruleLines.length : 0,
          agentLorebookCount: Array.isArray(record.agentLorebooks) ? record.agentLorebooks.length : 0,
        };
      }),
      agentSyncOwnershipType: input.snapshot.agentSync.ownershipType,
      finalDraftAccumulator: {
        worldKeys: Object.keys(asRecord(input.snapshot.finalDraftAccumulator.world || {})),
        worldviewKeys: Object.keys(asRecord(input.snapshot.finalDraftAccumulator.worldview || {})),
        lorebookCount: input.snapshot.finalDraftAccumulator.worldLorebooks.length,
        futureEventCount: input.snapshot.finalDraftAccumulator.futureHistoricalEvents.length,
        agentDraftKeys: Object.keys(input.snapshot.finalDraftAccumulator.agentDraftsByCharacter || {}),
        revisionCount: input.snapshot.finalDraftAccumulator.revisions.length,
        lastUpdatedChunk: input.snapshot.finalDraftAccumulator.lastUpdatedChunk,
      },
      pipelineStateSelectedCharacters: pipelineState.selectedCharacters,
    });

    const saved = asRecord(await input.mutations.saveDraftMutation.mutateAsync({
      draftId: input.selectedDraftId || undefined,
      sourceType: input.sourceMode === 'FILE' ? 'FILE' : 'TEXT',
      sourceRef: input.snapshot.sourceRef || 'inline:text',
      status: 'READY',
      pipelineState,
      draftPayload,
      targetWorldId: input.selectedWorldId || undefined,
    }));
    const draftId = String(saved.id || input.selectedDraftId || '').trim();
    if (!draftId) {
      throw new Error('WORLD_DRAFT_SAVE_FAILED: missing draft id');
    }

    // >>> DIAG: save result <<<
    diagLog('saveWorldDraft success', { draftId });

    input.patchPanel({ selectedDraftId: draftId });
    input.patchSnapshot({
      unsavedChangesByPanel: {
        world: false,
        worldview: false,
        events: false,
        lorebooks: false,
      },
    });
    input.setCreateStep('PUBLISH');
    input.setNotice(`Draft ${draftId} saved.`);
    input.setStatusBanner({ kind: 'success', message: `Draft ${draftId} saved` });
    input.taskController.completeTask(started.taskId, `Draft ${draftId} saved`);
    emitWorldStudioLog({
      level: 'info',
      message: 'world-studio:ui:draft-autosave',
      flowId: input.flowId,
      source: 'WorldStudioPage.onSaveDraft',
      details: { draftId },
    });
  } catch (saveError) {
    // >>> DIAG <<<
    diagLog('saveWorldDraft FAILED', {
      error: saveError instanceof Error ? saveError.message : String(saveError),
    });
    input.taskController.failTask(started.taskId, saveError);
    input.setError(saveError instanceof Error ? saveError.message : String(saveError));
  }
}

export async function publishWorldDraft(
  input: WorldStudioCreateActionsInput,
  _options?: DraftTaskOptions,
): Promise<void> {
  if (!input.selectedDraftId) {
    diagLog('publishWorldDraft ABORTED: no selectedDraftId');
    input.setError('Please save draft before publishing.');
    return;
  }
  const started = input.taskController.startTask({
    kind: 'CREATE_PUBLISH_DRAFT',
    label: 'Publish world draft',
    atomic: true,
    resumable: false,
    canPause: false,
    canCancel: false,
    step: 'PUBLISH',
    message: 'Publishing world draft',
  });
  if (!started) {
    diagLog('publishWorldDraft ABORTED: task conflict');
    input.setError('WORLD_STUDIO_TASK_CONFLICT: another task is running.');
    return;
  }

  // >>> DIAG: full snapshot state at publish entry <<<
  diagLog('publishWorldDraft ENTER', {
    selectedDraftId: input.selectedDraftId,
    selectedWorldId: input.selectedWorldId || null,
    agentSync: {
      selectedCharacterIds: input.snapshot.agentSync.selectedCharacterIds,
      ownershipType: input.snapshot.agentSync.ownershipType,
      targetWorldId: input.snapshot.agentSync.targetWorldId,
      draftsByCharacterKeys: Object.keys(input.snapshot.agentSync.draftsByCharacter || {}),
      draftsByCharacterSample: Object.entries(input.snapshot.agentSync.draftsByCharacter || {}).slice(0, 3).map(([name, draft]) => ({
        name,
        hasHandle: Boolean(draft?.handle),
        hasConcept: Boolean(draft?.concept),
        hasBackstory: Boolean(draft?.backstory),
        hasDna: Boolean(draft?.dna),
        dnaKeys: draft?.dna && typeof draft.dna === 'object' ? Object.keys(draft.dna) : [],
      })),
    },
    selectedCharacters: input.snapshot.selectedCharacters,
    knowledgeGraphCharacterCount: input.snapshot.knowledgeGraph.characters?.length || 0,
    knowledgeGraphCharacterNames: (input.snapshot.knowledgeGraph.characters || []).slice(0, 10).map((c) => asRecord(c).name),
  });

  input.setError(null);
  input.setNotice(null);
  try {
    diagLog('publishDraftMutation calling...', { draftId: input.selectedDraftId });

    const result = asRecord(await input.mutations.publishDraftMutation.mutateAsync({
      draftId: input.selectedDraftId,
      reason: 'Published from World Studio',
    }));

    diagLog('publishDraftMutation returned', {
      resultKeys: Object.keys(result),
      worldId: result.worldId || null,
      draftId: result.draftId || null,
      worldviewVersion: result.worldviewVersion || null,
    });

    const worldId = String(result.worldId || '').trim();
    if (!worldId) {
      diagLog('publishWorldDraft FAILED: missing worldId in result', { result });
      throw new Error('WORLD_PUBLISH_FAILED: missing worldId');
    }

    // Only sync characters the user explicitly selected; never fallback to Phase 1 defaults.
    const syncCharacters = toUniqueStringArray(
      input.snapshot.agentSync.selectedCharacterIds,
    );

    diagLog('agent sync gate check', {
      syncCharactersCount: syncCharacters.length,
      syncCharacters,
      willEnterAgentSync: syncCharacters.length > 0,
    });

    let syncNotice = '';
    if (syncCharacters.length > 0) {
      const characterByName = new Map(
        input.snapshot.knowledgeGraph.characters
          .map((item) => asRecord(item))
          .map((item) => [String(item.name || ''), item] as const),
      );
      const draftByCharacter = input.snapshot.agentSync.draftsByCharacter || {};
      const worldName = String(input.snapshot.worldPatch.name || 'world');

      diagLog('building agent items', {
        characterByNameKeys: Array.from(characterByName.keys()),
        draftByCharacterKeys: Object.keys(draftByCharacter),
        worldName,
        worldId,
      });
      const usedHandleBases = new Set<string>();
      const payloadMode = 'CREATOR_BATCH_CREATE_V2_FULL_PROFILE';
      const compatibilityReports: Array<{
        characterName: string;
        producedFields: string[];
        sentFields: string[];
        agentLorebooksPrepared: number;
        agentLorebooksSkippedEmptyContent: number;
        rulesLineCount: number;
        hasDna: boolean;
      }> = [];

      const items = syncCharacters.map((characterName, index) => {
        const characterRecord = asRecord(characterByName.get(characterName));
        const draft = asRecord(draftByCharacter[characterName]);
        const summary = String(characterRecord.summary || characterRecord.description || '');
        const concept = String(draft.concept || '').trim();
        const backstory = String(draft.backstory || '').trim();
        const coreValues = String(draft.coreValues || '').trim();
        const relationshipStyle = String(draft.relationshipStyle || '').trim();
        const handle = resolveWorldOwnedAgentHandle({
          requestedHandle: draft.handle,
          worldId,
          index,
          usedHandleBases,
        });
        const richConcept = [
          concept || summary || `${characterName} in ${worldName}.`,
          backstory ? `Backstory: ${backstory}` : '',
          coreValues ? `Core values: ${coreValues}` : '',
          relationshipStyle ? `Relationship style: ${relationshipStyle}` : '',
        ].filter(Boolean).join('\n');
        const dna = draft.dna && typeof draft.dna === 'object' ? draft.dna : undefined;
        const normalizedIdentityCard = {
          description: toNullableTrimmedString(draft.description),
          scenario: toNullableTrimmedString(draft.scenario),
          greeting: toNullableTrimmedString(draft.greeting),
          exampleDialogue: toNullableTrimmedString(draft.exampleDialogue),
          systemPromptBase: toNullableTrimmedString(draft.systemPromptBase),
          rules: normalizeAgentRules(draft.rules),
          postHistoryInstructions: toNullableTrimmedString(draft.postHistoryInstructions),
          alternateGreetings: normalizeStringArray(draft.alternateGreetings),
        };
        const normalizedDnaPrimary = toNullableTrimmedString(draft.dnaPrimary);
        const normalizedDnaSecondary = normalizeStringArray(draft.dnaSecondary).slice(0, 3);
        const normalizedWakeStrategy = normalizeWakeStrategy(draft.wakeStrategy);
        const normalizedReferenceImageUrl = toNullableTrimmedString(draft.referenceImageUrl);
        const normalizedAgentLorebooks = Array.isArray(draft.agentLorebooks)
          ? draft.agentLorebooks
            .filter((item) => item && typeof item === 'object')
            .map((item) => {
              const row = asRecord(item);
              return {
                name: toNullableTrimmedString(row.name),
                content: toNullableTrimmedString(row.content),
                keywords: normalizeStringArray(row.keywords),
                priority: Number.isFinite(Number(row.priority)) ? Number(row.priority) : undefined,
                insertionOrder: Number.isFinite(Number(row.insertionOrder)) ? Number(row.insertionOrder) : undefined,
                constant: typeof row.constant === 'boolean' ? row.constant : undefined,
                selective: typeof row.selective === 'boolean' ? row.selective : undefined,
                secondaryKeys: normalizeStringArray(row.secondaryKeys),
                enabled: typeof row.enabled === 'boolean' ? row.enabled : undefined,
                source: toNullableTrimmedString(row.source),
              };
            })
          : [];
        const agentLorebooksSkippedEmptyContent = normalizedAgentLorebooks
          .filter((entry) => !entry.content)
          .length;
        const agentLorebooksPrepared = normalizedAgentLorebooks
          .filter((entry) => Boolean(entry.content))
          .length;
        const agentLorebooksForPayload = normalizedAgentLorebooks
          .filter((entry) => Boolean(entry.content))
          .map((entry) => ({
            ...(entry.name ? { name: entry.name } : {}),
            content: entry.content,
            ...(entry.keywords.length > 0 ? { keywords: entry.keywords } : {}),
            ...(typeof entry.priority === 'number' ? { priority: entry.priority } : {}),
            ...(typeof entry.insertionOrder === 'number' ? { insertionOrder: entry.insertionOrder } : {}),
            ...(typeof entry.constant === 'boolean' ? { constant: entry.constant } : {}),
            ...(typeof entry.selective === 'boolean' ? { selective: entry.selective } : {}),
            ...(entry.secondaryKeys.length > 0 ? { secondaryKeys: entry.secondaryKeys } : {}),
            ...(typeof entry.enabled === 'boolean' ? { enabled: entry.enabled } : {}),
            ...(entry.source ? { source: entry.source } : {}),
          }));
        const producedFields = listProducedAgentDraftFields(draft);

        // >>> DIAG: per-character item detail <<<
        diagLog(`item[${index}] ${characterName}`, {
          characterName,
          handleResolved: handle,
          conceptLength: richConcept.length,
          hasDna: Boolean(dna),
          dnaIdentityName: dna && typeof dna === 'object' ? (dna as Record<string, unknown>).identity : null,
          draftKeys: Object.keys(draft),
          characterRecordKeys: Object.keys(characterRecord),
          summary: summary.slice(0, 100),
          producedFields,
          normalizedIdentityCard,
          agentLorebooksPrepared,
          agentLorebooksSkippedEmptyContent,
        });

        const payload = {
          handle,
          displayName: characterName,
          concept: richConcept,
          ownershipType: 'WORLD_OWNED',
          worldId,
          ...(normalizedIdentityCard.description ? { description: normalizedIdentityCard.description } : {}),
          ...(normalizedIdentityCard.scenario ? { scenario: normalizedIdentityCard.scenario } : {}),
          ...(normalizedIdentityCard.greeting ? { greeting: normalizedIdentityCard.greeting } : {}),
          ...(normalizedIdentityCard.exampleDialogue ? { exampleDialogue: normalizedIdentityCard.exampleDialogue } : {}),
          ...(normalizedIdentityCard.systemPromptBase ? { systemPromptBase: normalizedIdentityCard.systemPromptBase } : {}),
          ...(normalizedIdentityCard.rules ? { rules: normalizedIdentityCard.rules } : {}),
          ...(normalizedIdentityCard.postHistoryInstructions
            ? { postHistoryInstructions: normalizedIdentityCard.postHistoryInstructions }
            : {}),
          alternateGreetings: normalizedIdentityCard.alternateGreetings,
          ...(normalizedReferenceImageUrl ? { referenceImageUrl: normalizedReferenceImageUrl } : {}),
          ...(normalizedWakeStrategy ? { wakeStrategy: normalizedWakeStrategy } : {}),
          ...(normalizedDnaPrimary ? { dnaPrimary: normalizedDnaPrimary } : {}),
          ...(normalizedDnaSecondary.length > 0 ? { dnaSecondary: normalizedDnaSecondary } : {}),
          agentLorebooks: agentLorebooksForPayload,
          ...(dna ? { dna } : {}),
        };
        const sentFields = Object.keys(payload).sort();
        compatibilityReports.push({
          characterName,
          producedFields,
          sentFields,
          agentLorebooksPrepared,
          agentLorebooksSkippedEmptyContent,
          rulesLineCount: normalizedIdentityCard.rules?.lines.length || 0,
          hasDna: Boolean(dna),
        });
        return payload;
      });

      diagLog('batchCreate calling...', {
        payloadMode,
        payloadPolicy: 'Send full canonical agent profile payload aligned with backend CreateAgentDto and SSOT.',
        itemCount: items.length,
        itemHandles: items.map((i) => i.handle),
        itemDisplayNames: items.map((i) => i.displayName),
        itemHasDna: items.map((i) => 'dna' in i),
        agentPayloadSentFields: compatibilityReports.map((item) => ({
          characterName: item.characterName,
          sentFields: item.sentFields,
        })),
        agentPayloadRules: compatibilityReports.map((item) => ({
          characterName: item.characterName,
          rulesLineCount: item.rulesLineCount,
        })),
        agentLorebookStats: compatibilityReports.map((item) => ({
          characterName: item.characterName,
          prepared: item.agentLorebooksPrepared,
          skippedEmptyContent: item.agentLorebooksSkippedEmptyContent,
        })),
      });

      const syncResult = asRecord(await input.mutations.batchCreateCreatorAgentsMutation.mutateAsync({
        items,
        continueOnError: true,
      }));

      diagLog('batchCreate returned', {
        created: syncResult.created,
        failed: syncResult.failed,
        createdCount: Array.isArray(syncResult.created) ? syncResult.created.length : 0,
        failedCount: Array.isArray(syncResult.failed) ? syncResult.failed.length : 0,
      });

      const createdCount = Array.isArray(syncResult.created) ? syncResult.created.length : 0;
      const failedCount = Array.isArray(syncResult.failed) ? syncResult.failed.length : 0;
      syncNotice = ` Agent sync: ${createdCount}/${items.length} created${failedCount > 0 ? `, ${failedCount} failed` : ''}.`;
    } else {
      diagLog('agent sync SKIPPED: syncCharacters is empty');
    }

    input.patchSnapshot({
      agentSync: {
        ...input.snapshot.agentSync,
        targetWorldId: worldId,
      },
    });
    input.setLanding({ target: 'MAINTAIN', worldId, reason: null });
    input.patchPanel({ selectedWorldId: worldId });
    input.setNotice(`Draft published to world ${worldId}.${syncNotice}`);
    input.setStatusBanner({ kind: 'success', message: `World published: ${worldId}` });
    input.taskController.completeTask(started.taskId, `World published: ${worldId}`);

    diagLog('publishWorldDraft COMPLETE', { worldId, syncNotice });

    emitWorldStudioLog({
      level: 'info',
      message: 'world-studio:ui:publish-clicked',
      flowId: input.flowId,
      source: 'WorldStudioPage.onPublishDraft',
      details: { draftId: input.selectedDraftId, worldId },
    });
    await Promise.all([
      input.queries.maintenanceQuery.refetch(),
    ]);
  } catch (publishError) {
    diagLog('publishWorldDraft EXCEPTION', {
      error: publishError instanceof Error ? publishError.message : String(publishError),
      stack: publishError instanceof Error ? publishError.stack?.slice(0, 500) : null,
    });
    input.taskController.failTask(started.taskId, publishError);
    input.setError(publishError instanceof Error ? publishError.message : String(publishError));
  }
}
