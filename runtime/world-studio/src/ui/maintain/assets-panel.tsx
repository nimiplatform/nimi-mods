import React from 'react';
import type { WorldStudioCreatorAgentSummary, WorldStudioMediaBindingSummary } from '../../ui/types.js';
import { findLinkedCreatorAgent } from '../../services/creator-agent-link.js';
import { useModTranslation } from "@nimiplatform/sdk/mod";
import { asRecord } from "@nimiplatform/sdk/mod";

function SectionCard(props: {
  title: string;
  description: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="ui-sync-card ui-sync-card-inset p-4">
      <h3 className="text-sm font-semibold text-gray-900">{props.title}</h3>
      <p className="mt-1 text-xs text-gray-500">{props.description}</p>
      <div className="mt-3">{props.children}</div>
    </section>
  );
}

function RenderBindingList(props: {
  title: string;
  description?: string;
  items: WorldStudioMediaBindingSummary[];
}) {
  const { t } = useModTranslation('world-studio');
  return (
    <SectionCard title={props.title} description={props.description || t('assets.synced.description', 'These are the bindings that already exist remotely as world truth.')}>
      <div className="space-y-3">
        {props.items.length === 0 ? (
          <p className="text-xs text-gray-500">{t('assets.synced.empty', 'No synced media bindings yet.')}</p>
        ) : props.items.map((binding) => (
          <div key={`${binding.id || binding.slot}-${binding.targetId}`} className="rounded-[18px] border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">{binding.slot}</span>
              <span>{binding.targetType}:{binding.targetId}</span>
            </div>
            <p className="mt-2 break-all text-xs text-slate-700">{binding.asset.storageRef || t('assets.synced.noStorageRef', 'No asset storageRef')}</p>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function SummaryCards(props: {
  items: Array<{ label: string; value: string }>;
}): React.ReactElement {
  return (
    <div className="grid gap-2 md:grid-cols-3">
      {props.items.map((item) => (
        <div key={item.label} className="rounded-2xl bg-[#eef5f5] px-3 py-2 text-xs text-slate-700">
          <p className="font-semibold">{item.value}</p>
          <p className="mt-1">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

function MissingCoverageCard(props: {
  title: string;
  description: string;
  items: string[];
}): React.ReactElement {
  const { t } = useModTranslation('world-studio');
  return (
    <SectionCard title={props.title} description={props.description}>
      {props.items.length === 0 ? (
        <p className="text-xs text-emerald-700">{t('assets.missing.none', 'All tracked slots are covered.')}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {props.items.map((item) => (
            <span key={item} className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              {item}
            </span>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

export function WorldAssetsPanel(props: {
  mediaBindings: WorldStudioMediaBindingSummary[];
  worldCoverUrl: string | null;
  locationImages: Record<string, unknown>;
}): React.ReactElement {
  const { t } = useModTranslation('world-studio');
  const worldBindings = props.mediaBindings.filter((item) => item.targetType === 'WORLD');
  const syncedSlots = new Set(worldBindings.map((item) => item.slot));
  const generatedLocations = Object.entries(props.locationImages || {})
    .map(([name, draft]) => ({
      name,
      imageUrl: String(asRecord(draft).imageUrl || '').trim(),
    }))
    .filter((item) => item.imageUrl);
  const missingSlots = ['WORLD_ICON', 'WORLD_BANNER', 'WORLD_GALLERY'].filter((slot) => !syncedSlots.has(slot));
  const summaryCards = [
    { label: t('assets.world.summary.generatedCover', 'Generated cover'), value: props.worldCoverUrl ? '1' : '0' },
    { label: t('assets.world.summary.generatedLocations', 'Generated location images'), value: String(generatedLocations.length) },
    { label: t('assets.world.summary.syncedBindings', 'Synced bindings'), value: String(worldBindings.length) },
  ];
  return (
    <div className="space-y-4">
      <SummaryCards items={summaryCards} />
      <SectionCard title={t('assets.world.generatedTitle', 'Generated World Assets')} description={t('assets.world.generatedDescription', 'These are local outputs produced during create or maintenance flows.')}>
        <div className="space-y-2 text-xs text-slate-700">
          <p>{t('assets.world.cover', 'World cover: {{value}}', {
            value: props.worldCoverUrl || t('assets.world.noGeneratedCover', 'No generated cover yet'),
          })}</p>
          <p>{t('assets.world.locationImages', 'Generated location images: {{count}}', {
            count: generatedLocations.length,
          })}</p>
        </div>
      </SectionCard>
      <RenderBindingList title={t('assets.world.syncedTitle', 'Synced World Assets')} description={t('assets.world.syncedDescription', 'These bindings are already persisted remotely and visible to runtime consumers.')} items={worldBindings} />
      <MissingCoverageCard
        title={t('assets.world.missingTitle', 'Missing or unsynced coverage')}
        description={t('assets.world.missingDescription', 'These tracked world asset slots still need generation or sync before the world asset surface feels complete.')}
        items={missingSlots}
      />
    </div>
  );
}

export function AgentAssetsPanel(props: {
  mediaBindings: WorldStudioMediaBindingSummary[];
  creatorAgents: WorldStudioCreatorAgentSummary[];
  portraits: Record<string, unknown>;
  draftsByCharacter: Record<string, unknown>;
  worldId: string;
}): React.ReactElement {
  const { t } = useModTranslation('world-studio');
  const agentBindings = props.mediaBindings.filter((item) => item.targetType === 'AGENT');
  const localPortraits = Object.entries(props.portraits || {})
    .map(([name, draft]) => ({
      name,
      imageUrl: String(asRecord(draft).imageUrl || '').trim(),
      remoteAgent: findLinkedCreatorAgent({
        creatorAgents: props.creatorAgents,
        draft: props.draftsByCharacter[name],
        characterName: name,
        worldId: props.worldId,
      }),
    }))
    .filter((item) => item.imageUrl);
  const linkedPortraits = localPortraits.filter((item) => item.remoteAgent);
  const missingRemotePortraits = localPortraits.filter((item) => !item.remoteAgent);
  const summaryCards = [
    { label: t('assets.agent.summary.generatedPortraits', 'Generated portraits'), value: String(localPortraits.length) },
    { label: t('assets.agent.summary.linkedPortraits', 'Linked to remote agents'), value: String(linkedPortraits.length) },
    { label: t('assets.agent.summary.syncedBindings', 'Synced bindings'), value: String(agentBindings.length) },
  ];
  return (
    <div className="space-y-4">
      <SummaryCards items={summaryCards} />
      <SectionCard title={t('assets.agent.generatedTitle', 'Generated Agent Assets')} description={t('assets.agent.generatedDescription', 'These are local portrait outputs before or after they become remote media bindings.')}>
        <div className="grid gap-3 lg:grid-cols-2">
          {localPortraits.length === 0 ? (
            <p className="text-xs text-gray-500">{t('assets.agent.emptyGenerated', 'No generated character portraits yet.')}</p>
          ) : localPortraits.map((item) => (
            <div key={item.name} className="rounded-[18px] border border-slate-200 bg-white p-3 text-xs text-slate-700">
              <p className="font-semibold text-slate-900">{item.name}</p>
              <p className="mt-1 break-all">{item.imageUrl}</p>
              <p className="mt-1 text-slate-500">
                {t('assets.agent.remoteAgent', 'Remote agent: {{value}}', {
                  value: item.remoteAgent ? `${item.remoteAgent.displayName} (${item.remoteAgent.id})` : t('assets.agent.notCreated', 'not created'),
                })}
              </p>
            </div>
          ))}
        </div>
      </SectionCard>
      <RenderBindingList title={t('assets.agent.syncedTitle', 'Synced Agent Assets')} description={t('assets.agent.syncedDescription', 'These bindings already point remote agent slots at media assets.')} items={agentBindings} />
      <MissingCoverageCard
        title={t('assets.agent.missingTitle', 'Pending linkage')}
        description={t('assets.agent.missingDescription', 'These generated portraits still need a remote agent match before sync can complete cleanly.')}
        items={missingRemotePortraits.map((item) => item.name)}
      />
    </div>
  );
}
