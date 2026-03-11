import { KismetShell } from './components/kismet-shell.js';

export function KismetPage() {
  return (
    <div data-nimi-mod-root="kismet" className="flex h-full flex-col">
      <KismetShell />
    </div>
  );
}
