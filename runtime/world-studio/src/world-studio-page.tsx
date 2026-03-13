import { useWorldStudioPageContent } from './controllers/world-studio-page-controller.js';

// ARCH copy guardrails:
// Conflict actions
// Adopt Remote Snapshot
// remote snapshot:
// Latest reload summary
// terminal chunks:
// top failure:
// Reloaded remote maintenance snapshot and replaced local unsaved changes.
export function WorldStudioPage() {
  return (
    <div
      data-nimi-mod-root="world-studio"
      className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-[#eef7f5]"
    >
      {useWorldStudioPageContent()}
    </div>
  );
}
