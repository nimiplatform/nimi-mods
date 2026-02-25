import type { WorldStudioWorkspaceSnapshot } from '../../contracts.js';
import { syncSnapshot } from './normalize.js';

const DEFAULT_SNAPSHOT: WorldStudioWorkspaceSnapshot = {
  panel: {
    searchText: '',
    selectedWorldId: '',
    selectedDraftId: '',
    activeMaintainTab: 'WORLD',
  },
  createStep: 'SOURCE',
  sourceText: '',
  sourceRef: '',
  worldPatch: {},
  worldviewPatch: {},
  eventsDraft: {
    primary: [],
    secondary: [],
  },
  lorebooksDraft: [],
  futureEventsText: '[]',
  selectedStartTimeId: '',
  selectedCharacters: [],
  parseJob: {
    phase: 'idle',
    chunkTotal: 0,
    chunkProcessed: 0,
    chunkCompleted: 0,
    chunkFailed: 0,
    progress: 0,
    etaSeconds: null,
    startedAt: null,
    updatedAt: null,
  },
  knowledgeGraph: {
    worldSetting: '',
    timeline: [],
    locations: [],
    characters: [],
    events: {
      primary: [],
      secondary: [],
    },
    characterRelations: [],
    futureHistoricalEvents: [],
    narrativeArc: null,
    characterProfiles: [],
    characterAliasMap: {},
  },
  phase1Artifact: null,
  assets: {
    worldCover: { status: 'idle', imageUrl: null },
    characterPortraits: {},
    locationImages: {},
  },
  agentSync: {
    selectedCharacterIds: [],
    ownershipType: 'WORLD_OWNED',
    targetWorldId: '',
    draftsByCharacter: {},
  },
  eventGraphLayout: {
    selectedEventId: '',
    expandedPrimaryIds: [],
  },
  embeddingIndex: {
    status: 'idle',
    lastBuiltAt: null,
    routeSource: null,
    routeModel: null,
    entries: {},
    errorMessage: null,
  },
  taskState: {
    activeTask: null,
    recentTasks: [],
    expertMode: false,
  },
  editorSnapshotVersion: '',
  unsavedChangesByPanel: {
    world: false,
    worldview: false,
    events: false,
    lorebooks: false,
  },
};

export function cloneDefaultSnapshot(): WorldStudioWorkspaceSnapshot {
  return syncSnapshot({
    ...DEFAULT_SNAPSHOT,
    panel: { ...DEFAULT_SNAPSHOT.panel },
    worldPatch: {},
    worldviewPatch: {},
    eventsDraft: {
      primary: [],
      secondary: [],
    },
    lorebooksDraft: [],
    selectedCharacters: [],
    parseJob: { ...DEFAULT_SNAPSHOT.parseJob },
    knowledgeGraph: {
      ...DEFAULT_SNAPSHOT.knowledgeGraph,
      timeline: [],
      locations: [],
      characters: [],
      events: {
        primary: [],
        secondary: [],
      },
      characterRelations: [],
      futureHistoricalEvents: [],
      narrativeArc: null,
      characterProfiles: [],
      characterAliasMap: {},
    },
    phase1Artifact: null,
    assets: {
      worldCover: { ...DEFAULT_SNAPSHOT.assets.worldCover },
      characterPortraits: {},
      locationImages: {},
    },
    agentSync: {
      ...DEFAULT_SNAPSHOT.agentSync,
      selectedCharacterIds: [],
      draftsByCharacter: {},
    },
    eventGraphLayout: { ...DEFAULT_SNAPSHOT.eventGraphLayout, expandedPrimaryIds: [] },
    embeddingIndex: {
      ...DEFAULT_SNAPSHOT.embeddingIndex,
      entries: {},
    },
    taskState: {
      activeTask: null,
      recentTasks: [],
      expertMode: false,
    },
    unsavedChangesByPanel: { ...DEFAULT_SNAPSHOT.unsavedChangesByPanel },
  });
}
