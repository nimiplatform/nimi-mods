import React from 'react';
import { useVideoPlayController } from './hooks/use-videoplay-controller.js';
import { VideoPlayWorkbench } from './ui/video-play-workbench.js';

export function VideoPlayPage() {
  const props = useVideoPlayController();
  return (
    <div data-nimi-mod-root="videoplay" className="h-full min-h-0">
      <VideoPlayWorkbench {...props} />
    </div>
  );
}
