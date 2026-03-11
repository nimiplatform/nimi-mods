import type { WorldStudioCreateActionsInput } from './types.js';

type AssetTaskOptions = {
  taskId?: string;
};

function encodeImageArtifactBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  if (typeof globalThis.btoa !== 'function') {
    throw new Error('WORLD_STUDIO_IMAGE_ARTIFACT_BASE64_UNAVAILABLE');
  }
  return globalThis.btoa(binary);
}

function resolveGeneratedImageUrl(artifacts: Array<{ uri?: string; mimeType?: string; bytes?: Uint8Array }>): string {
  const artifact = artifacts[0];
  if (!artifact) {
    throw new Error('WORLD_STUDIO_IMAGE_ARTIFACT_MISSING');
  }
  const artifactUri = String(artifact.uri || '').trim();
  if (artifactUri) {
    return artifactUri;
  }
  if (artifact.bytes && artifact.bytes.length > 0) {
    const mimeType = String(artifact.mimeType || '').trim() || 'image/png';
    return `data:${mimeType};base64,${encodeImageArtifactBytes(artifact.bytes)}`;
  }
  throw new Error('WORLD_STUDIO_IMAGE_ARTIFACT_MISSING');
}

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
    const response = await input.aiClient.generateImage({
      prompt,
      abortSignal: started.abortSignal,
      binding: input.bindingMap.fine || input.bindingMap.coarse || input.runtimeDefaultRouteBinding || undefined,
    });
    input.patchSnapshot({
      assets: {
        worldCover: { status: 'succeeded', imageUrl: resolveGeneratedImageUrl(response.artifacts) },
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
    const response = await input.aiClient.generateImage({
      prompt,
      abortSignal: started.abortSignal,
      binding: input.bindingMap.fine || input.bindingMap.coarse || input.runtimeDefaultRouteBinding || undefined,
    });
    const succeededPortraits = {
      ...runningPortraits,
      [name]: { status: 'succeeded' as const, imageUrl: resolveGeneratedImageUrl(response.artifacts) },
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

export async function generateLocationImageAsset(
  input: WorldStudioCreateActionsInput,
  locationName: string,
  _options?: AssetTaskOptions,
): Promise<void> {
  const started = input.taskController.startTask({
    kind: 'CREATE_WORLD_COVER',
    label: `Generate location image: ${locationName}`,
    atomic: false,
    resumable: false,
    canPause: false,
    canCancel: true,
    step: 'DRAFT',
    message: `Generating location image for ${locationName}`,
  });
  if (!started) {
    input.setError('WORLD_STUDIO_TASK_CONFLICT: another task is running.');
    return;
  }

  const locationImages = {
    ...input.snapshot.assets.locationImages,
    [locationName]: { status: 'queued' as const, imageUrl: null },
  };
  input.patchSnapshot({ assets: { locationImages } });

  try {
    const runningLocationImages = {
      ...locationImages,
      [locationName]: { status: 'running' as const, imageUrl: null },
    };
    input.patchSnapshot({ assets: { locationImages: runningLocationImages } });

    const prompt = [
      'Generate a cinematic environment image for this world location.',
      `Location: ${locationName}`,
      `World setting: ${input.snapshot.knowledgeGraph.worldSetting || 'N/A'}`,
    ].join('\n');

    const response = await input.aiClient.generateImage({
      prompt,
      abortSignal: started.abortSignal,
      binding:
        input.bindingMap.fine ||
        input.bindingMap.coarse ||
        input.runtimeDefaultRouteBinding ||
        undefined,
    });

    const succeededLocationImages = {
      ...runningLocationImages,
      [locationName]: { status: 'succeeded' as const, imageUrl: resolveGeneratedImageUrl(response.artifacts) },
    };
    input.patchSnapshot({ assets: { locationImages: succeededLocationImages } });
    input.setStatusBanner({ kind: 'success', message: `Location image generated: ${locationName}` });
    input.taskController.completeTask(started.taskId, `Location image generated: ${locationName}`);
  } catch (imageError) {
    const failedLocationImages = {
      ...input.snapshot.assets.locationImages,
      [locationName]: { status: 'failed' as const, imageUrl: null },
    };
    input.patchSnapshot({ assets: { locationImages: failedLocationImages } });
    if (started.abortSignal.aborted || input.taskController.shouldCancel(started.taskId)) {
      input.taskController.cancelTask(started.taskId, `Location image generation canceled: ${locationName}`);
      input.setNotice(`Location image generation canceled: ${locationName}`);
      return;
    }
    input.taskController.failTask(started.taskId, imageError);
    input.setError(imageError instanceof Error ? imageError.message : String(imageError));
  }
}
