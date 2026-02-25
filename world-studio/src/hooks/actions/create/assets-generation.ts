import type { WorldStudioCreateActionsInput } from './types.js';

type AssetTaskOptions = {
  taskId?: string;
};

export async function generateWorldCoverAsset(
  input: WorldStudioCreateActionsInput,
  _options?: AssetTaskOptions,
): Promise<void> {
  const started = input.taskController.startTask({
    kind: 'CREATE_WORLD_COVER',
    label: 'Generate world cover',
    atomic: false,
    resumable: false,
    canPause: false,
    canCancel: true,
    step: 'DRAFT',
    message: 'Generating world cover',
  });
  if (!started) {
    input.setError('WORLD_STUDIO_TASK_CONFLICT: another task is running.');
    return;
  }

  input.patchSnapshot({
    assets: {
      worldCover: { status: 'queued', imageUrl: null },
    },
  });
  try {
    input.patchSnapshot({
      assets: {
        worldCover: { status: 'running', imageUrl: null },
      },
    });
    const world = input.snapshot.worldPatch;
    const prompt = [
      'Generate a cinematic world cover image.',
      `World name: ${String(world.name || 'Untitled World')}`,
      `World description: ${String(world.description || input.snapshot.knowledgeGraph.worldSetting || '')}`,
    ].join('\n');
    const response = await input.aiClient.generateText({
      routeHint: 'image/default',
      prompt,
      abortSignal: started.abortSignal,
      routeOverride: input.routeOverrideMap.fine || input.routeOverrideMap.coarse || input.runtimeDefaultRouteBinding || undefined,
    });
    input.patchSnapshot({
      assets: {
        worldCover: { status: 'succeeded', imageUrl: String(response.text || '') },
      },
    });
    input.setStatusBanner({ kind: 'success', message: 'World cover generated' });
    input.taskController.completeTask(started.taskId, 'World cover generated');
  } catch (imageError) {
    if (started.abortSignal.aborted || input.taskController.shouldCancel(started.taskId)) {
      input.patchSnapshot({
        assets: {
          worldCover: { status: 'failed', imageUrl: null },
        },
      });
      input.taskController.cancelTask(started.taskId, 'World cover generation canceled');
      input.setNotice('World cover generation canceled.');
      return;
    }
    input.patchSnapshot({
      assets: {
        worldCover: { status: 'failed', imageUrl: null },
      },
    });
    input.taskController.failTask(started.taskId, imageError);
    input.setError(imageError instanceof Error ? imageError.message : String(imageError));
  }
}

export async function generateCharacterPortraitAsset(
  input: WorldStudioCreateActionsInput,
  name: string,
  _options?: AssetTaskOptions,
): Promise<void> {
  const started = input.taskController.startTask({
    kind: 'CREATE_CHARACTER_PORTRAIT',
    label: `Generate portrait: ${name}`,
    atomic: false,
    resumable: false,
    canPause: false,
    canCancel: true,
    step: 'DRAFT',
    message: `Generating portrait for ${name}`,
  });
  if (!started) {
    input.setError('WORLD_STUDIO_TASK_CONFLICT: another task is running.');
    return;
  }

  const portraits = { ...input.snapshot.assets.characterPortraits };
  portraits[name] = { status: 'queued' as const, imageUrl: null };
  input.patchSnapshot({
    assets: {
      characterPortraits: portraits,
    },
  });
  try {
    const runningPortraits = { ...portraits, [name]: { status: 'running' as const, imageUrl: null } };
    input.patchSnapshot({
      assets: {
        characterPortraits: runningPortraits,
      },
    });
    const prompt = [
      'Generate a portrait image for this world character.',
      `Character: ${name}`,
      `World setting: ${input.snapshot.knowledgeGraph.worldSetting || 'N/A'}`,
    ].join('\n');
    const response = await input.aiClient.generateText({
      routeHint: 'image/default',
      prompt,
      abortSignal: started.abortSignal,
      routeOverride: input.routeOverrideMap.fine || input.routeOverrideMap.coarse || input.runtimeDefaultRouteBinding || undefined,
    });
    const succeededPortraits = {
      ...runningPortraits,
      [name]: { status: 'succeeded' as const, imageUrl: String(response.text || '') },
    };
    input.patchSnapshot({
      assets: {
        characterPortraits: succeededPortraits,
      },
    });
    input.setStatusBanner({ kind: 'success', message: `Portrait generated: ${name}` });
    input.taskController.completeTask(started.taskId, `Portrait generated: ${name}`);
  } catch (imageError) {
    const failedPortraits = {
      ...input.snapshot.assets.characterPortraits,
      [name]: { status: 'failed' as const, imageUrl: null },
    };
    input.patchSnapshot({
      assets: {
        characterPortraits: failedPortraits,
      },
    });
    if (started.abortSignal.aborted || input.taskController.shouldCancel(started.taskId)) {
      input.taskController.cancelTask(started.taskId, `Portrait generation canceled: ${name}`);
      input.setNotice(`Portrait generation canceled: ${name}`);
      return;
    }
    input.taskController.failTask(started.taskId, imageError);
    input.setError(imageError instanceof Error ? imageError.message : String(imageError));
  }
}
