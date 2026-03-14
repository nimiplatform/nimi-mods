// ---------------------------------------------------------------------------
// Zustand store for Audio Book project state
// ---------------------------------------------------------------------------

import { create } from 'zustand';
import { createModKvStore, createModStorageClient } from '@nimiplatform/sdk/mod';
import { AUDIO_BOOK_MOD_ID } from '../contracts.js';
import type {
  CharacterProfile,
  ProjectState,
  Script,
  SourceChapter,
  SynthesisJob,
  VoiceCasting,
  VoiceProject,
} from '../types.js';
import {
  dbDeleteProject,
  dbDeleteProjectAudio,
  dbGetProject,
  dbListProjects,
  dbPutProject,
} from './indexed-db.js';

// ---------------------------------------------------------------------------
// Project list meta (lightweight, persisted in host storage)
// ---------------------------------------------------------------------------

type ProjectMeta = { id: string; name: string; state: ProjectState; updatedAt: string };

const PROJECT_LIST_KEY = 'audio-book:project-list';
const projectListStore = createModKvStore({
  storage: createModStorageClient(AUDIO_BOOK_MOD_ID),
  namespace: 'audio-book.meta',
});

async function readProjectListMeta(): Promise<ProjectMeta[]> {
  try {
    return await projectListStore.getJson<ProjectMeta[]>(PROJECT_LIST_KEY) || [];
  } catch {
    return [];
  }
}

async function writeProjectListMeta(list: ProjectMeta[]) {
  await projectListStore.setJson(PROJECT_LIST_KEY, list);
}

function toMeta(p: VoiceProject): ProjectMeta {
  return { id: p.id, name: p.name, state: p.state, updatedAt: p.updatedAt };
}

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

type AudioBookStore = {
  // Project list
  projects: ProjectMeta[];
  activeProjectId: string | null;

  // Active project data (loaded from IndexedDB)
  project: VoiceProject | null;

  // Derived shortcuts (flat references into project)
  script: Script | null;
  characters: CharacterProfile[];
  voiceCastings: VoiceCasting[];
  synthesisJob: SynthesisJob | null;

  // Actions
  loadProjectList: () => Promise<void>;
  openProject: (id: string) => Promise<void>;
  createProject: (name: string) => Promise<VoiceProject>;
  deleteProject: (id: string) => Promise<void>;
  updateProject: (patch: Partial<VoiceProject>) => void;
  setScript: (script: Script | null) => void;
  setCharacters: (characters: CharacterProfile[]) => void;
  setVoiceCastings: (castings: VoiceCasting[]) => void;
  setSynthesisJob: (job: SynthesisJob | null) => void;
  updateSegmentJob: (segmentId: string, patch: Record<string, unknown>) => void;
  persistActiveProject: () => Promise<void>;
  closeProject: () => void;
};

function generateProjectId(): string {
  // Simple ULID-like timestamp-based ID for browser
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `vsp_${t}${r}`;
}

function newProject(name: string): VoiceProject {
  const now = new Date().toISOString();
  return {
    id: generateProjectId(),
    name,
    state: 'draft',
    sourceChapters: [],
    characters: [],
    voiceCastings: [],
    audioOutputs: [],
    createdAt: now,
    updatedAt: now,
  };
}

export const useAudioBookStore = create<AudioBookStore>((set, get) => ({
  projects: [],
  activeProjectId: null,
  project: null,
  script: null,
  characters: [],
  voiceCastings: [],
  synthesisJob: null,

  async loadProjectList() {
    set({ projects: await readProjectListMeta() });
  },

  async openProject(id) {
    const project = await dbGetProject(id);
    if (!project) return;
    set({
      activeProjectId: id,
      project,
      script: project.script ?? null,
      characters: project.characters,
      voiceCastings: project.voiceCastings,
      synthesisJob: project.synthesisJob ?? null,
    });
  },

  async createProject(name) {
    const project = newProject(name);
    await dbPutProject(project);
    const meta = toMeta(project);
    const projects = [meta, ...get().projects];
    await writeProjectListMeta(projects);
    set({
      projects,
      activeProjectId: project.id,
      project,
      script: null,
      characters: [],
      voiceCastings: [],
      synthesisJob: null,
    });
    return project;
  },

  async deleteProject(id) {
    await dbDeleteProject(id);
    await dbDeleteProjectAudio(id);
    const projects = get().projects.filter((p) => p.id !== id);
    await writeProjectListMeta(projects);
    const wasActive = get().activeProjectId === id;
    set({
      projects,
      ...(wasActive
        ? { activeProjectId: null, project: null, script: null, characters: [], voiceCastings: [], synthesisJob: null }
        : {}),
    });
  },

  updateProject(patch) {
    const current = get().project;
    if (!current) return;
    const updated: VoiceProject = { ...current, ...patch, updatedAt: new Date().toISOString() };
    set({
      project: updated,
      script: updated.script ?? null,
      characters: updated.characters,
      voiceCastings: updated.voiceCastings,
      synthesisJob: updated.synthesisJob ?? null,
    });
    // Update meta list
    const projects = get().projects.map((p) => (p.id === updated.id ? toMeta(updated) : p));
    void writeProjectListMeta(projects);
    set({ projects });
  },

  setScript(script) {
    const current = get().project;
    if (!current) return;
    const updated = { ...current, script: script ?? undefined, updatedAt: new Date().toISOString() };
    set({ project: updated, script });
  },

  setCharacters(characters) {
    const current = get().project;
    if (!current) return;
    const updated = { ...current, characters, updatedAt: new Date().toISOString() };
    set({ project: updated, characters });
  },

  setVoiceCastings(castings) {
    const current = get().project;
    if (!current) return;
    const updated = { ...current, voiceCastings: castings, updatedAt: new Date().toISOString() };
    set({ project: updated, voiceCastings: castings });
  },

  setSynthesisJob(job) {
    const current = get().project;
    if (!current) return;
    const updated = { ...current, synthesisJob: job ?? undefined, updatedAt: new Date().toISOString() };
    set({ project: updated, synthesisJob: job });
  },

  updateSegmentJob(segmentId, patch) {
    const job = get().synthesisJob;
    if (!job) return;
    const segmentJobs = job.segmentJobs.map((sj) =>
      sj.segmentId === segmentId ? { ...sj, ...patch } : sj,
    );
    const updatedJob = { ...job, segmentJobs };
    get().setSynthesisJob(updatedJob);
  },

  async persistActiveProject() {
    const project = get().project;
    if (!project) return;
    await dbPutProject(project);
  },

  closeProject() {
    set({
      activeProjectId: null,
      project: null,
      script: null,
      characters: [],
      voiceCastings: [],
      synthesisJob: null,
    });
  },
}));
