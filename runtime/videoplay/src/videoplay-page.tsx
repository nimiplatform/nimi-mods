import React from 'react';
import { useVideoPlayController } from './hooks/use-videoplay-controller.js';
import { VideoPlayVisualStyles } from './ui/video-play-visual-styles.js';
import { VideoPlayWorkbench } from './ui/video-play-workbench.js';

export function VideoPlayPage() {
  const props = useVideoPlayController();
  return (
    <div
      data-nimi-mod-root="videoplay"
      className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden"
    >
      <VideoPlayVisualStyles />
      <VideoPlayWorkbench {...props} />
    </div>
  );
}
