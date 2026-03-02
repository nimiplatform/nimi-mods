// ---------------------------------------------------------------------------
// Zustand store for Voice Studio project state
// ---------------------------------------------------------------------------

import { create } from 'zustand';
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
// Project list meta (lightweight, persisted in localStorage)
// ---------------------------------------------------------------------------

type ProjectMeta = { id: string; name: string; state: ProjectState; updatedAt: string };

const LS_KEY = 'voice-studio:project-list';

function readProjectListMeta(): ProjectMeta[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeProjectListMeta(list: ProjectMeta[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(list));
}

function toMeta(p: VoiceProject): ProjectMeta {
  return { id: p.id, name: p.name, state: p.state, updatedAt: p.updatedAt };
}

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

type VoiceStudioStore = {
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
  loadProjectList: () => void;
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

export const useVoiceStudioStore = create<VoiceStudioStore>((set, get) => ({
  projects: [],
  activeProjectId: null,
  project: null,
  script: null,
  characters: [],
  voiceCastings: [],
  synthesisJob: null,

  loadProjectList() {
    set({ projects: readProjectListMeta() });
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
    writeProjectListMeta(projects);
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
    writeProjectListMeta(projects);
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
    writeProjectListMeta(projects);
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
