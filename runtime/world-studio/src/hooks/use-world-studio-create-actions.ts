import { useCallback } from 'react';
import {
  generateCharacterPortraitAsset,
  generateLocationImageAsset,
  generateWorldCoverAsset,
} from './actions/create/assets-generation.js';
import { publishWorldDraft, saveWorldDraft } from './actions/create/draft-publish.js';
import { runCreatePhase1 } from './actions/create/run-phase1.js';
import { runCreatePhase2, runRebuildEmbeddingIndex } from './actions/create/run-phase2.js';
import { selectSourceFile } from './actions/create/source-file.js';
import type { WorldStudioCreateActionsInput } from './actions/create/types.js';

export function useWorldStudioCreateActions(input: WorldStudioCreateActionsInput) {
  const onSelectSourceFile = useCallback(async (file: File | null) => {
    await selectSourceFile(input, file);
  }, [input]);

  const onRunPhase1 = useCallback(async (
    mode: 'all' | 'failed' = 'all',
    forcedRetryErrorCode?: string | null,
    options?: { taskId?: string; resume?: boolean },
  ) => {
    await runCreatePhase1(input, mode, forcedRetryErrorCode, options);
  }, [input]);

  const onRunPhase2 = useCallback(async (options?: { taskId?: string; resume?: boolean }) => {
    await runCreatePhase2(input, options);
  }, [input]);

  const onRebuildEmbeddingIndex = useCallback(async () => {
    await runRebuildEmbeddingIndex(input);
  }, [input]);

  const onGenerateWorldCover = useCallback(async (options?: { taskId?: string }) => {
    await generateWorldCoverAsset(input, options);
  }, [input]);

  const onGenerateCharacterPortrait = useCallback(async (name: string, options?: { taskId?: string }) => {
    await generateCharacterPortraitAsset(input, name, options);
  }, [input]);

  const onGenerateLocationImage = useCallback(async (name: string, options?: { taskId?: string }) => {
    await generateLocationImageAsset(input, name, options);
  }, [input]);

  const onSaveDraft = useCallback(async (options?: { taskId?: string }) => {
    await saveWorldDraft(input, options);
  }, [input]);

  const onPublishDraft = useCallback(async (options?: { taskId?: string }) => {
    await publishWorldDraft(input, options);
  }, [input]);

  return {
    onSelectSourceFile,
    onRunPhase1,
    onRunPhase2,
    onRebuildEmbeddingIndex,
    onGenerateWorldCover,
    onGenerateCharacterPortrait,
    onGenerateLocationImage,
    onSaveDraft,
    onPublishDraft,
  };
}
