import { asRecord, clamp01 } from '@nimiplatform/mod-sdk/utils';
import type {
  Phase1Character,
  Phase1Option,
  QualityGateResult,
  WorldStudioPhase1Artifact,
  WorldStudioWorkspaceSnapshot,
} from '../contracts.js';
import type { Phase1Result } from '../generation/pipeline.js';
import { worldStudioMessage } from '../i18n/messages.js';

function toFallbackStartTimeOptions(snapshot: WorldStudioWorkspaceSnapshot): Phase1Option[] {
  const timelineOptions = (snapshot.knowledgeGraph.timeline || [])
    .map((item, _index) => {
      const record = asRecord(item);
      const label = String(record.label || record.time || '').trim();
      if (!label) return null;
      return {
        id: String(record.id || `timeline:${_index + 1}`),
        label,
        description: String(record.description || ''),
        weight: clamp01(Number(record.weight) || 0.5, 0.5),
      };
    })
    .filter((item): item is Phase1Option => Boolean(item));
  if (timelineOptions.length > 0) return timelineOptions;
  if (snapshot.selectedStartTimeId) {
    return [{
      id: snapshot.selectedStartTimeId,
      label: snapshot.selectedStartTimeId,
      description: 'Recovered from local snapshot.',
      weight: 0.5,
    }];
  }
  return [];
}

function toFallbackCharacterCandidates(snapshot: WorldStudioWorkspaceSnapshot): Phase1Character[] {
  const selected = snapshot.selectedCharacters || [];
  const graphCharacters = (snapshot.knowledgeGraph.characters || [])
    .map((item) => asRecord(item))
    .map((item) => {
      const name = String(item.name || '').trim();
      if (!name) return null;
      return {
        name,
        summary: String(item.summary || item.description || ''),
        significance: clamp01(Number(item.significance) || 0.5, 0.5),
      } satisfies Phase1Character;
    })
    .filter((item): item is Phase1Character => Boolean(item));
  const selectedCandidates = selected.map((name) => ({
    name,
    summary: 'Recovered from selected characters.',
    significance: 0.55,
  }));
  const merged = [...selectedCandidates, ...graphCharacters];
  const seen = new Set<string>();
  return merged.filter((item) => {
    if (!item.name || seen.has(item.name)) return false;
    seen.add(item.name);
    return true;
  }).slice(0, 24);
}

function buildRecoveredQualityGate(snapshot: WorldStudioWorkspaceSnapshot): QualityGateResult {
  const primary = snapshot.knowledgeGraph.events.primary.length;
  const secondary = snapshot.knowledgeGraph.events.secondary.length;
  const totalChunks = Math.max(0, Number(snapshot.parseJob.chunkTotal) || 0);
  const successChunks = Math.max(0, Number(snapshot.parseJob.chunkCompleted) || 0);
  const failedChunks = Math.max(0, Number(snapshot.parseJob.chunkFailed) || 0);
  const status = primary > 0 ? 'WARN' : 'BLOCK';
  const issues = primary > 0
    ? [{
      code: 'WORLD_STUDIO_PHASE1_ARTIFACT_RECOVERED',
      severity: 'WARN' as const,
      message: worldStudioMessage(
        'phase1.recoveredFromSnapshot',
        'Phase 1 result was recovered from local snapshot. Confirm at checkpoints before continuing.',
      ),
    }]
    : [{
      code: 'WORLD_STUDIO_PRIMARY_EVENTS_MISSING',
      severity: 'BLOCK' as const,
      message: worldStudioMessage(
        'phase1.primaryMissingAfterRecovery',
        'Recovered snapshot misses primary events. Please run extraction again.',
      ),
    }];
  return {
    status,
    issues,
    pass: status !== 'BLOCK',
    reasons: issues.map((item) => `${item.code}: ${item.message}`),
    metrics: {
      totalChunks,
      successChunks,
      failedChunks,
      chunkSuccessRatio: totalChunks > 0 ? successChunks / totalChunks : 0,
      primaryCount: primary,
      secondaryCount: secondary,
      worldSettingCount: snapshot.knowledgeGraph.worldSetting.trim() ? 1 : 0,
      timelineCount: snapshot.knowledgeGraph.timeline.length,
      locationsCount: snapshot.knowledgeGraph.locations.length,
      charactersCount: snapshot.knowledgeGraph.characters.length,
      characterRelationsCount: snapshot.knowledgeGraph.characterRelations.length,
      futureEventsCount: snapshot.knowledgeGraph.futureHistoricalEvents.length,
      primaryEvidenceCoverage: primary > 0
        ? (
          snapshot.knowledgeGraph.events.primary.filter((item) => Array.isArray(item.evidenceRefs) && item.evidenceRefs.length > 0).length
          / primary
        )
        : 0,
      eventCharacterCoverage: 0,
      eventLocationCoverage: 0,
      primaryNarrativeCompleteness: 0,
      storyArcCompleteness: 0,
      characterNamePurity: 0,
      characterProfileCoverage: 0,
    },
  };
}

export function buildPhase1ArtifactFromResult(input: {
  result: Phase1Result;
  sourceDigest: string;
  updatedAt?: string;
}): WorldStudioPhase1Artifact {
  return {
    startTimeOptions: input.result.startTimeOptions,
    characterCandidates: input.result.characterCandidates,
    qualityGate: input.result.qualityGate,
    chunkTasks: input.result.chunkTasks,
    narrativeArc: input.result.knowledgeGraph.narrativeArc || null,
    sourceDigest: String(input.sourceDigest || ''),
    updatedAt: input.updatedAt || new Date().toISOString(),
  };
}

export function restorePhase1ResultFromArtifact(
  snapshot: WorldStudioWorkspaceSnapshot,
): Phase1Result | null {
  const artifact = snapshot.phase1Artifact;
  if (!artifact) return null;
  return {
    startTimeOptions: artifact.startTimeOptions,
    characterCandidates: artifact.characterCandidates,
    knowledgeGraph: {
      ...snapshot.knowledgeGraph,
      narrativeArc: snapshot.knowledgeGraph.narrativeArc || artifact.narrativeArc || null,
    },
    qualityGate: artifact.qualityGate,
    chunkTasks: artifact.chunkTasks,
    rawText: JSON.stringify({
      restoredFromArtifact: true,
      sourceDigest: artifact.sourceDigest,
      updatedAt: artifact.updatedAt,
    }),
  };
}

export function buildRecoveredPhase1Artifact(
  snapshot: WorldStudioWorkspaceSnapshot,
): WorldStudioPhase1Artifact | null {
  const hasGraphSignal = (
    snapshot.knowledgeGraph.events.primary.length > 0
    || snapshot.knowledgeGraph.events.secondary.length > 0
    || snapshot.knowledgeGraph.characters.length > 0
    || snapshot.knowledgeGraph.timeline.length > 0
  );
  const hasParseSignal = (
    Number(snapshot.parseJob.chunkTotal) > 0
    || Number(snapshot.parseJob.chunkCompleted) > 0
    || Number(snapshot.parseJob.chunkFailed) > 0
    || Number(snapshot.parseJob.progress) > 0
  );
  if (!hasGraphSignal && !hasParseSignal) return null;
  const updatedAt = snapshot.parseJob.updatedAt || new Date().toISOString();
  return {
    startTimeOptions: toFallbackStartTimeOptions(snapshot),
    characterCandidates: toFallbackCharacterCandidates(snapshot),
    qualityGate: buildRecoveredQualityGate(snapshot),
    chunkTasks: [],
    narrativeArc: snapshot.knowledgeGraph.narrativeArc || null,
    sourceDigest: 'snapshot-recovered',
    updatedAt,
  };
}
