import type { RuntimeRouteBinding } from '@nimiplatform/sdk/mod';

export type AgentCaptureMessageKind =
  | 'chat'
  | 'brief-confirm'
  | 'readout'
  | 'status'
  | 'error';

export type AgentCaptureMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  kind: AgentCaptureMessageKind;
  content: string;
  createdAt: string;
};

export type AgentCaptureImageRef = {
  path?: string;
  fileName?: string;
  mimeType?: string;
  url: string;
};

export type AgentCaptureAgentSummary = {
  id: string;
  handle: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  tags: string[];
  worldId: string | null;
  activeWorldId: string | null;
  ownershipType: string | null;
  importance: string | null;
  state: string | null;
};

export type AgentCaptureDraftSnapshot = {
  id: string;
  status: 'draft' | 'archived';
  createdAt: string;
  updatedAt: string;
  sourcePrompt: string;
  sourceImage: AgentCaptureImageRef | null;
  selectedAgentId: string | null;
  generatedImage: AgentCaptureImageRef | null;
  characterReadout: string;
  name: string;
  bio: string;
  personaSeed: string;
  tags: string[];
};

export type AgentCaptureWorkingState =
  | 'idle'
  | 'thinking'
  | 'awaiting-confirmation'
  | 'generating';

export type AgentCaptureSessionState = {
  messages: AgentCaptureMessage[];
  currentBrief: string;
  pendingBriefConfirmation: boolean;
  workingState: AgentCaptureWorkingState;
  surfaceError: string;
  inputMode: 'expanded' | 'dialogue';
  lastTextTraceId: string;
  lastImageTraceId: string;
};

export type AgentCaptureRouteState = {
  textRouteBinding: RuntimeRouteBinding | null;
  imageRouteBinding: RuntimeRouteBinding | null;
};

export type AgentCaptureTurnResult = {
  assistantReply: string;
  brief: string;
};

export type AgentCaptureDraftGeneration = {
  name: string;
  bio: string;
  personaSeed: string;
  tags: string[];
  characterReadout: string;
  imagePrompt: string;
  negativePrompt: string;
};
