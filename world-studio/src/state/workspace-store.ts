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

type WorldStudioWorkspaceStore = {
  snapshot: WorldStudioWorkspaceSnapshot;
  setCreateStep: (step: WorldStudioCreateStep) => void;
  patchSnapshot: (patch: WorldStudioSnapshotPatch) => void;
  patchPanel: (patch: Partial<WorldStudioWorkspaceSnapshot['panel']>) => void;
  hydrateForUser: (userId: string) => void;
  persistForUser: (userId: string) => void;
  resetSnapshot: () => void;
};

export const useWorldStudioWorkspaceStore = create<WorldStudioWorkspaceStore>((set, get) => ({
  snapshot: cloneDefaultSnapshot(),
  setCreateStep: (step) => set((state) => ({
    snapshot: {
      ...state.snapshot,
      createStep: step,
    },
  })),
  patchSnapshot: (patch) => set((state) => ({
    snapshot: syncSnapshot({
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
    }),
  })),
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
