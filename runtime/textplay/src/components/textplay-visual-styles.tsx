import React from 'react';
import { UiSyncVisualStyles } from '../../../../shared/ui-sync-visual-styles.js';

const TEXTPLAY_LAYOUT_STYLE = `
.textplay-shell-root {
  min-width: 0;
  width: 100%;
}

@media (min-width: 640px) {
  .textplay-shell-root {
    display: grid;
    grid-template-columns: 320px minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
  }

  .textplay-shell-side,
  .textplay-shell-main {
    width: auto !important;
    min-height: 0 !important;
  }

  .textplay-shell-side,
  .textplay-shell-main {
    border-bottom-width: 0 !important;
    border-right-width: 1px !important;
  }
}

@media (min-width: 1440px) {
  .textplay-shell-root {
    grid-template-columns: 336px minmax(0, 1fr);
  }
}
`.trim();

export function TextplayVisualStyles(): React.ReactElement {
  return (
    <>
      <UiSyncVisualStyles />
      <style>{TEXTPLAY_LAYOUT_STYLE}</style>
    </>
  );
}
