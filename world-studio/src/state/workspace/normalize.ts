import { asRecord, safeParseArray, safeParseObject } from '@nimiplatform/sdk/mod/utils';
import type {
  ChunkTaskResult,
  EventNodeDraft,
  QualityGateResult,
  WorldStudioEmbeddingIndex,
  WorldStudioEmbeddingIndexEntry,
  WorldLorebookDraftRow,
  WorldStudioAgentDraft,
  WorldStudioAgentLorebookDraft,
  WorldStudioPhase1Artifact,
  WorldStudioTaskCheckpoint,
  WorldStudioTaskRecord,
  WorldStudioTaskState,
  WorldStudioWorkspaceSnapshot,
} from '../../contracts.js';
import { createEmptyFinalDraftAccumulator } from '../../engine/final-draft-accumulator.js';

function defaultQualityMetrics(): QualityGateResult['metrics'] {
  return {
    totalChunks: 0,
    successChunks: 0,
    failedChunks: 0,
    chunkSuccessRatio: 0,
    primaryCount: 0,
    secondaryCount: 0,
    worldSettingCount: 0,
    timelineCount: 0,
    locationsCount: 0,
    charactersCount: 0,
    characterRelationsCount: 0,
    futureEventsCount: 0,
    primaryEvidenceCoverage: 0,
    eventCharacterCoverage: 0,
    eventLocationCoverage: 0,
    primaryNarrativeCompleteness: 0,
    storyArcCompleteness: 0,
    characterNamePurity: 0,
    characterProfileCoverage: 0,
  };
}

function normalizeQualityGate(value: unknown): QualityGateResult {
  const record = asRecord(value);
  const statusRaw = String(record.status || '').trim().toUpperCase();
  const status = statusRaw === 'PASS' || statusRaw === 'WARN' || statusRaw === 'BLOCK'
    ? statusRaw as QualityGateResult['status']
    : (record.pass ? 'PASS' : 'BLOCK');
  const issues = Array.isArray(record.issues)
    ? record.issues
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const issue = asRecord(item);
        const severityRaw = String(issue.severity || '').trim().toUpperCase();
        const severity: 'BLOCK' | 'WARN' = severityRaw === 'WARN' ? 'WARN' : 'BLOCK';
        return {
          code: String(issue.code || 'WORLD_STUDIO_QUALITY_ISSUE'),
          severity,
          message: String(issue.message || ''),
          ...(typeof issue.detail === 'string' ? { detail: issue.detail } : {}),
        };
      })
    : [];
  const metricsRecord = asRecord(record.metrics);
  const metrics = {
    ...defaultQualityMetrics(),
    totalChunks: Math.max(0, Number(metricsRecord.totalChunks) || 0),
    successChunks: Math.max(0, Number(metricsRecord.successChunks) || 0),
    failedChunks: Math.max(0, Number(metricsRecord.failedChunks) || 0),
    chunkSuccessRatio: Math.max(0, Math.min(1, Number(metricsRecord.chunkSuccessRatio) || 0)),
    primaryCount: Math.max(0, Number(metricsRecord.primaryCount) || 0),
    secondaryCount: Math.max(0, Number(metricsRecord.secondaryCount) || 0),
    worldSettingCount: Math.max(0, Number(metricsRecord.worldSettingCount) || 0),
    timelineCount: Math.max(0, Number(metricsRecord.timelineCount) || 0),
    locationsCount: Math.max(0, Number(metricsRecord.locationsCount) || 0),
    charactersCount: Math.max(0, Number(metricsRecord.charactersCount) || 0),
    characterRelationsCount: Math.max(0, Number(metricsRecord.characterRelationsCount) || 0),
    futureEventsCount: Math.max(0, Number(metricsRecord.futureEventsCount) || 0),
    primaryEvidenceCoverage: Math.max(0, Math.min(1, Number(metricsRecord.primaryEvidenceCoverage) || 0)),
    eventCharacterCoverage: Math.max(0, Math.min(1, Number(metricsRecord.eventCharacterCoverage) || 0)),
    eventLocationCoverage: Math.max(0, Math.min(1, Number(metricsRecord.eventLocationCoverage) || 0)),
    primaryNarrativeCompleteness: Math.max(0, Math.min(1, Number(metricsRecord.primaryNarrativeCompleteness) || 0)),
    storyArcCompleteness: Math.max(0, Math.min(1, Number(metricsRecord.storyArcCompleteness) || 0)),
    characterNamePurity: Math.max(0, Math.min(1, Number(metricsRecord.characterNamePurity) || 0)),
    characterProfileCoverage: Math.max(0, Math.min(1, Number(metricsRecord.characterProfileCoverage) || 0)),
  };
  const reasons = Array.isArray(record.reasons)
    ? record.reasons.map((item) => String(item || '')).filter(Boolean)
    : issues.map((issue) => `${issue.code}: ${issue.message}`).filter(Boolean);
  return {
    status,
    issues,
    pass: status !== 'BLOCK',
    reasons,
    metrics,
  };
}

function normalizeChunkTasks(value: unknown): ChunkTaskResult[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const record = asRecord(item);
      return {
        chunkIndex: Math.max(0, Number(record.chunkIndex) || 0),
        stage: String(record.stage || 'coarse') === 'fine' ? 'fine' : 'coarse',
        status: String(record.status || 'failed') === 'success' ? 'success' : 'failed',
        retryCount: Math.max(0, Number(record.retryCount) || 0),
        ...(typeof record.errorCode === 'string' ? { errorCode: record.errorCode } : {}),
        ...(typeof record.errorMessage === 'string' ? { errorMessage: record.errorMessage } : {}),
      } as ChunkTaskResult;
    });
}

function normalizeNarrativeArc(value: unknown): WorldStudioPhase1Artifact['narrativeArc'] {
  if (!value || typeof value !== 'object') return null;
  const record = asRecord(value);
  const arc = {
    summary: String(record.summary || '').trim(),
    opening: String(record.opening || '').trim(),
    development: String(record.development || '').trim(),
    climax: String(record.climax || '').trim(),
    resolution: String(record.resolution || '').trim(),
  };
  const hasContent = Boolean(arc.summary || arc.opening || arc.development || arc.climax || arc.resolution);
  return hasContent ? arc : null;
}

function normalizePhase1Artifact(value: unknown): WorldStudioPhase1Artifact | null {
  if (!value || typeof value !== 'object') return null;
  const record = asRecord(value);
  return {
    startTimeOptions: Array.isArray(record.startTimeOptions)
      ? record.startTimeOptions
        .filter((item) => item && typeof item === 'object')
        .map((item, index) => {
          const option = asRecord(item);
          return {
            id: String(option.id || `timeline:${index + 1}`),
            label: String(option.label || ''),
            description: String(option.description || ''),
            weight: Math.max(0, Math.min(1, Number(option.weight) || 0.5)),
          };
        })
      : [],
    characterCandidates: Array.isArray(record.characterCandidates)
      ? record.characterCandidates
        .filter((item) => item && typeof item === 'object')
        .map((item) => {
          const candidate = asRecord(item);
          return {
            name: String(candidate.name || '').trim(),
            summary: String(candidate.summary || '').trim(),
            significance: Math.max(0, Math.min(1, Number(candidate.significance) || 0.5)),
          };
        })
        .filter((item) => Boolean(item.name))
      : [],
    qualityGate: normalizeQualityGate(record.qualityGate),
    chunkTasks: normalizeChunkTasks(record.chunkTasks),
    narrativeArc: normalizeNarrativeArc(record.narrativeArc),
    sourceDigest: String(record.sourceDigest || ''),
    updatedAt: String(record.updatedAt || new Date().toISOString()),
  };
}

function normalizeAgentDraft(value: unknown): WorldStudioAgentDraft | null {
  if (!value || typeof value !== 'object') return null;
  const record = asRecord(value);
  const characterName = String(record.characterName || '').trim();
  if (!characterName) return null;
  const normalizeNullableString = (input: unknown): string | null => {
    if (input == null) return null;
    const text = String(input || '').trim();
    return text.length > 0 ? text : null;
  };
  const normalizeAgentRules = (input: unknown): WorldStudioAgentDraft['rules'] | undefined => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
    const ruleRecord = asRecord(input);
    if (String(ruleRecord.format || '').trim() !== 'rule-lines-v1') return undefined;
    const lines = normalizeStringArray(ruleRecord.lines);
    return {
      format: 'rule-lines-v1',
      lines,
      text: lines.join('\n'),
    };
  };
  const normalizeWakeStrategy = (input: unknown): WorldStudioAgentDraft['wakeStrategy'] | undefined => {
    const text = String(input || '').trim().toUpperCase();
    if (text === 'PASSIVE' || text === 'PROACTIVE') {
      return text;
    }
    return undefined;
  };
  const normalizeStringArray = (input: unknown): string[] => {
    if (!Array.isArray(input)) return [];
    return input.map((item) => String(item || '').trim()).filter(Boolean);
  };
  const normalizeAgentLorebooks = (input: unknown): WorldStudioAgentLorebookDraft[] => {
    if (!Array.isArray(input)) return [];
    return input
      .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
      .map((item) => {
        const entry = asRecord(item);
        return {
          name: String(entry.name || '').trim(),
          content: String(entry.content || '').trim(),
          keywords: normalizeStringArray(entry.keywords),
          ...(Number.isFinite(Number(entry.priority))
            ? { priority: Number(entry.priority) }
            : {}),
          ...(Number.isFinite(Number(entry.insertionOrder))
            ? { insertionOrder: Number(entry.insertionOrder) }
            : {}),
          ...(typeof entry.constant === 'boolean' ? { constant: entry.constant } : {}),
          ...(typeof entry.selective === 'boolean' ? { selective: entry.selective } : {}),
          ...(Array.isArray(entry.secondaryKeys)
            ? { secondaryKeys: normalizeStringArray(entry.secondaryKeys) }
            : {}),
          ...(typeof entry.enabled === 'boolean' ? { enabled: entry.enabled } : {}),
          ...(entry.source == null
            ? {}
            : { source: normalizeNullableString(entry.source) }),
        } as WorldStudioAgentLorebookDraft;
      })
      .filter((entry) => Boolean(entry.name || entry.content));
  };
  const dna = record.dna && typeof record.dna === 'object' && !Array.isArray(record.dna)
    ? (record.dna as WorldStudioAgentDraft['dna'])
    : undefined;
  const hasDnaField = Object.prototype.hasOwnProperty.call(record, 'dna');
  const hasRulesField = Object.prototype.hasOwnProperty.call(record, 'rules');
  const normalizedRules = normalizeAgentRules(record.rules);
  const normalizedWakeStrategy = normalizeWakeStrategy(record.wakeStrategy);
  return {
    characterName,
    handle: String(record.handle || '').trim(),
    concept: String(record.concept || '').trim(),
    backstory: String(record.backstory || '').trim(),
    coreValues: String(record.coreValues || '').trim(),
    relationshipStyle: String(record.relationshipStyle || '').trim(),
    ...(Object.prototype.hasOwnProperty.call(record, 'description')
      ? { description: normalizeNullableString(record.description) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(record, 'scenario')
      ? { scenario: normalizeNullableString(record.scenario) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(record, 'greeting')
      ? { greeting: normalizeNullableString(record.greeting) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(record, 'exampleDialogue')
      ? { exampleDialogue: normalizeNullableString(record.exampleDialogue) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(record, 'systemPromptBase')
      ? { systemPromptBase: normalizeNullableString(record.systemPromptBase) }
      : {}),
    ...(hasRulesField && normalizedRules
      ? { rules: normalizedRules }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(record, 'postHistoryInstructions')
      ? { postHistoryInstructions: normalizeNullableString(record.postHistoryInstructions) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(record, 'referenceImageUrl')
      ? { referenceImageUrl: normalizeNullableString(record.referenceImageUrl) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(record, 'wakeStrategy') && normalizedWakeStrategy
      ? { wakeStrategy: normalizedWakeStrategy }
      : {}),
    ...(Array.isArray(record.alternateGreetings)
      ? { alternateGreetings: normalizeStringArray(record.alternateGreetings) }
      : {}),
    ...(Array.isArray(record.agentLorebooks)
      ? { agentLorebooks: normalizeAgentLorebooks(record.agentLorebooks) }
      : {}),
    ...(typeof record.dnaPrimary === 'string' ? { dnaPrimary: record.dnaPrimary } : {}),
    ...(Array.isArray(record.dnaSecondary)
      ? { dnaSecondary: record.dnaSecondary.map((item) => String(item || '')).filter(Boolean) }
      : {}),
    ...(dna ? { dna } : (hasDnaField ? { dna: undefined } : {})),
  };
}

function normalizeFinalDraftAccumulator(value: unknown): WorldStudioWorkspaceSnapshot['finalDraftAccumulator'] {
  const base = createEmptyFinalDraftAccumulator();
  const record = asRecord(value);
  const agentDraftsByCharacter = Object.entries(asRecord(record.agentDraftsByCharacter)).reduce((acc, [key, draft]) => {
    const normalized = normalizeAgentDraft(draft);
    if (!normalized) return acc;
    acc[String(key)] = normalized;
    return acc;
  }, {} as Record<string, WorldStudioAgentDraft>);

  return {
    ...base,
    world: asRecord(record.world),
    worldview: asRecord(record.worldview),
    worldLorebooks: Array.isArray(record.worldLorebooks)
      ? record.worldLorebooks.filter((item) => item && typeof item === 'object').map((item) => asRecord(item))
      : [],
    futureHistoricalEvents: Array.isArray(record.futureHistoricalEvents)
      ? record.futureHistoricalEvents.filter((item) => item && typeof item === 'object').map((item) => asRecord(item))
      : [],
    agentDraftsByCharacter,
    revisions: Array.isArray(record.revisions)
      ? record.revisions
        .filter((item) => item && typeof item === 'object')
        .map((item) => {
          const revision = asRecord(item);
          return {
            chunkIndex: Number.isInteger(Number(revision.chunkIndex)) ? Number(revision.chunkIndex) : -1,
            appliedAt: String(revision.appliedAt || new Date().toISOString()),
            changedFields: Array.isArray(revision.changedFields)
              ? revision.changedFields.map((field) => String(field || '').trim()).filter(Boolean)
              : [],
            ...(typeof revision.note === 'string' && revision.note.trim().length > 0
              ? { note: revision.note.trim() }
              : {}),
          };
        })
      : [],
    lastUpdatedChunk: Number.isInteger(Number(record.lastUpdatedChunk))
      ? Number(record.lastUpdatedChunk)
      : -1,
  };
}

function normalizeEmbeddingVector(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item));
}

function normalizeEmbeddingIndexEntry(value: unknown): WorldStudioEmbeddingIndexEntry | null {
  if (!value || typeof value !== 'object') return null;
  const record = asRecord(value);
  const text = String(record.text || '').trim();
  const vector = normalizeEmbeddingVector(record.vector);
  if (!text || vector.length === 0) return null;
  return {
    text,
    vector,
    dimensions: Math.max(1, Number(record.dimensions) || vector.length),
    updatedAt: String(record.updatedAt || new Date().toISOString()),
  };
}

function normalizeEmbeddingIndex(value: unknown): WorldStudioEmbeddingIndex {
  const record = asRecord(value);
  const statusRaw = String(record.status || '').trim();
  const status = statusRaw === 'building' || statusRaw === 'ready' || statusRaw === 'failed'
    ? statusRaw
    : 'idle';
  const routeSourceRaw = String(record.routeSource || '').trim();
  const routeSource = routeSourceRaw === 'local-runtime' || routeSourceRaw === 'token-api'
    ? routeSourceRaw
    : null;
  const entriesRecord = asRecord(record.entries);
  const entries = Object.entries(entriesRecord).reduce((acc, [key, value]) => {
    const normalized = normalizeEmbeddingIndexEntry(value);
    if (!normalized) return acc;
    acc[String(key)] = normalized;
    return acc;
  }, {} as Record<string, WorldStudioEmbeddingIndexEntry>);
  return {
    status,
    lastBuiltAt: record.lastBuiltAt ? String(record.lastBuiltAt) : null,
    routeSource,
    routeModel: record.routeModel ? String(record.routeModel) : null,
    entries,
    errorMessage: record.errorMessage ? String(record.errorMessage) : null,
  };
}

export function normalizeEventsDraft(value: unknown): { primary: EventNodeDraft[]; secondary: EventNodeDraft[] } {
  const record = asRecord(value);
  return {
    primary: Array.isArray(record.primary)
      ? record.primary.filter((item) => item && typeof item === 'object') as EventNodeDraft[]
      : [],
    secondary: Array.isArray(record.secondary)
      ? record.secondary.filter((item) => item && typeof item === 'object') as EventNodeDraft[]
      : [],
  };
}

export function parseEventsDraftFromText(text: string): { primary: EventNodeDraft[]; secondary: EventNodeDraft[] } {
  return normalizeEventsDraft(safeParseObject(text));
}

export function normalizeLorebooksDraft(value: unknown): WorldLorebookDraftRow[] {
  const items = Array.isArray(value) ? value : [];
  return items
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const record = asRecord(item);
      return {
        ...(typeof record.id === 'string' ? { id: record.id } : {}),
        key: String(record.key || ''),
        ...(typeof record.name === 'string' ? { name: record.name } : {}),
        ...(typeof record.content === 'string' ? { content: record.content } : {}),
        value: record.value && typeof record.value === 'object' && !Array.isArray(record.value)
          ? asRecord(record.value) : undefined,
        ...(Array.isArray(record.keywords) ? { keywords: record.keywords.map(String) } : {}),
        ...(typeof record.priority === 'number' ? { priority: record.priority } : {}),
        ...(typeof record.constant === 'boolean' ? { constant: record.constant } : {}),
        ...(typeof record.enabled === 'boolean' ? { enabled: record.enabled } : {}),
        ...(typeof record.validFrom === 'string' ? { validFrom: record.validFrom } : {}),
        ...(typeof record.validTo === 'string' ? { validTo: record.validTo } : {}),
        ...(record.provenance && typeof record.provenance === 'object' && !Array.isArray(record.provenance)
          ? { provenance: record.provenance as Record<string, unknown> }
          : {}),
      } as WorldLorebookDraftRow;
    });
}

export function parseLorebooksDraftFromText(text: string): WorldLorebookDraftRow[] {
  return normalizeLorebooksDraft(safeParseArray(text));
}

const TERMINAL_TASK_STATUSES = new Set([
  'CANCELED',
  'FAILED',
  'COMPLETED',
] as const);

const LIVE_TASK_STATUSES = new Set([
  'RUNNING',
  'PAUSE_REQUESTED',
  'PAUSED',
  'CANCEL_REQUESTED',
] as const);

function normalizeTaskRecord(value: unknown): WorldStudioTaskRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = asRecord(value);
  const status = String(record.status || 'FAILED') as WorldStudioTaskRecord['status'];
  const allowedStatus = (
    LIVE_TASK_STATUSES.has(status as never)
    || TERMINAL_TASK_STATUSES.has(status as never)
  ) ? status : 'FAILED';
  const checkpointRecord = record.checkpoint && typeof record.checkpoint === 'object'
    ? asRecord(record.checkpoint)
    : null;
  const checkpointStep = String(checkpointRecord?.step || 'SOURCE') as WorldStudioTaskCheckpoint['step'];
  return {
    id: String(record.id || ''),
    kind: String(record.kind || 'CREATE_PHASE1') as WorldStudioTaskRecord['kind'],
    status: allowedStatus,
    label: String(record.label || 'Task'),
    atomic: Boolean(record.atomic),
    resumable: Boolean(record.resumable),
    canPause: Boolean(record.canPause),
    canResume: Boolean(record.canResume),
    canCancel: Boolean(record.canCancel),
    progress: Math.max(0, Math.min(1, Number(record.progress) || 0)),
    startedAt: String(record.startedAt || new Date().toISOString()),
    updatedAt: String(record.updatedAt || new Date().toISOString()),
    finishedAt: record.finishedAt ? String(record.finishedAt) : null,
    message: record.message == null ? null : String(record.message),
    errorMessage: record.errorMessage == null ? null : String(record.errorMessage),
    errorCode: record.errorCode == null ? null : String(record.errorCode),
    checkpoint: checkpointRecord
      ? {
        checkpointVersion: Math.max(1, Number(checkpointRecord.checkpointVersion) || 1),
        step: checkpointStep,
        chunkTotal: Number.isFinite(Number(checkpointRecord.chunkTotal))
          ? Number(checkpointRecord.chunkTotal)
          : undefined,
        chunkCompleted: Number.isFinite(Number(checkpointRecord.chunkCompleted))
          ? Number(checkpointRecord.chunkCompleted)
          : undefined,
        chunkFailed: Number.isFinite(Number(checkpointRecord.chunkFailed))
          ? Number(checkpointRecord.chunkFailed)
          : undefined,
        payload: checkpointRecord.payload && typeof checkpointRecord.payload === 'object'
          ? asRecord(checkpointRecord.payload)
          : undefined,
      }
      : null,
  };
}

export function normalizeTaskState(value: unknown): WorldStudioTaskState {
  const record = asRecord(value);
  const activeTask = normalizeTaskRecord(record.activeTask);
  const recentTasks = Array.isArray(record.recentTasks)
    ? record.recentTasks
      .map((item) => normalizeTaskRecord(item))
      .filter((item): item is WorldStudioTaskRecord => Boolean(item))
      .slice(0, 20)
    : [];
  const normalizedActive = activeTask && LIVE_TASK_STATUSES.has(activeTask.status as never)
    ? activeTask
    : null;
  return {
    activeTask: normalizedActive,
    recentTasks,
    expertMode: Boolean(record.expertMode),
  };
}

export function recoverTaskStateAfterReload(taskState: WorldStudioTaskState): WorldStudioTaskState {
  const activeTask = taskState.activeTask;
  if (!activeTask) return taskState;
  if (!LIVE_TASK_STATUSES.has(activeTask.status as never)) return taskState;
  const recovered: WorldStudioTaskRecord = {
    ...activeTask,
    status: activeTask.resumable ? 'PAUSED' : 'FAILED',
    canPause: false,
    canResume: activeTask.resumable,
    canCancel: activeTask.resumable,
    updatedAt: new Date().toISOString(),
    finishedAt: activeTask.resumable ? null : new Date().toISOString(),
    message: activeTask.resumable
      ? 'Recovered after reload. Resume task to continue.'
      : 'Task stopped after reload and marked failed.',
    errorCode: activeTask.resumable ? activeTask.errorCode : 'WORLD_STUDIO_TASK_RECOVERY_INTERRUPTED',
    errorMessage: activeTask.resumable ? activeTask.errorMessage : 'Task interrupted by page reload.',
  };
  return {
    ...taskState,
    activeTask: recovered,
  };
}

export function syncSnapshot(snapshot: WorldStudioWorkspaceSnapshot): WorldStudioWorkspaceSnapshot {
  const panelInput = asRecord(snapshot.panel);
  const activeMaintainTabRaw = String(panelInput.activeMaintainTab || 'WORLD').toUpperCase();
  const activeMaintainTab = (
    activeMaintainTabRaw === 'WORLD'
    || activeMaintainTabRaw === 'WORLDVIEW'
    || activeMaintainTabRaw === 'EVENTS'
    || activeMaintainTabRaw === 'LOREBOOKS'
    || activeMaintainTabRaw === 'MUTATIONS'
  )
    ? activeMaintainTabRaw as WorldStudioWorkspaceSnapshot['panel']['activeMaintainTab']
    : 'WORLD';
  const panel: WorldStudioWorkspaceSnapshot['panel'] = {
    searchText: String(panelInput.searchText || ''),
    selectedWorldId: String(panelInput.selectedWorldId || ''),
    selectedDraftId: String(panelInput.selectedDraftId || ''),
    activeMaintainTab,
  };
  const worldPatch = asRecord(snapshot.worldPatch);
  const worldviewPatch = asRecord(snapshot.worldviewPatch);
  const eventsDraft = normalizeEventsDraft(
    (snapshot.eventsDraft && (snapshot.eventsDraft.primary.length > 0 || snapshot.eventsDraft.secondary.length > 0))
      ? snapshot.eventsDraft
      : (snapshot.knowledgeGraph?.events || {}),
  );
  const lorebooksDraft = normalizeLorebooksDraft(snapshot.lorebooksDraft || []);
  const taskState = normalizeTaskState(snapshot.taskState || {});
  const phase1Artifact = normalizePhase1Artifact(snapshot.phase1Artifact);
  const parseJob = {
    ...snapshot.parseJob,
    chunkTotal: Math.max(0, Number(snapshot.parseJob?.chunkTotal) || 0),
    chunkProcessed: Math.max(
      0,
      Number(snapshot.parseJob?.chunkProcessed) || (Number(snapshot.parseJob?.chunkCompleted) || 0) + (Number(snapshot.parseJob?.chunkFailed) || 0),
    ),
    chunkCompleted: Math.max(0, Number(snapshot.parseJob?.chunkCompleted) || 0),
    chunkFailed: Math.max(0, Number(snapshot.parseJob?.chunkFailed) || 0),
    progress: Math.max(0, Math.min(1, Number(snapshot.parseJob?.progress) || 0)),
  };
  const agentSyncDraftsInput = asRecord(snapshot.agentSync?.draftsByCharacter);
  const draftsByCharacter = Object.entries(agentSyncDraftsInput).reduce((acc, [key, value]) => {
    const normalized = normalizeAgentDraft(value);
    if (!normalized) return acc;
    acc[key] = normalized;
    return acc;
  }, {} as Record<string, WorldStudioAgentDraft>);
  const embeddingIndex = normalizeEmbeddingIndex(snapshot.embeddingIndex || {});
  const finalDraftAccumulator = normalizeFinalDraftAccumulator(snapshot.finalDraftAccumulator || {});

  return {
    ...snapshot,
    panel,
    parseJob,
    worldPatch,
    worldviewPatch,
    eventsDraft,
    lorebooksDraft,
    phase1Artifact,
    taskState,
    knowledgeGraph: {
      ...snapshot.knowledgeGraph,
      events: eventsDraft,
    },
    finalDraftAccumulator,
    agentSync: {
      ...snapshot.agentSync,
      draftsByCharacter,
    },
    embeddingIndex,
  };
}
