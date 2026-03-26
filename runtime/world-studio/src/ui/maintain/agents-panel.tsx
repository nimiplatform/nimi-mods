import React, { useEffect, useMemo, useRef, useState } from 'react';
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

type RegistryFilter = 'ALL' | 'ACTIVE_HERE';
type RegistrySort = 'DISPLAY_NAME' | 'IMPORTANCE';
type EditorPane = 'TRUTH' | 'RUNTIME' | 'METADATA' | 'ADVANCED';
type AgentsMode = 'overview' | 'focus';

const IMPORTANCE_RANK: Record<string, number> = {
  PRIMARY: 0,
  SUPPORTING: 1,
  SECONDARY: 2,
  BACKGROUND: 3,
};

function getAgentLabel(agent: WorldStudioCreatorAgentSummary): string {
  return agent.displayName || agent.handle || agent.id;
}

function StatPill(props: {
  label: string;
  value: string;
}): React.ReactElement {
  return (
    <div className="rounded-2xl bg-[#eef5f5] px-3 py-2 text-xs text-slate-700">
      <p className="font-semibold">{props.value}</p>
      <p className="mt-1">{props.label}</p>
    </div>
  );
}

function ReadonlyJsonCard(props: {
  title: string;
  value: unknown;
  heightClass?: string;
}): React.ReactElement {
  return (
    <div className="ui-sync-soft-card p-3 text-xs text-slate-700">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {props.title}
      </p>
      <textarea
        className={`${props.heightClass || 'h-40'} w-full rounded-md border border-gray-300 bg-gray-100 p-2 font-mono text-xs text-gray-600`}
        value={JSON.stringify(props.value || {}, null, 2)}
        readOnly
      />
    </div>
  );
}

function AgentTruthCard(props: {
  agent: WorldStudioCreatorAgentSummary;
}): React.ReactElement {
  return (
    <div className="ui-sync-soft-card p-3 text-xs text-slate-700">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {worldStudioMessage('agents.editor.truthSection', 'Agent truth')}
      </p>
      <p className="font-semibold text-slate-800">
        {worldStudioMessage('agents.editor.readable', 'Readable')}
      </p>
      <div className="mt-2 space-y-1">
        <p>{worldStudioMessage('agents.editor.handle', 'Handle: @{{value}}', { value: props.agent.handle || 'unknown' })}</p>
        <p>{worldStudioMessage('agents.editor.ownership', 'Ownership: {{value}}', { value: props.agent.ownershipType || '-' })}</p>
        <p>{worldStudioMessage('agents.editor.state', 'State: {{value}}', { value: props.agent.state || '-' })}</p>
        <p>{worldStudioMessage('agents.editor.world', 'World: {{value}}', { value: props.agent.worldId || '-' })}</p>
        <p>{worldStudioMessage('agents.editor.activeWorld', 'Active world: {{value}}', { value: props.agent.activeWorldId || '-' })}</p>
        <p>{worldStudioMessage('agents.editor.importance', 'Importance: {{value}}', { value: props.agent.importance || '-' })}</p>
      </div>
    </div>
  );
}

function AgentRuntimeCard(props: {
  agent: WorldStudioCreatorAgentSummary;
}): React.ReactElement {
  return (
    <div className="ui-sync-soft-card p-3 text-xs text-slate-700">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {worldStudioMessage('agents.editor.runtimeSection', 'Runtime signal')}
      </p>
      <p className="font-semibold text-slate-800">
        {worldStudioMessage('agents.editor.statsTitle', 'Realm stats')}
      </p>
      <div className="mt-2 space-y-1">
        <p>
          {worldStudioMessage('agents.editor.influenceTier', 'Influence tier: {{value}}', {
            value: props.agent.stats?.influenceTier || '-',
          })}
        </p>
        <p>
          {worldStudioMessage('agents.editor.interactionTier', 'Interaction tier: {{value}}', {
            value: props.agent.stats?.interactionTier || '-',
          })}
        </p>
        <p>
          {worldStudioMessage('agents.editor.vitalityScore', 'Vitality score: {{value}}', {
            value: props.agent.stats?.vitalityScore == null ? '-' : String(props.agent.stats.vitalityScore),
          })}
        </p>
        <p>
          {worldStudioMessage('agents.editor.engagementCount', 'Engagement count: {{value}}', {
            value: props.agent.stats?.engagementCount == null ? '-' : String(props.agent.stats.engagementCount),
          })}
        </p>
        <p>
          {worldStudioMessage('agents.editor.lastActiveAt', 'Last active: {{value}}', {
            value: props.agent.stats?.lastActiveAt || '-',
          })}
        </p>
      </div>
    </div>
  );
}

function AgentPersonaNotice(): React.ReactElement {
  return (
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
  );
}

function AgentInspectDrawer(props: {
  agent: WorldStudioCreatorAgentSummary;
  onClose: () => void;
  onOpenEditor: () => void;
}): React.ReactElement {
  return (
    <>
      <button
        type="button"
        aria-label={worldStudioMessage('shared.close', 'Close')}
        className="fixed inset-0 z-40 bg-slate-900/12 backdrop-blur-[1px]"
        onClick={props.onClose}
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-[400px] max-w-[92vw] flex-col border-l border-white/70 bg-[#f8fbfb] shadow-[-12px_0_28px_rgba(15,23,42,0.1)]">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              {worldStudioMessage('shared.inspect', 'Inspect')}
            </p>
            <h3 className="mt-1 text-base font-semibold text-slate-900">{getAgentLabel(props.agent)}</h3>
            <p className="mt-1 text-xs text-slate-500">
              @{props.agent.handle || 'unknown'} · {props.agent.state || 'UNKNOWN'} · {props.agent.importance || 'SECONDARY'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-slate-900 bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white"
              onClick={props.onOpenEditor}
            >
              {worldStudioMessage('shared.focusEdit', 'Focus Editor')}
            </button>
            <button
              type="button"
              className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600"
              onClick={props.onClose}
            >
              {worldStudioMessage('shared.close', 'Close')}
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          <div className="grid gap-2 md:grid-cols-3">
            <StatPill
              label={worldStudioMessage('agents.registry.summaryCards.remoteAgents', 'Remote agents')}
              value={props.agent.id ? '1' : '0'}
            />
            <StatPill
              label={worldStudioMessage('agents.editor.influenceTier', 'Influence tier: {{value}}', {
                value: props.agent.stats?.influenceTier || '-',
              })}
              value={props.agent.stats?.influenceTier || '-'}
            />
            <StatPill
              label={worldStudioMessage('agents.editor.vitalityScore', 'Vitality score: {{value}}', {
                value: props.agent.stats?.vitalityScore == null ? '-' : String(props.agent.stats.vitalityScore),
              })}
              value={props.agent.stats?.vitalityScore == null ? '-' : String(props.agent.stats.vitalityScore)}
            />
          </div>
          <AgentTruthCard agent={props.agent} />
          <AgentRuntimeCard agent={props.agent} />
          <ReadonlyJsonCard
            title={worldStudioMessage('agents.editor.liveStateTitle', 'Live state')}
            value={props.agent.liveState || {}}
            heightClass="h-32"
          />
          <AgentPersonaNotice />
        </div>
      </aside>
    </>
  );
}

export function AgentsRegistryPanel(props: {
  world: WorldSummary | null;
  creatorAgents: WorldStudioCreatorAgentSummary[];
  selectedAgent: WorldStudioCreatorAgentSummary | null;
  selectedAgentId: string;
  draftCharacterNames: string[];
  draftsByCharacter: Record<string, unknown>;
  working: boolean;
  onSelectAgent: (agentId: string) => void;
  onCreateAgentsFromDrafts: (characterNames?: string[]) => void;
  onSaveAgentMetadata: (agentId: string, patch: Record<string, unknown>) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
}): React.ReactElement {
  const [mode, setMode] = useState<AgentsMode>('overview');
  const [filter, setFilter] = useState<RegistryFilter>('ALL');
  const [sort, setSort] = useState<RegistrySort>('IMPORTANCE');
  const [inspectAgentId, setInspectAgentId] = useState('');

  const linkedAgentByCharacter = useMemo(() => new Map(
    props.draftCharacterNames.map((characterName) => [
      characterName,
      findLinkedCreatorAgent({
        creatorAgents: props.creatorAgents,
        draft: props.draftsByCharacter[characterName],
        characterName,
        worldId: props.world?.id || null,
      }),
    ]),
  ), [props.creatorAgents, props.draftCharacterNames, props.draftsByCharacter, props.world?.id]);

  const pendingCharacters = props.draftCharacterNames.filter((name) => !linkedAgentByCharacter.get(name));

  const visibleAgents = useMemo(() => {
    return props.creatorAgents
      .filter((agent) => {
        if (filter === 'ACTIVE_HERE') return agent.activeWorldId === props.world?.id;
        return true;
      })
      .sort((left, right) => {
        if (sort === 'DISPLAY_NAME') {
          return String(left.displayName || left.handle || left.id).localeCompare(String(right.displayName || right.handle || right.id));
        }
        const leftRank = IMPORTANCE_RANK[String(left.importance || 'SECONDARY').toUpperCase()] ?? 99;
        const rightRank = IMPORTANCE_RANK[String(right.importance || 'SECONDARY').toUpperCase()] ?? 99;
        if (leftRank !== rightRank) return leftRank - rightRank;
        return String(left.displayName || left.handle || left.id).localeCompare(String(right.displayName || right.handle || right.id));
      });
  }, [filter, props.creatorAgents, props.world?.id, sort]);

  const inspectedAgent = useMemo(() => {
    if (!inspectAgentId) return null;
    return props.creatorAgents.find((agent) => agent.id === inspectAgentId) || null;
  }, [inspectAgentId, props.creatorAgents]);

  const focusedAgent = useMemo(() => {
    if (props.selectedAgent) {
      return props.selectedAgent;
    }
    if (!props.selectedAgentId) {
      return null;
    }
    return props.creatorAgents.find((agent) => agent.id === props.selectedAgentId) || null;
  }, [props.creatorAgents, props.selectedAgent, props.selectedAgentId]);

  useEffect(() => {
    if (mode === 'focus' && !focusedAgent) {
      setMode('overview');
    }
  }, [focusedAgent, mode]);

  const summaryCards = [
    {
      label: worldStudioMessage('agents.registry.summaryCards.remoteAgents', 'Remote agents'),
      value: String(props.creatorAgents.length),
    },
    {
      label: worldStudioMessage('agents.registry.summaryCards.pendingDrafts', 'Pending draft candidates'),
      value: String(pendingCharacters.length),
    },
    {
      label: worldStudioMessage('agents.registry.summaryCards.activeHere', 'Active in this world'),
      value: String(props.creatorAgents.filter((agent) => agent.activeWorldId === props.world?.id).length),
    },
  ];

  const rosterSection = (
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
        {pendingCharacters.length > 0 ? (
          <button
            type="button"
            className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
            onClick={() => props.onCreateAgentsFromDrafts(pendingCharacters)}
          >
            {worldStudioMessage('maintain.createMissingDraftAgents', 'Create Missing Draft Agents')}
          </button>
        ) : null}
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {summaryCards.map((card) => (
          <StatPill key={card.label} label={card.label} value={card.value} />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {([
          ['ALL', worldStudioMessage('agents.registry.filters.all', 'All')],
          ['ACTIVE_HERE', worldStudioMessage('agents.registry.filters.activeHere', 'Active Here')],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              filter === value ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700'
            }`}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
          <span>{worldStudioMessage('agents.registry.sortLabel', 'Sort')}</span>
          <button
            type="button"
            className={`rounded-full border px-3 py-1 font-semibold ${
              sort === 'IMPORTANCE' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700'
            }`}
            onClick={() => setSort('IMPORTANCE')}
          >
            {worldStudioMessage('agents.registry.sortImportance', 'Importance')}
          </button>
          <button
            type="button"
            className={`rounded-full border px-3 py-1 font-semibold ${
              sort === 'DISPLAY_NAME' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700'
            }`}
            onClick={() => setSort('DISPLAY_NAME')}
          >
            {worldStudioMessage('agents.registry.sortName', 'Name')}
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {visibleAgents.length === 0 ? (
          <p className="text-xs text-gray-500">
            {worldStudioMessage('agents.registry.empty', 'No world-owned agents are available yet.')}
          </p>
        ) : visibleAgents.map((agent) => {
          const selected = mode === 'focus'
            ? focusedAgent?.id === agent.id
            : inspectAgentId === agent.id;
          return (
            <button
              key={agent.id}
              type="button"
              className={`rounded-[18px] border p-3 text-left transition ${
                selected
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-900 hover:border-slate-300'
              }`}
              onClick={() => {
                props.onSelectAgent(agent.id);
                if (mode === 'focus') {
                  setInspectAgentId('');
                  return;
                }
                setInspectAgentId(agent.id);
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{getAgentLabel(agent)}</p>
                  <p className={`mt-1 text-xs ${selected ? 'text-slate-200' : 'text-slate-500'}`}>
                    @{agent.handle || 'unknown'} · {agent.state || 'UNKNOWN'} · {agent.ownershipType || 'UNKNOWN'}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  selected ? 'bg-white/15 text-white' : 'bg-[#eef5f5] text-slate-700'
                }`}>
                  {agent.importance || 'SECONDARY'}
                </span>
              </div>
              <div className={`mt-3 flex flex-wrap gap-1.5 text-[11px] ${selected ? 'text-slate-200' : 'text-slate-500'}`}>
                <span>{worldStudioMessage('agents.editor.activeWorld', 'Active world: {{value}}', { value: agent.activeWorldId || '-' })}</span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <p className={`text-[11px] ${selected ? 'text-slate-300' : 'text-slate-500'}`}>
                  {worldStudioMessage('agents.registry.statsHint', 'Stats: vitality {{value}}', {
                    value: agent.stats?.vitalityScore == null ? '-' : String(agent.stats.vitalityScore),
                  })}
                </p>
                <span className={`text-[11px] font-semibold ${selected ? 'text-white' : 'text-slate-700'}`}>
                  {worldStudioMessage('shared.inspect', 'Inspect')}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );

  const draftCandidatesSection = (
    <section className="ui-sync-card ui-sync-card-inset p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            {worldStudioMessage('agents.registry.draftCandidatesTitle', 'Draft candidates')}
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            {worldStudioMessage(
              'agents.registry.draftCandidatesDescription',
              'Characters extracted from the draft can be promoted into world-owned agents from here.',
            )}
          </p>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {props.draftCharacterNames.length === 0 ? (
          <p className="text-xs text-gray-500">
            {worldStudioMessage('agents.registry.draftCandidatesEmpty', 'No agent draft candidates are available.')}
          </p>
        ) : props.draftCharacterNames.map((name) => {
          const linkedAgent = linkedAgentByCharacter.get(name);
          return (
            <div
              key={name}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-slate-200 bg-white px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">{name}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {linkedAgent
                    ? worldStudioMessage('agents.registry.linkedHint', 'Linked to remote agent {{value}}.', {
                        value: getAgentLabel(linkedAgent),
                      })
                    : worldStudioMessage('agents.registry.pendingHint', '{{count}} draft candidates still need remote agents before assets can sync cleanly.', {
                        count: pendingCharacters.length,
                      })}
                </p>
              </div>
              {linkedAgent ? (
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                  onClick={() => {
                    props.onSelectAgent(linkedAgent.id);
                    if (mode === 'focus') {
                      setInspectAgentId('');
                      return;
                    }
                    setInspectAgentId(linkedAgent.id);
                  }}
                >
                  {worldStudioMessage('shared.inspect', 'Inspect')}
                </button>
              ) : (
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-slate-900 bg-slate-900 px-3 py-1 text-xs font-semibold text-white"
                  onClick={() => props.onCreateAgentsFromDrafts([name])}
                >
                  {worldStudioMessage('maintain.createMissingDraftAgents', 'Create Missing Draft Agents')}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );

  if (mode === 'focus') {
    return (
      <div className="space-y-4">
        <section className="ui-sync-card ui-sync-card-inset p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                {worldStudioMessage('worldview.focus.label', 'Focused Editor')}
              </p>
              <h3 className="mt-1 text-sm font-semibold text-slate-900">
                {focusedAgent ? getAgentLabel(focusedAgent) : worldStudioMessage('agents.editor.title', 'Agent Editor')}
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                {worldStudioMessage(
                  'agents.registry.focusSummary',
                  'Focused editing belongs to the currently selected agent only; once you enter focus mode, the main editor surface should belong to that agent.',
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600"
                onClick={() => {
                  setInspectAgentId(props.selectedAgentId || '');
                  setMode('overview');
                }}
              >
                {worldStudioMessage('agents.editor.backToInspect', 'Back to Current Agent')}
              </button>
              <button
                type="button"
                className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600"
                onClick={() => {
                  setInspectAgentId('');
                  setMode('overview');
                }}
              >
                {worldStudioMessage('agents.editor.backToRoster', 'Back to Roster')}
              </button>
            </div>
          </div>
        </section>

        <div className="min-w-0">
          <AgentEditorPanel
            agent={focusedAgent}
            working={props.working}
            onSave={props.onSaveAgentMetadata}
            onDirtyChange={props.onDirtyChange}
            onBackToInspect={() => {
              setInspectAgentId(props.selectedAgentId || '');
              setMode('overview');
            }}
            onBackToOverview={() => {
              setInspectAgentId('');
              setMode('overview');
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative space-y-4">
      {rosterSection}
      {draftCandidatesSection}

      {inspectedAgent ? (
        <AgentInspectDrawer
          agent={inspectedAgent}
          onClose={() => setInspectAgentId('')}
          onOpenEditor={() => {
            props.onSelectAgent(inspectedAgent.id);
            setInspectAgentId('');
            setMode('focus');
          }}
        />
      ) : null}
    </div>
  );
}

function AgentEditorPanel(props: {
  agent: WorldStudioCreatorAgentSummary | null;
  working?: boolean;
  onSave: (agentId: string, patch: Record<string, unknown>) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
  onBackToInspect: () => void;
  onBackToOverview: () => void;
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
  const [activePane, setActivePane] = useState<EditorPane>('METADATA');
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
    } else if (agentId !== loadedAgentIdRef.current || !localDirtyRef.current) {
      hydrateFromAgent(props.agent);
    }
    setActivePane('METADATA');
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
            'Select a world-owned agent from the roster before entering focused metadata editing.',
          )}
        </p>
      </section>
    );
  }
  const agent = props.agent;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const capabilities = asRecord(JSON.parse(capabilitiesText || '{}'));
      setJsonError(null);
      await props.onSave(agent.id, {
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
      onDirtyChangeRef.current(Object.keys(draftCacheRef.current).length > 0);
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : String(error));
    }
  };

  const paneItems: Array<{ id: EditorPane; label: string }> = [
    { id: 'METADATA', label: worldStudioMessage('agents.editor.metadataSection', 'Editable metadata') },
    { id: 'TRUTH', label: worldStudioMessage('agents.editor.truthSection', 'Agent truth') },
    { id: 'RUNTIME', label: worldStudioMessage('agents.editor.runtimeSection', 'Runtime signal') },
    { id: 'ADVANCED', label: worldStudioMessage('agents.editor.capabilitiesJson', 'Capabilities JSON') },
  ];

  return (
    <form
      id="world-studio-agent-editor-form"
      className="space-y-4"
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
    >
      <section className="ui-sync-card ui-sync-card-inset p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              {worldStudioMessage('agents.editor.title', 'Agent Editor')}
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              {worldStudioMessage(
                'agents.editor.subtitle',
                'This focused editor only changes the currently selected agent. Metadata editing is available now; full persona editing remains a later realm API milestone.',
              )}
            </p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{getAgentLabel(agent)}</p>
            <p className="mt-1 text-xs text-slate-500">
              @{agent.handle || 'unknown'} · {agent.state || 'UNKNOWN'} · {agent.ownershipType || 'UNKNOWN'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              className="ui-sync-btn ui-sync-btn-primary rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              disabled={props.working || !agentId}
            >
              {worldStudioMessage('maintain.saveAgentMetadata', 'Save Agent Metadata')}
            </button>
            <button
              type="button"
              className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600"
              onClick={props.onBackToInspect}
            >
              {worldStudioMessage('agents.editor.backToInspect', 'Back to Current Agent')}
            </button>
            <button
              type="button"
              className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600"
              onClick={props.onBackToOverview}
            >
              {worldStudioMessage('agents.editor.backToRoster', 'Back to Roster')}
            </button>
            <span className="rounded-full bg-[#eef5f5] px-3 py-1 text-xs font-medium text-slate-700">
              {worldStudioMessage('agents.editor.importance', 'Importance: {{value}}', { value: agent.importance || '-' })}
            </span>
            <span className="rounded-full bg-[#eef5f5] px-3 py-1 text-xs font-medium text-slate-700">
              {worldStudioMessage('agents.editor.activeWorld', 'Active world: {{value}}', { value: agent.activeWorldId || '-' })}
            </span>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
        <div className="ui-sync-card ui-sync-card-inset p-3">
          <div className="space-y-1.5">
            {paneItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`w-full rounded-lg px-3 py-2 text-left text-xs font-semibold ${
                  activePane === item.id
                    ? 'bg-[#ecfaf6] text-slate-900'
                    : 'bg-slate-50 text-slate-600'
                }`}
                onClick={() => setActivePane(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {activePane === 'METADATA' ? (
            <section className="ui-sync-card ui-sync-card-inset p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-xs text-gray-700">
                  <span className="mb-1 block font-medium">{worldStudioMessage('agents.editor.displayName', 'Display Name')}</span>
                  <input className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
                </label>
                <label className="text-xs text-gray-700">
                  <span className="mb-1 block font-medium">{worldStudioMessage('agents.editor.avatarUrl', 'Avatar URL')}</span>
                  <input className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs" value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} />
                </label>
                <label className="text-xs text-gray-700">
                  <span className="mb-1 block font-medium">{worldStudioMessage('agents.editor.category', 'Category')}</span>
                  <input className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs" value={category} onChange={(event) => setCategory(event.target.value)} />
                </label>
                <label className="text-xs text-gray-700">
                  <span className="mb-1 block font-medium">{worldStudioMessage('agents.editor.contentRating', 'Content Rating')}</span>
                  <input className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs" value={contentRating} onChange={(event) => setContentRating(event.target.value)} />
                </label>
                <label className="text-xs text-gray-700 md:col-span-2">
                  <span className="mb-1 block font-medium">{worldStudioMessage('agents.editor.bio', 'Bio')}</span>
                  <textarea className="h-24 w-full rounded-md border border-gray-300 p-2 text-xs" value={bio} onChange={(event) => setBio(event.target.value)} />
                </label>
                <label className="text-xs text-gray-700">
                  <span className="mb-1 block font-medium">{worldStudioMessage('agents.editor.tags', 'Tags')}</span>
                  <input className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs" value={tagsText} onChange={(event) => setTagsText(event.target.value)} />
                </label>
                <label className="text-xs text-gray-700">
                  <span className="mb-1 block font-medium">{worldStudioMessage('agents.editor.webhookUrl', 'Webhook URL')}</span>
                  <input className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs" value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)} />
                </label>
              </div>
            </section>
          ) : null}

          {activePane === 'TRUTH' ? (
            <div className="grid gap-4 md:grid-cols-2">
              <AgentTruthCard agent={agent} />
              <AgentPersonaNotice />
            </div>
          ) : null}

          {activePane === 'RUNTIME' ? (
            <div className="grid gap-4 md:grid-cols-2">
              <AgentRuntimeCard agent={agent} />
              <ReadonlyJsonCard
                title={worldStudioMessage('agents.editor.liveStateTitle', 'Live state')}
                value={agent.liveState || {}}
                heightClass="h-32"
              />
            </div>
          ) : null}

          {activePane === 'ADVANCED' ? (
            <section className="ui-sync-card ui-sync-card-inset p-4">
              <label className="block text-xs text-gray-700">
                <span className="mb-1 block font-medium">{worldStudioMessage('agents.editor.capabilitiesJson', 'Capabilities JSON')}</span>
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
                  value={JSON.stringify(agent.dna || {}, null, 2)}
                  readOnly
                />
              </details>
            </section>
          ) : null}
        </div>
      </section>
    </form>
  );
}
