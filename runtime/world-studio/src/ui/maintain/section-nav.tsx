import React from 'react';
import type { WorldStudioMaintainDomain, WorldStudioMaintainSection } from '../../contracts.js';
import { worldStudioMessage } from '../../i18n/messages.js';

const SECTIONS: Record<WorldStudioMaintainDomain, Array<{
  value: WorldStudioMaintainSection;
  labelKey: string;
  labelFallback: string;
}>> = {
  WORLD: [
    { value: 'BASE', labelKey: 'sectionNav.base', labelFallback: 'Base' },
    { value: 'WORLDVIEW', labelKey: 'sectionNav.worldview', labelFallback: 'Worldview' },
    { value: 'WORLD_EVENTS', labelKey: 'sectionNav.worldEvents', labelFallback: 'World Events' },
    { value: 'LOREBOOKS', labelKey: 'sectionNav.lorebooks', labelFallback: 'Lorebooks' },
  ],
  AGENTS: [
    { value: 'REGISTRY', labelKey: 'sectionNav.registry', labelFallback: 'Registry' },
    { value: 'EDITOR', labelKey: 'sectionNav.editor', labelFallback: 'Editor' },
  ],
  ASSETS: [
    { value: 'WORLD_ASSETS', labelKey: 'sectionNav.worldAssets', labelFallback: 'World Assets' },
    { value: 'AGENT_ASSETS', labelKey: 'sectionNav.agentAssets', labelFallback: 'Agent Assets' },
  ],
  RELEASES: [
    { value: 'DRAFTS', labelKey: 'sectionNav.drafts', labelFallback: 'Drafts' },
    { value: 'PUBLISH', labelKey: 'sectionNav.publish', labelFallback: 'Publish' },
    { value: 'HISTORY', labelKey: 'sectionNav.history', labelFallback: 'History' },
  ],
};

export function SectionNav(props: {
  activeDomain: WorldStudioMaintainDomain;
  activeSection: WorldStudioMaintainSection;
  onSelectSection: (section: WorldStudioMaintainSection) => void;
}): React.ReactElement {
  const items = SECTIONS[props.activeDomain] || [];
  return (
    <section className="rounded-[24px] border border-white/80 bg-white/86 p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const active = item.value === props.activeSection;
          return (
            <button
              key={item.value}
              type="button"
              className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                active
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
              onClick={() => props.onSelectSection(item.value)}
            >
              {worldStudioMessage(item.labelKey, item.labelFallback)}
            </button>
          );
        })}
      </div>
    </section>
  );
}
