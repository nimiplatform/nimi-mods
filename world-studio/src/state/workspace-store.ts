import { create } from 'zustand';
import { asRecord } from '@nimiplatform/sdk/mod/utils';
import type {
  FinalDraftAccumulator,
  EventNodeDraft,
  WorldStudioCreateStep,
  WorldStudioSnapshotPatch,
  WorldStudioWorkspaceSnapshot,
} from '../contracts.js';
import { cloneDefaultSnapshot } from './workspace/defaults.js';
import { syncSnapshot } from './workspace/normalize.js';
import { persistSnapshotToStorage, readSnapshotFromStorage } from './workspace/storage.js';
import { emitWorldStudioLog } from '../logging.js';

type WorldStudioWorkspaceStore = {
  snapshot: WorldStudioWorkspaceSnapshot;
  setCreateStep: (step: WorldStudioCreateStep) => void;
  patchSnapshot: (patch: WorldStudioSnapshotPatch) => void;
  patchPanel: (patch: Partial<WorldStudioWorkspaceSnapshot['panel']>) => void;
  hydrateForUser: (userId: string) => void;
  persistForUser: (userId: string) => void;
  resetSnapshot: () => void;
};

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

function normalizeStringArray(value: unknown[]): string[] {
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

function arraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function computeArrayDiff(before: string[], after: string[]): { added: string[]; removed: string[] } {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    added: after.filter((item) => !beforeSet.has(item)),
    removed: before.filter((item) => !afterSet.has(item)),
  };
}

function captureCallerStack(maxFrames = 8): string[] {
  const stack = String(new Error().stack || '').split('\n').map((line) => line.trim()).filter(Boolean);
  return stack.slice(2, 2 + maxFrames);
}

export const useWorldStudioWorkspaceStore = create<WorldStudioWorkspaceStore>((set, get) => ({
  snapshot: cloneDefaultSnapshot(),
  setCreateStep: (step) => set((state) => ({
    snapshot: {
      ...state.snapshot,
      createStep: step,
    },
  })),
  patchSnapshot: (patch) => set((state) => {
    const previousSelectedCharacters = normalizeStringArray(state.snapshot.selectedCharacters);
    const previousAgentSyncSelectedCharacterIds = normalizeStringArray(state.snapshot.agentSync.selectedCharacterIds);
    const patchRecord = asRecord(patch);
    const patchAgentSyncRecord = patch.agentSync && typeof patch.agentSync === 'object'
      ? asRecord(patch.agentSync)
      : {};
    const patchSelectedCharacters = Array.isArray(patch.selectedCharacters)
      ? normalizeStringArray(patch.selectedCharacters)
      : null;
    const patchAgentSyncSelectedCharacterIds = Array.isArray(patchAgentSyncRecord.selectedCharacterIds)
      ? normalizeStringArray(patchAgentSyncRecord.selectedCharacterIds as unknown[])
      : null;
    const stackFrames = captureCallerStack();

    const snapshot = syncSnapshot({
      ...state.snapshot,
      ...patch,
      panel: {
        ...state.snapshot.panel,
        ...(patch.panel || {}),
      },
      parseJob: {
        ...state.snapshot.parseJob,
        ...(patch.parseJob || {}),
      },
      knowledgeGraph: {
        ...state.snapshot.knowledgeGraph,
        ...(patch.knowledgeGraph || {}),
        events: {
          ...state.snapshot.knowledgeGraph.events,
          ...((patch.knowledgeGraph as {
            events?: {
              primary?: EventNodeDraft[];
              secondary?: EventNodeDraft[];
            };
          } | undefined)?.events || {}),
        },
      },
      eventsDraft: {
        primary: Array.isArray(patch.eventsDraft?.primary)
          ? patch.eventsDraft.primary as EventNodeDraft[]
          : state.snapshot.eventsDraft.primary,
        secondary: Array.isArray(patch.eventsDraft?.secondary)
          ? patch.eventsDraft.secondary as EventNodeDraft[]
          : state.snapshot.eventsDraft.secondary,
      },
      lorebooksDraft: Array.isArray(patch.lorebooksDraft)
        ? patch.lorebooksDraft as WorldStudioWorkspaceSnapshot['lorebooksDraft']
        : state.snapshot.lorebooksDraft,
      assets: {
        worldCover: {
          ...state.snapshot.assets.worldCover,
          ...((patch.assets?.worldCover || {}) as Partial<WorldStudioWorkspaceSnapshot['assets']['worldCover']>),
        },
        characterPortraits: {
          ...state.snapshot.assets.characterPortraits,
          ...((patch.assets?.characterPortraits || {}) as WorldStudioWorkspaceSnapshot['assets']['characterPortraits']),
        },
        locationImages: {
          ...state.snapshot.assets.locationImages,
          ...((patch.assets?.locationImages || {}) as WorldStudioWorkspaceSnapshot['assets']['locationImages']),
        },
      },
      agentSync: {
        ...state.snapshot.agentSync,
        ...(patch.agentSync || {}),
        draftsByCharacter: (() => {
          const current = state.snapshot.agentSync.draftsByCharacter;
          const incoming = patch.agentSync && typeof patch.agentSync === 'object'
            ? asRecord((patch.agentSync as { draftsByCharacter?: unknown }).draftsByCharacter)
            : null;
          if (!incoming) return current;
          const merged = { ...current };
          Object.entries(incoming).forEach(([name, value]) => {
            const normalizedName = String(name || '').trim();
            if (!normalizedName || !value || typeof value !== 'object') return;
            const record = asRecord(value);
            const hasDnaField = Object.prototype.hasOwnProperty.call(record, 'dna');
            const previous = merged[normalizedName] || {
              characterName: normalizedName,
              handle: '',
              concept: '',
              backstory: '',
              coreValues: '',
              relationshipStyle: '',
            };
            const nextRecord = {
              ...previous,
              ...record,
              characterName: normalizedName,
              handle: String(record.handle ?? previous.handle ?? ''),
              concept: String(record.concept ?? previous.concept ?? ''),
              backstory: String(record.backstory ?? previous.backstory ?? ''),
              coreValues: String(record.coreValues ?? previous.coreValues ?? ''),
              relationshipStyle: String(record.relationshipStyle ?? previous.relationshipStyle ?? ''),
            };
            if (hasDnaField && (!record.dna || typeof record.dna !== 'object' || Array.isArray(record.dna))) {
              delete (nextRecord as Record<string, unknown>).dna;
            }
            merged[normalizedName] = nextRecord;
          });
          return merged;
        })(),
      },
      eventGraphLayout: {
        ...state.snapshot.eventGraphLayout,
        ...(patch.eventGraphLayout || {}),
      },
      embeddingIndex: {
        ...state.snapshot.embeddingIndex,
        ...(patch.embeddingIndex || {}),
        entries: (() => {
          if (!patch.embeddingIndex || typeof patch.embeddingIndex !== 'object') {
            return state.snapshot.embeddingIndex.entries;
          }
          const record = patch.embeddingIndex as { entries?: unknown };
          if (!Object.prototype.hasOwnProperty.call(record, 'entries')) {
            return state.snapshot.embeddingIndex.entries;
          }
          return asRecord(record.entries) as WorldStudioWorkspaceSnapshot['embeddingIndex']['entries'];
        })(),
      },
      finalDraftAccumulator: (() => {
        if (!patch.finalDraftAccumulator || typeof patch.finalDraftAccumulator !== 'object') {
          return state.snapshot.finalDraftAccumulator;
        }
        const incoming = patch.finalDraftAccumulator as Partial<FinalDraftAccumulator>;
        return {
          ...state.snapshot.finalDraftAccumulator,
          ...incoming,
          world: incoming.world && typeof incoming.world === 'object'
            ? asRecord(incoming.world)
            : state.snapshot.finalDraftAccumulator.world,
          worldview: incoming.worldview && typeof incoming.worldview === 'object'
            ? asRecord(incoming.worldview)
            : state.snapshot.finalDraftAccumulator.worldview,
          worldLorebooks: Array.isArray(incoming.worldLorebooks)
            ? incoming.worldLorebooks as FinalDraftAccumulator['worldLorebooks']
            : state.snapshot.finalDraftAccumulator.worldLorebooks,
          futureHistoricalEvents: Array.isArray(incoming.futureHistoricalEvents)
            ? incoming.futureHistoricalEvents as FinalDraftAccumulator['futureHistoricalEvents']
            : state.snapshot.finalDraftAccumulator.futureHistoricalEvents,
          agentDraftsByCharacter: incoming.agentDraftsByCharacter && typeof incoming.agentDraftsByCharacter === 'object'
            ? asRecord(incoming.agentDraftsByCharacter) as FinalDraftAccumulator['agentDraftsByCharacter']
            : state.snapshot.finalDraftAccumulator.agentDraftsByCharacter,
          revisions: Array.isArray(incoming.revisions)
            ? incoming.revisions as FinalDraftAccumulator['revisions']
            : state.snapshot.finalDraftAccumulator.revisions,
          lastUpdatedChunk: Number.isInteger(Number(incoming.lastUpdatedChunk))
            ? Number(incoming.lastUpdatedChunk)
            : state.snapshot.finalDraftAccumulator.lastUpdatedChunk,
        };
      })(),
      taskState: {
        ...state.snapshot.taskState,
        ...(patch.taskState || {}),
        recentTasks: Array.isArray(patch.taskState?.recentTasks)
          ? patch.taskState.recentTasks as WorldStudioWorkspaceSnapshot['taskState']['recentTasks']
          : state.snapshot.taskState.recentTasks,
      },
      editorSnapshotVersion: typeof patch.editorSnapshotVersion === 'string'
        ? patch.editorSnapshotVersion
        : state.snapshot.editorSnapshotVersion,
      unsavedChangesByPanel: {
        ...state.snapshot.unsavedChangesByPanel,
        ...(patch.unsavedChangesByPanel || {}),
      },
      selectedCharacters: Array.isArray(patch.selectedCharacters)
        ? patch.selectedCharacters.map((item) => String(item || '')).filter((item) => item.length > 0)
        : state.snapshot.selectedCharacters,
    });

    const nextSelectedCharacters = normalizeStringArray(snapshot.selectedCharacters);
    const nextAgentSyncSelectedCharacterIds = normalizeStringArray(snapshot.agentSync.selectedCharacterIds);
    const selectedCharactersChanged = !arraysEqual(previousSelectedCharacters, nextSelectedCharacters);
    const agentSyncSelectedChanged = !arraysEqual(previousAgentSyncSelectedCharacterIds, nextAgentSyncSelectedCharacterIds);
    const shouldLogSelectionPatch = Boolean(
      patchSelectedCharacters
      || patchAgentSyncSelectedCharacterIds
      || selectedCharactersChanged
      || agentSyncSelectedChanged,
    );

    if (shouldLogSelectionPatch) {
      const selectedDiff = computeArrayDiff(previousSelectedCharacters, nextSelectedCharacters);
      const agentSyncDiff = computeArrayDiff(previousAgentSyncSelectedCharacterIds, nextAgentSyncSelectedCharacterIds);
      const sourceHint = patchSelectedCharacters && patchAgentSyncSelectedCharacterIds
        ? 'dual-selection-patch'
        : patchSelectedCharacters
          ? 'selected-characters-patch'
          : patchAgentSyncSelectedCharacterIds
            ? 'agent-sync-selected-ids-patch'
            : 'indirect-selection-change';
      diagLog('patchSnapshot selection mutation', {
        sourceHint,
        patchKeys: Object.keys(patchRecord).sort(),
        patchAgentSyncKeys: Object.keys(patchAgentSyncRecord).sort(),
        patchSelectedCharacters,
        patchAgentSyncSelectedCharacterIds,
        beforeSelectedCharacters: previousSelectedCharacters,
        afterSelectedCharacters: nextSelectedCharacters,
        selectedCharactersAdded: selectedDiff.added,
        selectedCharactersRemoved: selectedDiff.removed,
        beforeAgentSyncSelectedCharacterIds: previousAgentSyncSelectedCharacterIds,
        afterAgentSyncSelectedCharacterIds: nextAgentSyncSelectedCharacterIds,
        agentSyncSelectedCharacterIdsAdded: agentSyncDiff.added,
        agentSyncSelectedCharacterIdsRemoved: agentSyncDiff.removed,
        createStepBefore: state.snapshot.createStep,
        createStepAfter: snapshot.createStep,
        stackFrames,
      });
    }

    return { snapshot };
  }),
  patchPanel: (patch) => set((state) => ({
    snapshot: {
      ...state.snapshot,
      panel: {
        ...state.snapshot.panel,
        ...patch,
      },
    },
  })),
  hydrateForUser: (userId) => {
    const loaded = readSnapshotFromStorage(userId);
    if (loaded) {
      set({ snapshot: loaded });
    } else {
      set({ snapshot: cloneDefaultSnapshot() });
    }
  },
  persistForUser: (userId) => {
    persistSnapshotToStorage(userId, get().snapshot);
  },
  resetSnapshot: () => set({ snapshot: cloneDefaultSnapshot() }),
}));
