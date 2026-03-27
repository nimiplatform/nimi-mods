import { createModKvStore, createModStorageClient } from '@nimiplatform/sdk/mod/storage';
import {
  AGENT_CAPTURE_MOD_ID,
  AGENT_CAPTURE_STORAGE_KEY,
  AGENT_CAPTURE_STORAGE_NAMESPACE,
} from '../contracts.js';
import type { AgentCaptureDraftSnapshot } from '../types.js';
import { encodeBytesToDataUrl } from './base64.js';

let storageClient: ReturnType<typeof createModStorageClient> | null = null;
let draftStore: ReturnType<typeof createModKvStore> | null = null;

function getStorageClient() {
  if (!storageClient) {
    storageClient = createModStorageClient(AGENT_CAPTURE_MOD_ID);
  }
  return storageClient;
}

function getDraftStore() {
  if (!draftStore) {
    draftStore = createModKvStore({
      storage: getStorageClient(),
      namespace: AGENT_CAPTURE_STORAGE_NAMESPACE,
    });
  }
  return draftStore;
}

async function hydrateImageRef<T extends AgentCaptureDraftSnapshot['sourceImage'] | AgentCaptureDraftSnapshot['generatedImage']>(
  image: T,
): Promise<T> {
  if (!image || image.url || !image.path) {
    return image;
  }
  try {
    const bytes = await getStorageClient().files.readBytes(image.path);
    return {
      ...image,
      url: encodeBytesToDataUrl({
        bytes,
        mimeType: image.mimeType || 'application/octet-stream',
      }),
    } as T;
  } catch {
    return image;
  }
}

function stripPersistedImage<T extends AgentCaptureDraftSnapshot['sourceImage'] | AgentCaptureDraftSnapshot['generatedImage']>(
  image: T,
): T {
  if (!image || !image.path) {
    return image;
  }
  return {
    ...image,
    url: '',
  } as T;
}

export async function loadAgentCaptureDraft(): Promise<AgentCaptureDraftSnapshot | null> {
  const snapshot = await getDraftStore().getJson<AgentCaptureDraftSnapshot>(AGENT_CAPTURE_STORAGE_KEY);
  if (!snapshot) {
    return null;
  }
  return {
    ...snapshot,
    sourceImage: await hydrateImageRef(snapshot.sourceImage),
    generatedImage: await hydrateImageRef(snapshot.generatedImage),
  };
}

export async function persistAgentCaptureDraft(snapshot: AgentCaptureDraftSnapshot): Promise<void> {
  await getDraftStore().setJson(AGENT_CAPTURE_STORAGE_KEY, {
    ...snapshot,
    sourceImage: stripPersistedImage(snapshot.sourceImage),
    generatedImage: stripPersistedImage(snapshot.generatedImage),
  });
}

export async function clearAgentCaptureDraft(): Promise<void> {
  await getDraftStore().delete(AGENT_CAPTURE_STORAGE_KEY);
}
