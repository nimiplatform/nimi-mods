import React from 'react';
import type { WorldStudioMaintainDomain } from '../../contracts.js';
import { worldStudioMessage } from '../../i18n/messages.js';

const DOMAINS: Array<{
  value: WorldStudioMaintainDomain;
  labelKey: string;
  labelFallback: string;
  subtitleKey: string;
  subtitleFallback: string;
}> = [
  {
    value: 'WORLD',
    labelKey: 'domainNav.world.label',
    labelFallback: 'World',
    subtitleKey: 'domainNav.world.subtitle',
    subtitleFallback: 'Base, worldview, world events, lorebooks',
  },
  {
    value: 'AGENTS',
    labelKey: 'domainNav.agents.label',
    labelFallback: 'Agents',
    subtitleKey: 'domainNav.agents.subtitle',
    subtitleFallback: 'Registry and metadata editor',
  },
  {
    value: 'ASSETS',
    labelKey: 'domainNav.assets.label',
    labelFallback: 'Assets',
    subtitleKey: 'domainNav.assets.subtitle',
    subtitleFallback: 'World and agent media bindings',
  },
  {
    value: 'RELEASES',
    labelKey: 'domainNav.releases.label',
    labelFallback: 'Releases',
    subtitleKey: 'domainNav.releases.subtitle',
    subtitleFallback: 'Drafts, publish, history',
  },
];

export function DomainNav(props: {
  activeDomain: WorldStudioMaintainDomain;
  onSelectDomain: (domain: WorldStudioMaintainDomain) => void;
}): React.ReactElement {
  return (
    <div className="space-y-2">
      {DOMAINS.map((domain) => {
        const active = domain.value === props.activeDomain;
        return (
          <button
            key={domain.value}
            type="button"
            className={`w-full rounded-[18px] border px-3 py-3 text-left transition ${
              active
                ? 'border-slate-900 bg-slate-900 text-white shadow-[0_10px_24px_rgba(15,23,42,0.16)]'
                : 'border-white/80 bg-white/92 text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.05)]'
            }`}
            onClick={() => props.onSelectDomain(domain.value)}
          >
            <p className={`text-[13px] font-semibold ${active ? 'text-white' : 'text-slate-900'}`}>
              {worldStudioMessage(domain.labelKey, domain.labelFallback)}
            </p>
            <p className={`mt-1 text-[11px] leading-5 ${active ? 'text-slate-200' : 'text-slate-500'}`}>
              {worldStudioMessage(domain.subtitleKey, domain.subtitleFallback)}
            </p>
          </button>
        );
      })}
    </div>
  );
}
