export type ChatMessageMeta = {
  autoPlayVoice?: boolean;
  planId?: string;
  segmentId?: string;
  segmentIndex?: number;
  segmentCount?: number;
  intent?: string;
  scheduledDelayMs?: number;
  channelDecision?: 'text' | 'voice';
  routeSource?: 'local-runtime' | 'token-api';
  routeModel?: string;
  audioUri?: string;
  audioBytes?: Uint8Array;
  audioMimeType?: string;
  streamId?: string;
  streamChunkCount?: number;
  nsfwPolicy?: 'disabled' | 'local-runtime-only' | 'allowed';
  segmentParseMode?: 'explicit-delimiter' | 'double-newline' | 'single-message';
  mediaType?: 'image' | 'video';
  mediaStatus?: 'pending' | 'ready' | 'failed' | 'blocked';
  mediaPrompt?: string;
  mediaIntentSource?: 'tag' | 'heuristic';
  mediaError?: string;
};

export type ChatMessageKind =
  | 'text'
  | 'voice'
  | 'image'
  | 'video'
  | 'image-pending'
  | 'video-pending'
  | 'streaming';

export type ChatMessageMedia = {
  uri?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  previewUri?: string;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  kind: ChatMessageKind;
  content: string;
  media?: ChatMessageMedia;
  timestamp: Date;
  latencyMs?: number;
  meta?: ChatMessageMeta;
};

export type HealthStatus = 'idle' | 'checking' | 'healthy' | 'unreachable';
