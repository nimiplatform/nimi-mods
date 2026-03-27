import { asRecord, createModKvStore, createModStorageClient, type RuntimeRouteBinding } from '@nimiplatform/sdk/mod';
import {
  AGENT_CAPTURE_MOD_ID,
  AGENT_CAPTURE_ROUTE_STORAGE_KEY,
  AGENT_CAPTURE_ROUTE_STORAGE_NAMESPACE,
} from '../contracts.js';
import type { AgentCaptureRouteState } from '../types.js';
import { createEmptyRouteState } from './state.js';

let storageClient: ReturnType<typeof createModStorageClient> | null = null;
let routeStore: ReturnType<typeof createModKvStore> | null = null;

function getStorageClient() {
  if (!storageClient) {
    storageClient = createModStorageClient(AGENT_CAPTURE_MOD_ID);
  }
  return storageClient;
}

function getRouteStore() {
  if (!routeStore) {
    routeStore = createModKvStore({
      storage: getStorageClient(),
      namespace: AGENT_CAPTURE_ROUTE_STORAGE_NAMESPACE,
    });
  }
  return routeStore;
}

function normalizeRouteBinding(parsed: unknown): RuntimeRouteBinding | null {
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  const record = asRecord(parsed);
  const source = String(record.source || '').trim();
  const connectorId = String(record.connectorId || '').trim();
  const model = String(record.model || '').trim();
  if (!source || !model) {
    return null;
  }
  const normalizedSource = source === 'cloud' ? 'cloud' : 'local';
  return {
    source: normalizedSource,
    connectorId,
    model,
    localModelId: normalizedSource === 'local'
      ? (String(record.localModelId || '').trim() || undefined)
      : undefined,
    engine: normalizedSource === 'local'
      ? (String(record.engine || '').trim() || undefined)
      : undefined,
    modelId: String(record.modelId || '').trim() || undefined,
    provider: String(record.provider || '').trim() || undefined,
    adapter: String(record.adapter || '').trim() || undefined,
    endpoint: String(record.endpoint || '').trim() || undefined,
    goRuntimeLocalModelId: String(record.goRuntimeLocalModelId || '').trim() || undefined,
    goRuntimeStatus: String(record.goRuntimeStatus || '').trim() || undefined,
  };
}

export function normalizeRouteState(parsed: unknown): AgentCaptureRouteState {
  if (!parsed || typeof parsed !== 'object') {
    return createEmptyRouteState();
  }
  const record = asRecord(parsed);
  return {
    textRouteBinding: normalizeRouteBinding(record.textRouteBinding),
    imageRouteBinding: normalizeRouteBinding(record.imageRouteBinding),
  };
}

export async function loadAgentCaptureRouteState(): Promise<AgentCaptureRouteState> {
  const snapshot = await getRouteStore().getJson<AgentCaptureRouteState>(AGENT_CAPTURE_ROUTE_STORAGE_KEY);
  return normalizeRouteState(snapshot);
}

export async function persistAgentCaptureRouteState(snapshot: AgentCaptureRouteState): Promise<void> {
  await getRouteStore().setJson(AGENT_CAPTURE_ROUTE_STORAGE_KEY, snapshot);
}

export async function clearAgentCaptureRouteState(): Promise<void> {
  await getRouteStore().delete(AGENT_CAPTURE_ROUTE_STORAGE_KEY);
}
