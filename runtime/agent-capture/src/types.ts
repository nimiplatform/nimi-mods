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

export type AgentCaptureSignatureHook = {
  kind: 'prop' | 'accessory' | 'garment-detail' | 'pattern' | 'color-pair';
  value: string;
};

export type AgentCaptureVisualSpec = {
  roleCore: string;
  silhouette: string;
  outfit: string;
  materials: string[];
  accessories: string[];
  handProp: string | null;
  hairstyle: string;
  palette: {
    primary: string;
    secondary?: string;
    accent?: string;
  };
  artStyle: string;
  backgroundWeight: 'minimal' | 'supporting' | 'requested';
  signatureHook: AgentCaptureSignatureHook | null;
};

export type AgentCaptureStableCore = {
  silhouette: string;
  palette: AgentCaptureVisualSpec['palette'];
  artStyle: string;
  signatureHook: AgentCaptureVisualSpec['signatureHook'];
  framing: 'full-body-anchor';
  cameraLanguage: 'stable-eye-level';
};

export type AgentCaptureVisualField =
  | 'roleCore'
  | 'silhouette'
  | 'outfit'
  | 'materials'
  | 'accessories'
  | 'handProp'
  | 'hairstyle'
  | 'palette'
  | 'artStyle'
  | 'backgroundWeight'
  | 'signatureHook';

export type AgentCaptureVisualDelta = {
  intentMode: 'refine' | 'restart';
  retain: string[];
  adjust: string[];
  touchedFields: AgentCaptureVisualField[];
};

export type AgentCaptureResultFacts = {
  framing: 'full-body-anchor';
  backgroundWeight: AgentCaptureVisualSpec['backgroundWeight'];
  signatureHook: AgentCaptureSignatureHook | null;
  usesSourceImage: boolean;
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
  visualSpec: AgentCaptureVisualSpec | null;
  lastVisualDelta: AgentCaptureVisualDelta | null;
  resultFacts: AgentCaptureResultFacts | null;
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
  visualDelta: AgentCaptureVisualDelta;
};

export type AgentCaptureDraftGeneration = {
  name: string;
  bio: string;
  personaSeed: string;
  tags: string[];
  characterReadout: string;
};
