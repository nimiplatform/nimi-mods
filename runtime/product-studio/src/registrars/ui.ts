import React, { Suspense } from 'react';
import { getPromptLocale, type HookClient } from '@nimiplatform/sdk/mod';
import { PRODUCT_STUDIO_NAV_SLOT, PRODUCT_STUDIO_ROUTE_SLOT, PRODUCT_STUDIO_TAB_ID } from '../contracts.js';
import { enLocale } from '../locales/en.js';
import { zhLocale } from '../locales/zh.js';

const LazyProductStudioPage = React.lazy(async () => {
  const module = await import('../product-studio-page.js');
  return { default: module.ProductStudioPage };
});

export async function registerProductStudioUiExtensions(input: {
  hookClient: HookClient;
}): Promise<void> {
  const { hookClient } = input;
  const locale = getPromptLocale() === 'zh' ? zhLocale : enLocale;

  await hookClient.ui.register({
    slot: PRODUCT_STUDIO_NAV_SLOT,
    priority: 130,
    extension: {
      type: 'nav-item',
      tabId: PRODUCT_STUDIO_TAB_ID,
      label: locale.nav.label,
      badge: 'MOD',
      icon: 'photo_filter',
      strategy: 'append',
    },
  });

  await hookClient.ui.register({
    slot: PRODUCT_STUDIO_ROUTE_SLOT,
    priority: 130,
    extension: {
      type: 'tab-page',
      tabId: PRODUCT_STUDIO_TAB_ID,
      shellMode: 'immersive',
      strategy: 'append',
      component: () =>
        React.createElement(
          Suspense,
          {
            fallback: React.createElement(
              'div',
              {
                className: 'm-4 rounded-3xl bg-white/80 p-4 text-sm text-slate-600 shadow-[0_10px_30px_rgba(15,23,42,0.08)]',
              },
              locale.nav.loading,
            ),
          },
          React.createElement(LazyProductStudioPage),
        ),
    },
  });
}
