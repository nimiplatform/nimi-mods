export type LocalChatTargetItem = {
  id: string;
  displayName: string;
  handle: string;
  avatarUrl?: string | null;
  bio?: string | null;
  isAgent?: boolean;
  worldId?: string | null;
  world?: Record<string, unknown> | null;
  worldview?: Record<string, unknown> | null;
  agentProfile?: Record<string, unknown>;
  agentMetadata?: Record<string, unknown>;
  latestLocalMessage?: string | null;
  latestLocalMessageAt?: string | null;
  unreadCount?: number;
  isOnline?: boolean;
};

export type LocalChatSessionItem = {
  id: string;
  title: string;
  updatedAt: string | number | Date;
  turns: Array<unknown>;
};

export type VoiceContextMenu = {
  messageId: string;
  x: number;
  y: number;
};

export type VoiceInputState = 'idle' | 'recording' | 'transcribing' | 'failed';
