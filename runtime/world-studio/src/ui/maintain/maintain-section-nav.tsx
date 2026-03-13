import React from 'react';
import type { WorldStudioMaintainSection } from '../../controllers/world-studio-screen-model.js';
import { worldStudioMessage } from '../../i18n/messages.js';

const SECTIONS: Array<{
  value: WorldStudioMaintainSection;
  label: string;
}> = [
  { value: 'WORLD', label: worldStudioMessage('maintainNav.world', 'World') },
  { value: 'WORLDVIEW', label: worldStudioMessage('maintainNav.worldview', 'Worldview') },
  { value: 'EVENTS', label: worldStudioMessage('maintainNav.events', 'Events') },
  { value: 'LOREBOOKS', label: worldStudioMessage('maintainNav.lorebooks', 'Lorebooks') },
];

export function MaintainSectionNav(props: {
  activeSection: WorldStudioMaintainSection;
  onSelectSection: (section: WorldStudioMaintainSection) => void;
}): React.ReactElement {
  return (
    <div className="space-y-2.5">
      {SECTIONS.map((section) => (
        <button
          key={section.value}
          type="button"
          onClick={() => props.onSelectSection(section.value)}
          className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition-colors ${
            props.activeSection === section.value
              ? 'border-teal-200 bg-gradient-to-r from-[#ecfaf6] to-[#f5fbff] text-teal-700 shadow-[0_8px_22px_rgba(20,184,166,0.12)]'
              : 'border-gray-200 bg-white text-slate-700 shadow-sm'
          }`}
        >
          <span className="text-sm font-semibold">{section.label}</span>
          <span className="rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            {section.value}
          </span>
        </button>
      ))}
    </div>
  );
}
