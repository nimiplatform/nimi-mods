import React from 'react';
import { UiSyncVisualStyles } from '../../../../shared/ui-sync-visual-styles.js';

const TEXTPLAY_LAYOUT_STYLE = `
.textplay-shell-root {
  min-width: 0;
}

@media (min-width: 960px) {
  .textplay-shell-root {
    display: grid !important;
    grid-template-columns: minmax(260px, 288px) minmax(0, 1fr) minmax(260px, 288px);
    grid-template-rows: minmax(0, 1fr);
  }

  .textplay-shell-side,
  .textplay-shell-main,
  .textplay-shell-right {
    width: auto !important;
    min-height: 0 !important;
  }

  .textplay-shell-side,
  .textplay-shell-main {
    border-bottom-width: 0 !important;
    border-right-width: 1px !important;
  }

  .textplay-shell-right {
    border-bottom-width: 0 !important;
  }
}

@media (min-width: 1440px) {
  .textplay-shell-root {
    grid-template-columns: minmax(288px, 320px) minmax(0, 1fr) minmax(288px, 320px);
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
