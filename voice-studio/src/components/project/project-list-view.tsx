// ---------------------------------------------------------------------------
// Project list view — card grid with create button
// ---------------------------------------------------------------------------

import React, { useState } from 'react';
import type { ProjectState } from '../../types.js';

type ProjectMeta = { id: string; name: string; state: ProjectState; updatedAt: string };

type ProjectListViewProps = {
  projects: ProjectMeta[];
  onOpen: (id: string) => void;
  onCreate: (name: string) => void;
  onDelete: (id: string) => void;
};

const STATE_LABELS: Record<ProjectState, string> = {
  draft: 'Draft',
  imported: 'Imported',
  analyzing: 'Analyzing...',
  analyzed: 'Analyzed',
  casting: 'Casting...',
  cast_complete: 'Cast Complete',
  synthesizing: 'Synthesizing...',
  done: 'Done',
  done_with_errors: 'Done (errors)',
  cancelled: 'Cancelled',
  paused: 'Paused',
};

export function ProjectListView(props: ProjectListViewProps) {
  const { projects, onOpen, onCreate, onDelete } = props;
  const [newName, setNewName] = useState('');

  const handleCreate = () => {
    const name = newName.trim() || 'Untitled';
    onCreate(name);
    setNewName('');
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Voice Studio Projects</h2>
      </div>

      {/* Create new project */}
      <div className="mb-6 flex items-center gap-2">
        <input
          type="text"
          placeholder="New project name..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={handleCreate}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Create
        </button>
      </div>

      {/* Project grid */}
      {projects.length === 0 ? (
        <p className="text-sm text-gray-500">No projects yet. Create one to get started.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <div
              key={p.id}
              className="group rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:shadow-md"
            >
              <button
                type="button"
                onClick={() => onOpen(p.id)}
                className="block w-full text-left"
              >
                <h3 className="truncate text-sm font-semibold text-gray-900">{p.name}</h3>
                <p className="mt-1 text-xs text-gray-500">
                  {STATE_LABELS[p.state]} &middot; {new Date(p.updatedAt).toLocaleDateString()}
                </p>
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(p.id); }}
                className="mt-2 text-xs text-red-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-600"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
