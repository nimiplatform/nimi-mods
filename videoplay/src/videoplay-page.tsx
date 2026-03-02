import React from 'react';
import { useVideoPlayController } from './hooks/use-videoplay-controller.js';
import { VideoPlayWorkbench } from './ui/video-play-workbench.js';

export function VideoPlayPage() {
  const props = useVideoPlayController();
  return <VideoPlayWorkbench {...props} />;
}
