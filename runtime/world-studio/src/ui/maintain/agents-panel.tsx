import React, { useEffect, useRef, useState } from 'react';
import type { WorldStudioCreatorAgentSummary, WorldSummary } from '../../ui/types.js';
import { findLinkedCreatorAgent } from '../../services/creator-agent-link.js';
import { worldStudioMessage } from '../../i18n/messages.js';
import { asRecord } from "@nimiplatform/sdk/mod";

function normalizeTagsText(tags: string[]): string {
  return tags.map((item) => item.trim()).filter(Boolean).join(', ');
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonValue(item));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, sortJsonValue((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

function normalizeJsonText(value: unknown): string {
  return JSON.stringify(sortJsonValue(asRecord(value)));
}

type AgentEditorDraftState = {
  displayName: string;
  bio: string;
  avatarUrl: string;
  tagsText: string;
  category: string;
  contentRating: string;
  webhookUrl: string;
  capabilitiesText: string;
};

export function AgentsRegistryPanel(props: {
  world: WorldSummary | null;
  creatorAgents: WorldStudioCreatorAgentSummary[];
  selectedAgentId: string;
  draftCharacterNames: string[];
  draftsByCharacter: Record<string, unknown>;
  onSelectAgent: (agentId: string) => void;
  onCreateAgentsFromDrafts: (characterNames?: string[]) => void;
}): React.ReactElement {
  const linkedAgentByCharacter = new Map(
    props.draftCharacterNames.map((characterName) => [
      characterName,
      findLinkedCreatorAgent({
        creatorAgents: props.creatorAgents,
        draft: props.draftsByCharacter[characterName],
        characterName,
        worldId: props.world?.id || null,
      }),
    ]),
  );
  const pendingCharacters = props.draftCharacterNames.filter((name) => !linkedAgentByCharacter.get(name));
  return (
    <div className="space-y-4">
      <section className="ui-sync-card ui-sync-card-inset p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              {worldStudioMessage('agents.registry.title', 'World-owned agents')}
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              {worldStudioMessage('agents.registry.summary', '{{worldName}} currently exposes {{count}} agent records.', {
                worldName: props.world?.name || worldStudioMessage('agents.registry.currentWorld', 'Current world'),
                count: props.creatorAgents.length,
              })}
            </p>
          </div>
          <button
            type="button"
            className="ui-sync-btn ui-sync-btn-primary rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            disabled={pendingCharacters.length === 0}
            onClick={() => props.onCreateAgentsFromDrafts(pendingCharacters)}
          >
            {worldStudioMessage('agents.registry.createMissing', 'Create Missing Draft Agents')}
          </button>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {props.creatorAgents.length === 0 ? (
            <p className="text-xs text-gray-500">
              {worldStudioMessage('agents.registry.empty', 'No world-owned agents are available yet.')}
            </p>
          ) : props.creatorAgents.map((agent) => (
            <button
              key={agent.id}
              type="button"
              className={`rounded-[18px] border p-3 text-left ${
                agent.id === props.selectedAgentId
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-900'
              }`}
              onClick={() => props.onSelectAgent(agent.id)}
            >
              <p className="text-sm font-semibold">{agent.displayName || agent.handle || agent.id}</p>
              <p className={`mt-1 text-xs ${agent.id === props.selectedAgentId ? 'text-slate-200' : 'text-slate-500'}`}>
                @{agent.handle || 'unknown'} · {agent.state || 'UNKNOWN'} · {agent.ownershipType || 'UNKNOWN'}
              </p>
            </button>
          ))}
        </div>
      </section>

      <section className="ui-sync-card ui-sync-card-inset p-4">
        <h3 className="text-sm font-semibold text-gray-900">
          {worldStudioMessage('agents.registry.draftCandidatesTitle', 'Draft candidates')}
        </h3>
        <p className="mt-1 text-xs text-gray-500">
          {worldStudioMessage(
            'agents.registry.draftCandidatesDescription',
            'Characters extracted from the draft can be promoted into world-owned agents from here.',
          )}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {props.draftCharacterNames.length === 0 ? (
            <p className="text-xs text-gray-500">
              {worldStudioMessage('agents.registry.draftCandidatesEmpty', 'No agent draft candidates are available.')}
            </p>
          ) : props.draftCharacterNames.map((name) => (
            <span
              key={name}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                linkedAgentByCharacter.get(name)
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              {name}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

export function AgentEditorPanel(props: {
  agent: WorldStudioCreatorAgentSummary | null;
  onSave: (agentId: string, patch: Record<string, unknown>) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
}): React.ReactElement {
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [category, setCategory] = useState('');
  const [contentRating, setContentRating] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [capabilitiesText, setCapabilitiesText] = useState('{}');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const agentId = String(props.agent?.id || '');
  const loadedAgentIdRef = useRef('');
  const localDirtyRef = useRef(false);
  const onDirtyChangeRef = useRef(props.onDirtyChange);
  const previousAgentIdRef = useRef('');
  const draftCacheRef = useRef<Record<string, AgentEditorDraftState>>({});
  const currentDraftRef = useRef<AgentEditorDraftState>({
    displayName: '',
    bio: '',
    avatarUrl: '',
    tagsText: '',
    category: '',
    contentRating: '',
    webhookUrl: '',
    capabilitiesText: '{}',
  });

  const hydrateFromAgent = (agent: WorldStudioCreatorAgentSummary | null) => {
    loadedAgentIdRef.current = String(agent?.id || '');
    localDirtyRef.current = false;
    setDisplayName(agent?.displayName || '');
    setBio(agent?.bio || '');
    setAvatarUrl(agent?.avatarUrl || '');
    setTagsText(normalizeTagsText(agent?.tags || []));
    setCategory(agent?.category || '');
    setContentRating(agent?.contentRating || '');
    setWebhookUrl(agent?.webhookUrl || '');
    setCapabilitiesText(JSON.stringify(agent?.capabilities || {}, null, 2));
    setJsonError(null);
  };

  const hydrateFromDraft = (nextAgentId: string, draft: AgentEditorDraftState) => {
    loadedAgentIdRef.current = nextAgentId;
    localDirtyRef.current = true;
    setDisplayName(draft.displayName);
    setBio(draft.bio);
    setAvatarUrl(draft.avatarUrl);
    setTagsText(draft.tagsText);
    setCategory(draft.category);
    setContentRating(draft.contentRating);
    setWebhookUrl(draft.webhookUrl);
    setCapabilitiesText(draft.capabilitiesText);
    setJsonError(null);
  };

  useEffect(() => {
    onDirtyChangeRef.current = props.onDirtyChange;
  }, [props.onDirtyChange]);

  useEffect(() => {
    currentDraftRef.current = {
      displayName,
      bio,
      avatarUrl,
      tagsText,
      category,
      contentRating,
      webhookUrl,
      capabilitiesText,
    };
  }, [
    displayName,
    bio,
    avatarUrl,
    tagsText,
    category,
    contentRating,
    webhookUrl,
    capabilitiesText,
  ]);

  useEffect(() => {
    const previousAgentId = previousAgentIdRef.current;
    if (previousAgentId && previousAgentId !== agentId && localDirtyRef.current) {
      draftCacheRef.current[previousAgentId] = currentDraftRef.current;
    }
    previousAgentIdRef.current = agentId;

    const cachedDraft = agentId ? draftCacheRef.current[agentId] : null;
    if (cachedDraft) {
      hydrateFromDraft(agentId, cachedDraft);
      return;
    }
    if (agentId !== loadedAgentIdRef.current || !localDirtyRef.current) {
      hydrateFromAgent(props.agent);
    }
  }, [agentId, props.agent]);

  useEffect(() => {
    if (!props.agent) {
      localDirtyRef.current = false;
      onDirtyChangeRef.current(Object.keys(draftCacheRef.current).length > 0);
      return;
    }

    let dirty = false;
    try {
      dirty = (
        displayName !== (props.agent.displayName || '')
        || bio !== (props.agent.bio || '')
        || avatarUrl !== (props.agent.avatarUrl || '')
        || normalizeTagsText(tagsText.split(',').map((item) => item.trim()).filter(Boolean))
          !== normalizeTagsText(props.agent.tags || [])
        || category !== (props.agent.category || '')
        || contentRating !== (props.agent.contentRating || '')
        || webhookUrl !== (props.agent.webhookUrl || '')
        || normalizeJsonText(JSON.parse(capabilitiesText || '{}')) !== normalizeJsonText(props.agent.capabilities || {})
      );
    } catch {
      dirty = true;
    }
    localDirtyRef.current = dirty;
    if (dirty) {
      draftCacheRef.current[agentId] = currentDraftRef.current;
    } else if (agentId) {
      delete draftCacheRef.current[agentId];
    }
    onDirtyChangeRef.current(dirty || Object.keys(draftCacheRef.current).length > 0);
  }, [
    agentId,
    props.agent,
    displayName,
    bio,
    avatarUrl,
    tagsText,
    category,
    contentRating,
    webhookUrl,
    capabilitiesText,
  ]);

  if (!props.agent) {
    return (
      <section className="ui-sync-card ui-sync-card-inset p-4">
        <h3 className="text-sm font-semibold text-gray-900">
          {worldStudioMessage('agents.editor.title', 'Agent Editor')}
        </h3>
        <p className="mt-2 text-xs text-gray-500">
          {worldStudioMessage(
            'agents.editor.empty',
            'Select a world-owned agent from Registry to inspect and edit its metadata.',
          )}
        </p>
      </section>
    );
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const capabilities = asRecord(JSON.parse(capabilitiesText || '{}'));
      setJsonError(null);
      await props.onSave(props.agent!.id, {
        displayName,
        bio,
        avatarUrl,
        tags: tagsText.split(',').map((item) => item.trim()).filter(Boolean),
        category,
        contentRating,
        webhookUrl,
        capabilities,
      });
      delete draftCacheRef.current[agentId];
      localDirtyRef.current = false;
      onDirtyChangeRef.current(false);
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <form
      id="world-studio-agent-editor-form"
      className="ui-sync-card ui-sync-card-inset p-4"
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            {worldStudioMessage('agents.editor.title', 'Agent Editor')}
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            {worldStudioMessage(
              'agents.editor.subtitle',
              'Metadata editing is available now; full persona editing remains a later realm API milestone.',
            )}
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="ui-sync-soft-card p-3 text-xs text-slate-700">
          <p><span className="font-semibold">{worldStudioMessage('agents.editor.readable', 'Readable')}</span></p>
          <p className="mt-1">
            {worldStudioMessage('agents.editor.handle', 'Handle: @{{value}}', { value: props.agent.handle || 'unknown' })}
          </p>
          <p>{worldStudioMessage('agents.editor.ownership', 'Ownership: {{value}}', { value: props.agent.ownershipType || '-' })}</p>
          <p>{worldStudioMessage('agents.editor.state', 'State: {{value}}', { value: props.agent.state || '-' })}</p>
          <p>{worldStudioMessage('agents.editor.world', 'World: {{value}}', { value: props.agent.worldId || '-' })}</p>
        </div>
        <div className="rounded-[18px] border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-600">
          <p className="font-semibold text-slate-800">
            {worldStudioMessage('agents.editor.personaTitle', 'Persona editing')}
          </p>
          <p className="mt-1">
            {worldStudioMessage(
              'agents.editor.personaDescription',
              'Complete persona fields such as concept, scenario, greeting, rules, lorebooks, and fine-grained DNA editing will be unlocked after realm exposes a fuller agent detail contract.',
            )}
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="text-xs text-gray-700">
          <span className="mb-1 block font-medium">Display Name</span>
          <input className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
        </label>
        <label className="text-xs text-gray-700">
          <span className="mb-1 block font-medium">Avatar URL</span>
          <input className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs" value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} />
        </label>
        <label className="text-xs text-gray-700">
          <span className="mb-1 block font-medium">Category</span>
          <input className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs" value={category} onChange={(event) => setCategory(event.target.value)} />
        </label>
        <label className="text-xs text-gray-700">
          <span className="mb-1 block font-medium">Content Rating</span>
          <input className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs" value={contentRating} onChange={(event) => setContentRating(event.target.value)} />
        </label>
        <label className="text-xs text-gray-700 md:col-span-2">
          <span className="mb-1 block font-medium">Bio</span>
          <textarea className="h-24 w-full rounded-md border border-gray-300 p-2 text-xs" value={bio} onChange={(event) => setBio(event.target.value)} />
        </label>
        <label className="text-xs text-gray-700">
          <span className="mb-1 block font-medium">Tags</span>
          <input className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs" value={tagsText} onChange={(event) => setTagsText(event.target.value)} />
        </label>
        <label className="text-xs text-gray-700">
          <span className="mb-1 block font-medium">Webhook URL</span>
          <input className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs" value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)} />
        </label>
      </div>

      <label className="mt-3 block text-xs text-gray-700">
        <span className="mb-1 block font-medium">Capabilities JSON</span>
        <textarea className="h-40 w-full rounded-md border border-gray-300 p-2 font-mono text-xs" value={capabilitiesText} onChange={(event) => setCapabilitiesText(event.target.value)} />
      </label>
      {jsonError ? (
        <p className="mt-2 text-xs text-red-600">{jsonError}</p>
      ) : null}

      <details className="ui-sync-code-panel mt-3 p-2">
        <summary className="cursor-pointer text-xs font-semibold text-gray-700">
          {worldStudioMessage('agents.editor.dnaSnapshot', 'Readable DNA snapshot')}
        </summary>
        <textarea
          className="mt-2 h-48 w-full rounded-md border border-gray-300 bg-gray-100 p-2 font-mono text-xs text-gray-600"
          value={JSON.stringify(props.agent.dna || {}, null, 2)}
          readOnly
        />
      </details>
    </form>
  );
}
