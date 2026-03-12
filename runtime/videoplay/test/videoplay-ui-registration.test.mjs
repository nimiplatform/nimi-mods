import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VIDEOPLAY_MOD_ID,
  VIDEOPLAY_NAV_SLOT,
  VIDEOPLAY_ROUTE_SLOT,
  VIDEOPLAY_TAB_ID,
} from '../src/contracts.ts';
import { registerVideoPlayUiExtensions } from '../src/registrars/ui.ts';

test('videoplay route registers immersive workspace shell', async () => {
  const registrations = [];
  const hookClient = {
    ui: {
      register: async (registration) => {
        registrations.push(registration);
      },
    },
  };

  await registerVideoPlayUiExtensions({ hookClient });

  assert.equal(registrations.length, 2);

  const navRegistration = registrations.find((item) => item.slot === VIDEOPLAY_NAV_SLOT) || null;
  const routeRegistration = registrations.find((item) => item.slot === VIDEOPLAY_ROUTE_SLOT) || null;

  assert.ok(navRegistration);
  assert.ok(routeRegistration);
  assert.equal(navRegistration.extension.type, 'nav-item');
  assert.equal(navRegistration.extension.tabId, VIDEOPLAY_TAB_ID);

  assert.equal(routeRegistration.extension.type, 'tab-page');
  assert.equal(routeRegistration.extension.tabId, VIDEOPLAY_TAB_ID);
  assert.equal(routeRegistration.extension.modId, VIDEOPLAY_MOD_ID);
  assert.equal(routeRegistration.extension.shellMode, 'immersive');
  assert.equal(routeRegistration.extension.strategy, 'append');
  assert.equal(typeof routeRegistration.extension.component, 'function');
});
