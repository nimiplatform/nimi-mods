import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TEXTPLAY_MOD_ID,
  TEXTPLAY_NAV_SLOT,
  TEXTPLAY_ROUTE_SLOT,
  TEXTPLAY_TAB_ID,
} from '../src/contracts.ts';
import { registerTextplayUiExtensions } from '../src/registrars/ui.ts';

test('textplay route registers immersive workspace shell', async () => {
  const registrations = [];
  const hookClient = {
    ui: {
      register: async (registration) => {
        registrations.push(registration);
      },
    },
  };

  await registerTextplayUiExtensions({ hookClient });

  assert.equal(registrations.length, 2);

  const navRegistration = registrations.find((item) => item.slot === TEXTPLAY_NAV_SLOT) || null;
  const routeRegistration = registrations.find((item) => item.slot === TEXTPLAY_ROUTE_SLOT) || null;

  assert.ok(navRegistration);
  assert.ok(routeRegistration);
  assert.equal(navRegistration.extension.type, 'nav-item');
  assert.equal(navRegistration.extension.tabId, TEXTPLAY_TAB_ID);

  assert.equal(routeRegistration.extension.type, 'tab-page');
  assert.equal(routeRegistration.extension.tabId, TEXTPLAY_TAB_ID);
  assert.equal(routeRegistration.extension.modId, TEXTPLAY_MOD_ID);
  assert.equal(routeRegistration.extension.shellMode, 'immersive');
  assert.equal(routeRegistration.extension.strategy, 'append');
  assert.equal(typeof routeRegistration.extension.component, 'function');
});
