import React from 'react';
import type { WorldStudioCreatorAgentSummary, WorldStudioMediaBindingSummary } from '../../ui/types.js';
import { findLinkedCreatorAgent } from '../../services/creator-agent-link.js';
import { useModTranslation } from "@nimiplatform/sdk/mod";
import { asRecord } from "@nimiplatform/sdk/mod";

function RenderBindingList(props: {
  title: string;
  items: WorldStudioMediaBindingSummary[];
}) {
  const { t } = useModTranslation('world-studio');
  return (
    <section className="ui-sync-card ui-sync-card-inset p-4">
      <h3 className="text-sm font-semibold text-gray-900">{props.title}</h3>
      <div className="mt-3 space-y-3">
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
    </section>
  );
}

export function WorldAssetsPanel(props: {
  mediaBindings: WorldStudioMediaBindingSummary[];
  worldCoverUrl: string | null;
  locationImages: Record<string, unknown>;
}): React.ReactElement {
  const { t } = useModTranslation('world-studio');
  const worldBindings = props.mediaBindings.filter((item) => item.targetType === 'WORLD');
  const generatedLocations = Object.entries(props.locationImages || {})
    .map(([name, draft]) => ({
      name,
      imageUrl: String(asRecord(draft).imageUrl || '').trim(),
    }))
    .filter((item) => item.imageUrl);
  return (
    <div className="space-y-4">
      <section className="ui-sync-card ui-sync-card-inset p-4">
        <h3 className="text-sm font-semibold text-gray-900">{t('assets.world.generatedTitle', 'Generated World Assets')}</h3>
        <div className="mt-3 space-y-2 text-xs text-slate-700">
          <p>{t('assets.world.cover', 'World cover: {{value}}', {
            value: props.worldCoverUrl || t('assets.world.noGeneratedCover', 'No generated cover yet'),
          })}</p>
          <p>{t('assets.world.locationImages', 'Generated location images: {{count}}', {
            count: generatedLocations.length,
          })}</p>
        </div>
      </section>
      <RenderBindingList title={t('assets.world.syncedTitle', 'Synced World Assets')} items={worldBindings} />
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
  return (
    <div className="space-y-4">
      <section className="ui-sync-card ui-sync-card-inset p-4">
        <h3 className="text-sm font-semibold text-gray-900">{t('assets.agent.generatedTitle', 'Generated Agent Assets')}</h3>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
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
      </section>
      <RenderBindingList title={t('assets.agent.syncedTitle', 'Synced Agent Assets')} items={agentBindings} />
    </div>
  );
}
