import { asRecord, loadLocalStorageJson, safeParseObject, saveLocalStorageJson } from '@nimiplatform/sdk/mod/utils';
import type { WorldStudioWorkspaceSnapshot } from '../../contracts.js';
import { cloneDefaultSnapshot } from './defaults.js';
import {
  normalizeEventsDraft,
  normalizeLorebooksDraft,
  parseEventsDraftFromText,
  parseLorebooksDraftFromText,
  recoverTaskStateAfterReload,
  syncSnapshot,
  normalizeTaskState,
} from './normalize.js';
import { emitWorldStudioLog } from '../../logging.js';

const STORAGE_PREFIX_V3 = 'nimi.world-studio.workspace.v3.';

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

function storageKeyForUser(userId: string): string {
  return `${STORAGE_PREFIX_V3}${String(userId || '').trim()}`;
}

export function readSnapshotFromStorage(userId: string): WorldStudioWorkspaceSnapshot | null {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId || typeof window === 'undefined') return null;

  try {
    const parsed = loadLocalStorageJson<Partial<WorldStudioWorkspaceSnapshot> | null>(
      storageKeyForUser(normalizedUserId),
      null,
      (value) => (value && typeof value === 'object' ? (value as Partial<WorldStudioWorkspaceSnapshot>) : null),
    );

    if (!parsed) {
      diagLog('storage read: no snapshot found', {
        userId: normalizedUserId,
      });
      return null;
    }
    const base = cloneDefaultSnapshot();
    const parsedWorldPatchRaw = asRecord(parsed.worldPatch);
    const parsedWorldviewPatchRaw = asRecord(parsed.worldviewPatch);
    const parsedWorldPatch = Object.keys(parsedWorldPatchRaw).length > 0
      ? parsedWorldPatchRaw
      : safeParseObject(String(parsed.worldPatchText || '{}'));
    const parsedWorldviewPatch = Object.keys(parsedWorldviewPatchRaw).length > 0
      ? parsedWorldviewPatchRaw
      : safeParseObject(String(parsed.worldviewPatchText || '{}'));
    const parsedEventsDraftRaw = normalizeEventsDraft(parsed.eventsDraft || {});
    const parsedEventsFromText = parseEventsDraftFromText(String(parsed.eventsText || ''));
    const parsedKnowledgeEvents = normalizeEventsDraft(
      (parsed.knowledgeGraph as { events?: { primary?: unknown[]; secondary?: unknown[] } } | undefined)?.events || {},
    );
    const parsedEventsDraft =
      (parsedEventsDraftRaw.primary.length > 0 || parsedEventsDraftRaw.secondary.length > 0)
        ? parsedEventsDraftRaw
        : (
          (parsedEventsFromText.primary.length > 0 || parsedEventsFromText.secondary.length > 0)
            ? parsedEventsFromText
            : parsedKnowledgeEvents
        );
    const parsedLorebooksDraftRaw = normalizeLorebooksDraft(parsed.lorebooksDraft || []);
    const parsedLorebooksDraft = parsedLorebooksDraftRaw.length > 0
      ? parsedLorebooksDraftRaw
      : parseLorebooksDraftFromText(String(parsed.lorebooksText || ''));

    const snapshot: WorldStudioWorkspaceSnapshot = {
      ...base,
      ...parsed,
      panel: {
        ...base.panel,
        ...(parsed.panel || {}),
      },
      selectedCharacters: Array.isArray(parsed.selectedCharacters)
        ? parsed.selectedCharacters.map((item) => String(item || '')).filter(Boolean)
        : [],
      parseJob: {
        ...base.parseJob,
        ...(parsed.parseJob || {}),
      },
      knowledgeGraph: {
        ...base.knowledgeGraph,
        ...(parsed.knowledgeGraph || {}),
        events: parsedEventsDraft,
      },
      worldPatch: parsedWorldPatch,
      worldviewPatch: parsedWorldviewPatch,
      eventsDraft: parsedEventsDraft,
      lorebooksDraft: parsedLorebooksDraft,
      phase1Artifact: parsed.phase1Artifact || null,
      assets: {
        ...base.assets,
        ...(parsed.assets || {}),
      },
      agentSync: {
        ...base.agentSync,
        ...(parsed.agentSync || {}),
        selectedCharacterIds: Array.isArray(parsed.agentSync?.selectedCharacterIds)
          ? parsed.agentSync.selectedCharacterIds.map((item) => String(item || '')).filter(Boolean)
          : [],
        draftsByCharacter: (
          parsed.agentSync && typeof parsed.agentSync === 'object'
            ? asRecord((parsed.agentSync as { draftsByCharacter?: unknown }).draftsByCharacter)
            : {}
        ) as WorldStudioWorkspaceSnapshot['agentSync']['draftsByCharacter'],
      },
      eventGraphLayout: {
        ...base.eventGraphLayout,
        ...(parsed.eventGraphLayout || {}),
        expandedPrimaryIds: Array.isArray(parsed.eventGraphLayout?.expandedPrimaryIds)
          ? parsed.eventGraphLayout.expandedPrimaryIds.map((item) => String(item || '')).filter(Boolean)
          : [],
      },
      editorSnapshotVersion: String(parsed.editorSnapshotVersion || ''),
      unsavedChangesByPanel: {
        ...base.unsavedChangesByPanel,
        ...(parsed.unsavedChangesByPanel || {}),
      },
      taskState: normalizeTaskState(parsed.taskState || {}),
    };
    const synced = syncSnapshot(snapshot);
    diagLog('storage read: snapshot recovered', {
      userId: normalizedUserId,
      selectedCharactersCount: synced.selectedCharacters.length,
      agentSyncSelectedCharacterIdsCount: synced.agentSync.selectedCharacterIds.length,
      agentSyncDraftKeys: Object.keys(synced.agentSync.draftsByCharacter || {}),
      agentSyncDraftCoverage: Object.entries(synced.agentSync.draftsByCharacter || {}).map(([name, draft]) => {
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
      parsePhase: synced.parseJob.phase,
      createStep: synced.createStep,
      finalDraftAccumulator: {
        worldKeys: Object.keys(asRecord(synced.finalDraftAccumulator.world || {})),
        worldviewKeys: Object.keys(asRecord(synced.finalDraftAccumulator.worldview || {})),
        lorebookCount: Array.isArray(synced.finalDraftAccumulator.worldLorebooks)
          ? synced.finalDraftAccumulator.worldLorebooks.length
          : 0,
        futureEventCount: Array.isArray(synced.finalDraftAccumulator.futureHistoricalEvents)
          ? synced.finalDraftAccumulator.futureHistoricalEvents.length
          : 0,
        agentDraftKeys: Object.keys(synced.finalDraftAccumulator.agentDraftsByCharacter || {}),
        revisionCount: Array.isArray(synced.finalDraftAccumulator.revisions)
          ? synced.finalDraftAccumulator.revisions.length
          : 0,
        lastUpdatedChunk: synced.finalDraftAccumulator.lastUpdatedChunk,
      },
    });
    return {
      ...synced,
      taskState: recoverTaskStateAfterReload(synced.taskState),
    };
  } catch (error) {
    diagLog('storage read failed', {
      userId: normalizedUserId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export function persistSnapshotToStorage(userId: string, snapshot: WorldStudioWorkspaceSnapshot): void {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId || typeof window === 'undefined') return;

  const synced = syncSnapshot(snapshot);
  const {
    worldPatchText: _worldPatchText,
    worldviewPatchText: _worldviewPatchText,
    eventsText: _eventsText,
    lorebooksText: _lorebooksText,
    ...persistable
  } = synced;
  saveLocalStorageJson(storageKeyForUser(normalizedUserId), persistable);
  diagLog('storage persist snapshot', {
    userId: normalizedUserId,
    parsePhase: synced.parseJob.phase,
    createStep: synced.createStep,
    selectedCharactersCount: synced.selectedCharacters.length,
    agentSyncSelectedCharacterIdsCount: synced.agentSync.selectedCharacterIds.length,
    agentSyncDraftKeys: Object.keys(synced.agentSync.draftsByCharacter || {}),
    agentSyncDraftCoverage: Object.entries(synced.agentSync.draftsByCharacter || {}).map(([name, draft]) => {
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
    finalDraftAccumulator: {
      worldKeys: Object.keys(asRecord(synced.finalDraftAccumulator.world || {})),
      worldviewKeys: Object.keys(asRecord(synced.finalDraftAccumulator.worldview || {})),
      lorebookCount: Array.isArray(synced.finalDraftAccumulator.worldLorebooks)
        ? synced.finalDraftAccumulator.worldLorebooks.length
        : 0,
      futureEventCount: Array.isArray(synced.finalDraftAccumulator.futureHistoricalEvents)
        ? synced.finalDraftAccumulator.futureHistoricalEvents.length
        : 0,
      agentDraftKeys: Object.keys(synced.finalDraftAccumulator.agentDraftsByCharacter || {}),
      revisionCount: Array.isArray(synced.finalDraftAccumulator.revisions)
        ? synced.finalDraftAccumulator.revisions.length
        : 0,
      lastUpdatedChunk: synced.finalDraftAccumulator.lastUpdatedChunk,
    },
  });
}
