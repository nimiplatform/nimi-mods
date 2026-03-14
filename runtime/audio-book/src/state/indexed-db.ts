// ---------------------------------------------------------------------------
// Host storage wrapper for Audio Book persistence
import type { VoiceProject } from '../types.js';
import { createModKvStore, createModStorageClient } from '@nimiplatform/sdk/mod';
import { AUDIO_BOOK_MOD_ID } from '../contracts.js';

const projectStore = createModKvStore({
  storage: createModStorageClient(AUDIO_BOOK_MOD_ID),
  namespace: 'audio-book.projects',
});
const fileStorage = createModStorageClient(AUDIO_BOOK_MOD_ID).files;

// ---------------------------------------------------------------------------
async function loadProjectMap(): Promise<Record<string, VoiceProject>> {
  return await projectStore.getJson<Record<string, VoiceProject>>('projects') || {};
}

async function saveProjectMap(projects: Record<string, VoiceProject>): Promise<void> {
  await projectStore.setJson('projects', projects);
}

function audioPath(projectId: string, segmentId: string): string {
  return `audio/${projectId}/${segmentId}.bin`;
}

async function listAudioPaths(projectId: string): Promise<string[]> {
  const root = `audio/${projectId}`;
  const entries = await fileStorage.list(root).catch(() => []);
  return entries
    .filter((entry) => entry.kind === 'file')
    .map((entry) => entry.path);
}

export async function openDb(): Promise<null> {
  return null;
}

export async function dbPutProject(project: VoiceProject): Promise<void> {
  const projects = await loadProjectMap();
  projects[project.id] = project;
  await saveProjectMap(projects);
}

export async function dbGetProject(projectId: string): Promise<VoiceProject | undefined> {
  const projects = await loadProjectMap();
  return projects[projectId];
}

export async function dbDeleteProject(projectId: string): Promise<void> {
  const projects = await loadProjectMap();
  delete projects[projectId];
  await saveProjectMap(projects);
}

export async function dbListProjects(): Promise<VoiceProject[]> {
  return Object.values(await loadProjectMap());
}

// ---------------------------------------------------------------------------
export async function dbPutAudio(projectId: string, segmentId: string, blob: Blob): Promise<void> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await fileStorage.writeBytes(audioPath(projectId, segmentId), bytes);
}

export async function dbGetAudio(projectId: string, segmentId: string): Promise<Blob | undefined> {
  const bytes = await fileStorage.readBytes(audioPath(projectId, segmentId)).catch(() => null);
  if (!bytes) {
    return undefined;
  }
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer]);
}

export async function dbDeleteProjectAudio(projectId: string): Promise<void> {
  const paths = await listAudioPaths(projectId);
  for (const path of paths) {
    await fileStorage.delete(path);
  }
}
