import {
  VIDEOPLAY_OPERATION_TYPE,
  type VideoPlayOperationType,
} from '../contracts.js';
import { createUlid } from '../id.js';
import type {
  AudioDesignOutput,
  CandidateSelectionOutput,
  CharacterCastingOutput,
  EpisodeRecord,
  StoryboardOutput,
  StoryboardShot,
  VersionLineageNode,
  VideoPlayEditorBranch,
} from '../types.js';

const SCOPE_BY_OPERATION: Record<VideoPlayOperationType, 'shot' | 'adjacent-shots-plus-compose' | 'clip-plus-compose' | 'post-segmentation-full-chain'> = {
  [VIDEOPLAY_OPERATION_TYPE.INSERT_SHOT]: 'shot',
  [VIDEOPLAY_OPERATION_TYPE.UPDATE_SHOT]: 'shot',
  [VIDEOPLAY_OPERATION_TYPE.DELETE_SHOT]: 'shot',
  [VIDEOPLAY_OPERATION_TYPE.REGENERATE_SHOT]: 'shot',
  [VIDEOPLAY_OPERATION_TYPE.CREATE_SHOT_VARIANT]: 'shot',
  [VIDEOPLAY_OPERATION_TYPE.UNDO_LAST_REGENERATION]: 'shot',
  [VIDEOPLAY_OPERATION_TYPE.LINK_SHOT_TRANSITION]: 'adjacent-shots-plus-compose',
  [VIDEOPLAY_OPERATION_TYPE.GENERATE_FIRST_LAST_FRAME]: 'adjacent-shots-plus-compose',
  [VIDEOPLAY_OPERATION_TYPE.GENERATE_VOICE_LINE]: 'shot',
  [VIDEOPLAY_OPERATION_TYPE.APPLY_LIP_SYNC]: 'shot',
  [VIDEOPLAY_OPERATION_TYPE.CREATE_BRANCH]: 'post-segmentation-full-chain',
  [VIDEOPLAY_OPERATION_TYPE.SWITCH_BRANCH]: 'post-segmentation-full-chain',
  [VIDEOPLAY_OPERATION_TYPE.REDO]: 'shot',
  [VIDEOPLAY_OPERATION_TYPE.MERGE_BRANCH]: 'post-segmentation-full-chain',
  [VIDEOPLAY_OPERATION_TYPE.SELECT_CANDIDATE]: 'adjacent-shots-plus-compose',
  [VIDEOPLAY_OPERATION_TYPE.REGENERATE_CANDIDATE]: 'adjacent-shots-plus-compose',
  [VIDEOPLAY_OPERATION_TYPE.UPDATE_CHARACTER_APPEARANCE]: 'clip-plus-compose',
  [VIDEOPLAY_OPERATION_TYPE.SELECT_BGM_TRACK]: 'adjacent-shots-plus-compose',
  [VIDEOPLAY_OPERATION_TYPE.UPDATE_SFX_LAYER]: 'adjacent-shots-plus-compose',
};

function nowIso(): string {
  return new Date().toISOString();
}

function computeNextStartMs(storyboard: StoryboardOutput): number {
  if (storyboard.shotPlans.length === 0) return 0;
  let maxEnd = 0;
  for (const shot of storyboard.shotPlans) {
    const end = shot.startMs + shot.durationMs;
    if (end > maxEnd) maxEnd = end;
  }
  return maxEnd;
}

function cloneStoryboard(storyboard: StoryboardOutput): StoryboardOutput {
  return {
    ...storyboard,
    clipPlans: storyboard.clipPlans.map((clip) => ({ ...clip, shotIds: [...clip.shotIds], sourceEventIds: [...clip.sourceEventIds] })),
    shotPlans: storyboard.shotPlans.map((shot) => ({ ...shot, continuityAnchors: [...shot.continuityAnchors], sourceEventIds: [...shot.sourceEventIds] })),
    sourceEventIds: [...storyboard.sourceEventIds],
  };
}

function createLineageNode(input: {
  episode: EpisodeRecord;
  operationType: VideoPlayOperationType;
  operator: string;
  deltaSummary: string;
}): VersionLineageNode {
  const activeBranch = input.episode.editor.branches[input.episode.editor.activeBranchId];
  const parentVersionId = activeBranch?.headVersionId || null;
  return {
    versionId: createUlid(),
    parentVersionId,
    branchId: input.episode.editor.activeBranchId,
    operationType: input.operationType,
    deltaSummary: input.deltaSummary,
    operator: input.operator,
    timestamp: nowIso(),
  };
}

function upsertShot(storyboard: StoryboardOutput, shot: StoryboardShot): StoryboardOutput {
  const cloned = cloneStoryboard(storyboard);
  const exists = cloned.shotPlans.findIndex((item) => item.shotId === shot.shotId);
  if (exists >= 0) {
    cloned.shotPlans[exists] = shot;
  } else {
    cloned.shotPlans.push(shot);
    const clip = cloned.clipPlans.find((item) => item.clipId === shot.clipId);
    if (clip && !clip.shotIds.includes(shot.shotId)) {
      clip.shotIds.push(shot.shotId);
    }
  }
  return cloned;
}

function deleteShot(storyboard: StoryboardOutput, shotId: string): StoryboardOutput {
  const cloned = cloneStoryboard(storyboard);
  cloned.shotPlans = cloned.shotPlans.filter((shot) => shot.shotId !== shotId);
  for (const clip of cloned.clipPlans) {
    clip.shotIds = clip.shotIds.filter((item) => item !== shotId);
  }
  return cloned;
}

function createBranch(episode: EpisodeRecord, branchName: string): VideoPlayEditorBranch {
  const branchId = createUlid();
  const currentBranch = episode.editor.branches[episode.editor.activeBranchId];
  return {
    branchId,
    name: branchName || `branch-${branchId.slice(-6)}`,
    headVersionId: currentBranch?.headVersionId || episode.editor.lineage.at(-1)?.versionId || createUlid(),
    createdAt: nowIso(),
  };
}

export type ApplyCreatorOperationInput = {
  episode: EpisodeRecord;
  operationType: VideoPlayOperationType;
  operator: string;
  payload?: Record<string, unknown>;
  candidateSelection?: CandidateSelectionOutput | null;
  characterCasting?: CharacterCastingOutput | null;
  audioDesign?: AudioDesignOutput | null;
};

export type ApplyCreatorOperationResult = {
  episode: EpisodeRecord;
  rebuildScope: 'shot' | 'adjacent-shots-plus-compose' | 'clip-plus-compose' | 'post-segmentation-full-chain';
  versionNode: VersionLineageNode;
  candidateSelection?: CandidateSelectionOutput | null;
  characterCasting?: CharacterCastingOutput | null;
  audioDesign?: AudioDesignOutput | null;
};

export function applyCreatorOperation(input: ApplyCreatorOperationInput): ApplyCreatorOperationResult {
  const episode: EpisodeRecord = {
    ...input.episode,
    storyboard: cloneStoryboard(input.episode.storyboard),
    editor: {
      ...input.episode.editor,
      branches: { ...input.episode.editor.branches },
      lineage: [...input.episode.editor.lineage],
      conflictRecords: [...input.episode.editor.conflictRecords],
    },
  };

  let deltaSummary = '';
  let mutatedCandidateSelection: CandidateSelectionOutput | null | undefined;
  let mutatedCharacterCasting: CharacterCastingOutput | null | undefined;
  let mutatedAudioDesign: AudioDesignOutput | null | undefined;

  if (input.operationType === VIDEOPLAY_OPERATION_TYPE.INSERT_SHOT) {
    const clipId = String(input.payload?.clipId || episode.storyboard.clipPlans[0]?.clipId || '').trim();
    const beatId = String(input.payload?.beatId || '').trim();
    const sourceEventIds = Array.isArray(input.payload?.sourceEventIds)
      ? input.payload?.sourceEventIds.map((item) => String(item || '').trim()).filter(Boolean)
      : [...episode.sourceEventIds.slice(0, 1)];
    const visualPromptValue = String(input.payload?.visualPrompt || 'inserted shot').trim() || 'inserted shot';
    const shot: StoryboardShot = {
      shotId: createUlid(),
      clipId,
      beatId,
      visualPrompt: visualPromptValue,
      motionCue: String(input.payload?.motionCue || 'static').trim() || 'static',
      continuityAnchors: [],
      sourceEventIds: sourceEventIds.length > 0 ? sourceEventIds : [...episode.sourceEventIds.slice(0, 1)],
      durationMs: Number(input.payload?.durationMs || 3000),
      startMs: computeNextStartMs(episode.storyboard),
      shotType: String(input.payload?.shotType || 'medium'),
      cameraMove: String(input.payload?.cameraMove || 'static'),
      photographyRule: {
        composition: 'center',
        lighting: 'natural',
        colorPalette: 'neutral',
        atmosphere: 'calm',
        technicalNotes: '',
      },
      actingDirection: { characters: [] },
      videoPrompt: visualPromptValue,
      characterIds: Array.isArray(input.payload?.characterIds) ? (input.payload!.characterIds as string[]) : [],
      locationId: (input.payload?.locationId as string) ?? null,
    };
    episode.storyboard = upsertShot(episode.storyboard, shot);
    deltaSummary = `insert-shot:${shot.shotId}`;
  } else if (input.operationType === VIDEOPLAY_OPERATION_TYPE.UPDATE_SHOT) {
    const shotId = String(input.payload?.shotId || '').trim();
    const found = episode.storyboard.shotPlans.find((shot) => shot.shotId === shotId);
    if (found) {
      const updated: StoryboardShot = {
        ...found,
        visualPrompt: String(input.payload?.visualPrompt || found.visualPrompt),
        motionCue: String(input.payload?.motionCue || found.motionCue),
      };
      episode.storyboard = upsertShot(episode.storyboard, updated);
      deltaSummary = `update-shot:${shotId}`;
    }
  } else if (input.operationType === VIDEOPLAY_OPERATION_TYPE.DELETE_SHOT) {
    const shotId = String(input.payload?.shotId || '').trim();
    episode.storyboard = deleteShot(episode.storyboard, shotId);
    deltaSummary = `delete-shot:${shotId}`;
  } else if (input.operationType === VIDEOPLAY_OPERATION_TYPE.REGENERATE_SHOT) {
    const shotId = String(input.payload?.shotId || '').trim();
    const found = episode.storyboard.shotPlans.find((shot) => shot.shotId === shotId);
    if (found) {
      const regenerated: StoryboardShot = {
        ...found,
        visualPrompt: `${found.visualPrompt} (regenerated)`,
      };
      episode.storyboard = upsertShot(episode.storyboard, regenerated);
      deltaSummary = `regenerate-shot:${shotId}`;
    }
  } else if (input.operationType === VIDEOPLAY_OPERATION_TYPE.CREATE_SHOT_VARIANT) {
    const baseShotId = String(input.payload?.baseShotId || '').trim();
    const base = episode.storyboard.shotPlans.find((shot) => shot.shotId === baseShotId);
    if (base) {
      const variant: StoryboardShot = {
        ...base,
        shotId: createUlid(),
        visualPrompt: `${base.visualPrompt} (variant)`,
        startMs: computeNextStartMs(episode.storyboard),
      };
      episode.storyboard = upsertShot(episode.storyboard, variant);
      deltaSummary = `create-shot-variant:${baseShotId}->${variant.shotId}`;
    }
  } else if (input.operationType === VIDEOPLAY_OPERATION_TYPE.UNDO_LAST_REGENERATION) {
    const latestRegenerate = [...episode.editor.lineage]
      .reverse()
      .find((node) => node.branchId === episode.editor.activeBranchId && node.operationType === VIDEOPLAY_OPERATION_TYPE.REGENERATE_SHOT);
    deltaSummary = latestRegenerate
      ? `undo-last-regeneration:${latestRegenerate.versionId}`
      : 'undo-last-regeneration:none';
  } else if (input.operationType === VIDEOPLAY_OPERATION_TYPE.LINK_SHOT_TRANSITION) {
    const fromShotId = String(input.payload?.fromShotId || '').trim();
    const toShotId = String(input.payload?.toShotId || '').trim();
    deltaSummary = `link-shot-transition:${fromShotId}->${toShotId}`;
  } else if (input.operationType === VIDEOPLAY_OPERATION_TYPE.GENERATE_FIRST_LAST_FRAME) {
    const shotId = String(input.payload?.shotId || '').trim();
    deltaSummary = `generate-first-last-frame:${shotId}`;
  } else if (input.operationType === VIDEOPLAY_OPERATION_TYPE.GENERATE_VOICE_LINE) {
    const shotId = String(input.payload?.shotId || '').trim();
    deltaSummary = `generate-voice-line:${shotId}`;
  } else if (input.operationType === VIDEOPLAY_OPERATION_TYPE.APPLY_LIP_SYNC) {
    const shotId = String(input.payload?.shotId || '').trim();
    deltaSummary = `apply-lip-sync:${shotId}`;
  } else if (input.operationType === VIDEOPLAY_OPERATION_TYPE.CREATE_BRANCH) {
    const created = createBranch(episode, String(input.payload?.branchName || '').trim());
    episode.editor.branches[created.branchId] = created;
    episode.editor.activeBranchId = created.branchId;
    deltaSummary = `create-branch:${created.branchId}`;
  } else if (input.operationType === VIDEOPLAY_OPERATION_TYPE.SWITCH_BRANCH) {
    const branchId = String(input.payload?.branchId || '').trim();
    if (episode.editor.branches[branchId]) {
      episode.editor.activeBranchId = branchId;
      deltaSummary = `switch-branch:${branchId}`;
    }
  } else if (input.operationType === VIDEOPLAY_OPERATION_TYPE.REDO) {
    deltaSummary = 'redo';
  } else if (input.operationType === VIDEOPLAY_OPERATION_TYPE.MERGE_BRANCH) {
    const sourceBranchId = String(input.payload?.sourceBranchId || '').trim();
    const targetBranchId = String(input.payload?.targetBranchId || '').trim();
    episode.editor.conflictRecords.push({
      sourceBranchId,
      targetBranchId,
      resolution: 'manual-merge',
      timestamp: nowIso(),
    });
    deltaSummary = `merge-branch:${sourceBranchId}->${targetBranchId}`;
  } else if (input.operationType === VIDEOPLAY_OPERATION_TYPE.SELECT_CANDIDATE) {
    const assetId = String(input.payload?.assetId || '').trim();
    const shotId = String(input.payload?.shotId || '').trim();
    const nextOrder = Number(input.payload?.order);
    const trimInMsRaw = input.payload?.trimInMs;
    const trimOutMsRaw = input.payload?.trimOutMs;
    const trimInMs = trimInMsRaw == null ? null : Number(trimInMsRaw);
    const trimOutMs = trimOutMsRaw == null ? null : Number(trimOutMsRaw);
    if (input.candidateSelection && assetId) {
      const hasAsset = input.candidateSelection.selectedAssetIds.includes(assetId);
      const selectedAssetIds = hasAsset
        ? [...input.candidateSelection.selectedAssetIds]
        : [...input.candidateSelection.selectedAssetIds, assetId];
      const existingIndex = input.candidateSelection.timelineSegments.findIndex((segment) => segment.assetId === assetId);
      const baseOrder = Number.isFinite(nextOrder) ? Math.max(0, Math.floor(nextOrder)) : selectedAssetIds.length - 1;
      const nextSegment = {
        assetId,
        shotId: shotId || input.candidateSelection.timelineSegments[existingIndex]?.shotId || 'unknown-shot',
        order: baseOrder,
        trimInMs: Number.isFinite(trimInMs as number) ? Math.max(0, Math.floor(trimInMs as number)) : null,
        trimOutMs: Number.isFinite(trimOutMs as number) ? Math.max(0, Math.floor(trimOutMs as number)) : null,
      };
      const timelineSegments = existingIndex >= 0
        ? input.candidateSelection.timelineSegments.map((segment, index) => (
          index === existingIndex ? nextSegment : segment
        ))
        : [...input.candidateSelection.timelineSegments, nextSegment];
      const normalizedSegments = timelineSegments
        .slice()
        .sort((left, right) => left.order - right.order)
        .map((segment, index) => ({ ...segment, order: index }));
      mutatedCandidateSelection = {
        ...input.candidateSelection,
        selectedAssetIds,
        timelineSegments: normalizedSegments,
      };
    }
    deltaSummary = `select-candidate:${assetId}`;
  } else if (input.operationType === VIDEOPLAY_OPERATION_TYPE.REGENERATE_CANDIDATE) {
    const assetId = String(input.payload?.assetId || '').trim();
    if (input.candidateSelection && assetId) {
      const selectedAssetIds = input.candidateSelection.selectedAssetIds.filter((id) => id !== assetId);
      const timelineSegments = input.candidateSelection.timelineSegments
        .filter((segment) => segment.assetId !== assetId)
        .sort((left, right) => left.order - right.order)
        .map((segment, index) => ({ ...segment, order: index }));
      mutatedCandidateSelection = {
        ...input.candidateSelection,
        selectedAssetIds,
        timelineSegments,
      };
    }
    deltaSummary = `regenerate-candidate:${assetId}`;
  } else if (input.operationType === VIDEOPLAY_OPERATION_TYPE.UPDATE_CHARACTER_APPEARANCE) {
    const agentId = String(input.payload?.agentId || '').trim();
    const description = String(input.payload?.description || '').trim();
    if (input.characterCasting && agentId) {
      const updatedCharacters = input.characterCasting.characters.map((c) => {
        if (c.agentId !== agentId) return c;
        const nextIndex = c.activeAppearanceIndex + 1;
        const newAppearance = {
          appearanceIndex: nextIndex,
          description: description || c.appearances[c.activeAppearanceIndex]?.description || '',
          imageUrls: [],
          selectedIndex: 0,
          changeReason: String(input.payload?.changeReason || 'creator-update'),
          previousImageUrl: c.referenceImageUri,
        };
        return {
          ...c,
          appearances: [...c.appearances, newAppearance],
          activeAppearanceIndex: nextIndex,
        };
      });
      mutatedCharacterCasting = { ...input.characterCasting, characters: updatedCharacters };
    }
    deltaSummary = `update-character-appearance:${agentId}`;
  } else if (input.operationType === VIDEOPLAY_OPERATION_TYPE.SELECT_BGM_TRACK) {
    const trackId = String(input.payload?.trackId || '').trim();
    if (input.audioDesign && trackId) {
      mutatedAudioDesign = {
        ...input.audioDesign,
        bgmTrack: input.audioDesign.bgmTrack
          ? { ...input.audioDesign.bgmTrack, trackId }
          : null,
      };
    }
    deltaSummary = `select-bgm-track:${trackId}`;
  } else if (input.operationType === VIDEOPLAY_OPERATION_TYPE.UPDATE_SFX_LAYER) {
    const sfxId = String(input.payload?.sfxId || '').trim();
    const volume = input.payload?.volume != null ? Number(input.payload.volume) : undefined;
    if (input.audioDesign && sfxId) {
      const updatedLayers = input.audioDesign.sfxLayers.map((layer) =>
        layer.sfxId === sfxId && volume !== undefined ? { ...layer, volume } : layer,
      );
      mutatedAudioDesign = { ...input.audioDesign, sfxLayers: updatedLayers };
    }
    deltaSummary = `update-sfx-layer:${sfxId}`;
  }

  if (!deltaSummary) {
    deltaSummary = `${input.operationType}:noop`;
  }

  const node = createLineageNode({
    episode,
    operationType: input.operationType,
    operator: input.operator,
    deltaSummary,
  });
  episode.editor.lineage.push(node);

  const activeBranch = episode.editor.branches[episode.editor.activeBranchId];
  if (activeBranch) {
    episode.editor.branches[episode.editor.activeBranchId] = {
      ...activeBranch,
      headVersionId: node.versionId,
    };
  }

  episode.updatedAt = nowIso();

  return {
    episode,
    rebuildScope: SCOPE_BY_OPERATION[input.operationType],
    versionNode: node,
    ...(mutatedCandidateSelection !== undefined ? { candidateSelection: mutatedCandidateSelection } : {}),
    ...(mutatedCharacterCasting !== undefined ? { characterCasting: mutatedCharacterCasting } : {}),
    ...(mutatedAudioDesign !== undefined ? { audioDesign: mutatedAudioDesign } : {}),
  };
}
