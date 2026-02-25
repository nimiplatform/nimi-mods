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
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  kind: 'text' | 'voice';
  content: string;
  timestamp: Date;
  latencyMs?: number;
  meta?: ChatMessageMeta;
};

export type HealthStatus = 'idle' | 'checking' | 'healthy' | 'unreachable';
