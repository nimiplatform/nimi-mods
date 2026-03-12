import React from 'react';
import { UiSyncVisualStyles } from '../../../../shared/ui-sync-visual-styles.js';

const VIDEOPLAY_LAYOUT_STYLE = `
.videoplay-shell-main {
  min-width: 0;
}

@media (min-width: 1080px) {
  .videoplay-shell-main {
    display: grid !important;
    grid-template-columns: minmax(240px, 280px) minmax(0, 1fr) minmax(260px, 320px);
    grid-template-rows: minmax(0, 1fr);
    overflow: hidden !important;
  }

  .videoplay-shell-side,
  .videoplay-shell-center,
  .videoplay-shell-right {
    min-height: 0 !important;
  }
}

@media (min-width: 1440px) {
  .videoplay-shell-main {
    grid-template-columns: minmax(280px, 320px) minmax(0, 1fr) minmax(300px, 360px);
  }
}
`.trim();

export function VideoPlayVisualStyles(): React.ReactElement {
  return (
    <>
      <UiSyncVisualStyles />
      <style>{VIDEOPLAY_LAYOUT_STYLE}</style>
    </>
  );
}
