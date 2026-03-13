import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  MINTYOU_NAV_SLOT,
  MINTYOU_ROUTE_SLOT,
} from '../src/contracts.ts';
import { registerMintYouUiExtensions } from '../src/registrars/ui.ts';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const modDir = path.resolve(testDir, '..');

function readModFile(relativePath: string): string {
  return readFileSync(path.join(modDir, relativePath), 'utf8');
}

test('mint-you route registers immersive workspace shell', async () => {
  const registrations: Array<{ slot: string; extension: Record<string, unknown> }> = [];
  const hookClient = {
    ui: {
      register: async (registration: { slot: string; extension: Record<string, unknown> }) => {
        registrations.push(registration);
      },
    },
  };

  await registerMintYouUiExtensions({ hookClient });

  assert.equal(registrations.length, 2);

  const navRegistration = registrations.find((item) => item.slot === MINTYOU_NAV_SLOT) || null;
  const routeRegistration = registrations.find((item) => item.slot === MINTYOU_ROUTE_SLOT) || null;

  assert.ok(navRegistration);
  assert.ok(routeRegistration);
  assert.equal(navRegistration.extension.type, 'nav-item');
  assert.equal(navRegistration.extension.tabId, 'mod:mint-you');

  assert.equal(routeRegistration.extension.type, 'tab-page');
  assert.equal(routeRegistration.extension.tabId, 'mod:mint-you');
  assert.equal(routeRegistration.extension.shellMode, 'immersive');
  assert.equal(routeRegistration.extension.strategy, 'append');
  assert.equal(typeof routeRegistration.extension.component, 'function');
});

test('mint-you page and shell keep the full-screen workspace root contract', () => {
  const pageSource = readModFile('src/ui/mint-you-page.tsx');
  const shellSource = readModFile('src/ui/mint-you-shell.tsx');

  assert.match(pageSource, /data-nimi-mod-root="mint-you"/);
  assert.match(pageSource, /className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-gray-50"/);
  assert.match(shellSource, /className="ui-sync-root relative flex h-full min-h-0 min-w-0 w-full flex-1 overflow-hidden"/);
});
