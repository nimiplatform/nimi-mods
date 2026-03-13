import test from 'node:test';
import assert from 'node:assert/strict';
import React, { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';

import {
  TextplayRouteConfigDrawer,
} from '../src/components/textplay-shell.tsx';
import {
  focusRouteConfigDrawerTarget,
  resolveRouteConfigDrawerFocusTarget,
} from '../src/components/route-config-drawer-focus.ts';
import enLocale from '../src/locales/en.ts';

let testI18n = null;

async function withSuppressedI18nNoise(run) {
  const originalWarn = console.warn;
  const originalLog = console.log;
  const originalInfo = console.info;
  console.warn = (...args) => {
    const message = String(args[0] || '');
    if (message.includes('react-i18next:: useTranslation')) {
      return;
    }
    originalWarn(...args);
  };
  console.log = (...args) => {
    const message = String(args[0] || '');
    if (message.includes('i18next is maintained with support from Locize')) {
      return;
    }
    originalLog(...args);
  };
  console.info = (...args) => {
    const message = String(args[0] || '');
    if (message.includes('i18next is maintained with support from Locize')) {
      return;
    }
    originalInfo(...args);
  };

  try {
    return await run();
  } finally {
    console.warn = originalWarn;
    console.log = originalLog;
    console.info = originalInfo;
  }
}

async function ensureTestI18n() {
  if (testI18n) {
    return testI18n;
  }

  const nextI18n = createInstance();
  await withSuppressedI18nNoise(async () => {
    await nextI18n.use(initReactI18next).init({
      lng: 'en',
      fallbackLng: 'en',
      resources: {
        en: {
          textplay: enLocale,
        },
      },
      ns: ['textplay'],
      defaultNS: 'textplay',
      initImmediate: false,
      interpolation: {
        escapeValue: false,
      },
    });
  });

  testI18n = nextI18n;
  return testI18n;
}

test('route config drawer renders dialog semantics when open', async () => {
  const i18n = await ensureTestI18n();
  const markup = await withSuppressedI18nNoise(async () => renderToStaticMarkup(React.createElement(I18nextProvider, {
    i18n,
  }, React.createElement(TextplayRouteConfigDrawer, {
    open: true,
    onClose: () => {},
    triggerRef: createRef(),
    routeOptions: null,
    routeLoading: false,
    routeError: null,
    routeBinding: null,
    effectiveRouteBinding: null,
    onRouteSourceChange: () => {},
    onRouteConnectorChange: () => {},
    onRouteModelChange: () => {},
    onRouteClear: () => {},
    onRouteReload: () => {},
  }))));

  assert.match(markup, /role="dialog"/);
  assert.match(markup, /aria-modal="true"/);
  assert.match(markup, /aria-labelledby="/);
  assert.doesNotMatch(markup, /<aside/);
});

test('route config drawer focus helper traps forward and backward tab order', () => {
  const first = { focus() {} };
  const second = { focus() {} };
  const third = { focus() {} };
  const focusableElements = [first, second, third];

  assert.equal(resolveRouteConfigDrawerFocusTarget({
    focusableElements,
    activeElement: third,
    shiftKey: false,
  }), first);

  assert.equal(resolveRouteConfigDrawerFocusTarget({
    focusableElements,
    activeElement: first,
    shiftKey: true,
  }), third);
});

test('route config drawer focus helper prefers preventScroll and falls back cleanly', () => {
  const calls = [];
  const supportsPreventScroll = {
    focus(options) {
      calls.push(options || null);
    },
  };
  const fallbackOnly = {
    focus(options) {
      if (options && Object.keys(options).length > 0) {
        throw new TypeError('preventScroll unsupported');
      }
      calls.push(options || null);
    },
  };

  focusRouteConfigDrawerTarget(supportsPreventScroll);
  focusRouteConfigDrawerTarget(fallbackOnly);

  assert.deepEqual(calls, [{ preventScroll: true }, null]);
});
