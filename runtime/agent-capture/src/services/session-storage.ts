import { createModKvStore, createModStorageClient } from '@nimiplatform/sdk/mod/storage';
import {
  AGENT_CAPTURE_MOD_ID,
  AGENT_CAPTURE_SESSION_STORAGE_KEY,
  AGENT_CAPTURE_SESSION_STORAGE_NAMESPACE,
} from '../contracts.js';
import type { AgentCaptureSessionState } from '../types.js';
import { sanitizeHydratedSessionState } from './state.js';

let storageClient: ReturnType<typeof createModStorageClient> | null = null;
let sessionStore: ReturnType<typeof createModKvStore> | null = null;

function getStorageClient() {
  if (!storageClient) {
    storageClient = createModStorageClient(AGENT_CAPTURE_MOD_ID);
  }
  return storageClient;
}

function getSessionStore() {
  if (!sessionStore) {
    sessionStore = createModKvStore({
      storage: getStorageClient(),
      namespace: AGENT_CAPTURE_SESSION_STORAGE_NAMESPACE,
    });
  }
  return sessionStore;
}

export async function loadAgentCaptureSession(): Promise<AgentCaptureSessionState | null> {
  const snapshot = await getSessionStore().getJson<AgentCaptureSessionState>(AGENT_CAPTURE_SESSION_STORAGE_KEY);
  return snapshot ? sanitizeHydratedSessionState(snapshot) : null;
}

export async function persistAgentCaptureSession(snapshot: AgentCaptureSessionState): Promise<void> {
  await getSessionStore().setJson(AGENT_CAPTURE_SESSION_STORAGE_KEY, snapshot);
}

export async function clearAgentCaptureSession(): Promise<void> {
  await getSessionStore().delete(AGENT_CAPTURE_SESSION_STORAGE_KEY);
}
