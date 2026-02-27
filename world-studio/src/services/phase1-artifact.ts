import type {
  WorldStudioPhase1Artifact,
  WorldStudioWorkspaceSnapshot,
} from '../contracts.js';
import type { Phase1Result } from '../generation/pipeline.js';

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
    finalDraftAccumulator: snapshot.finalDraftAccumulator,
    qualityGate: artifact.qualityGate,
    chunkTasks: artifact.chunkTasks,
    rawText: JSON.stringify({
      restoredFromArtifact: true,
      sourceDigest: artifact.sourceDigest,
      updatedAt: artifact.updatedAt,
    }),
  };
}
