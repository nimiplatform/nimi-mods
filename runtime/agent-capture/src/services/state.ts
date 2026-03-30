import type {
  AgentCaptureDraftSnapshot,
  AgentCaptureFeelingAnchor,
  AgentCaptureMessage,
  AgentCaptureRouteState,
  AgentCaptureSessionState,
  AgentCaptureWorkingMemory,
} from '../types.js';

function makeId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `agent-capture-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createTimestamp(): string {
  return new Date().toISOString();
}

export function createDraftId(): string {
  return makeId();
}

export function createEmptyDraftSnapshot(): AgentCaptureDraftSnapshot {
  const now = createTimestamp();
  return {
    id: createDraftId(),
    status: 'draft',
    sourceImage: null,
    sourcePrompt: '',
    feelingAnchor: null,
    selectedAgentId: null,
    generatedImage: null,
    visualSpec: null,
    lastVisualDelta: null,
    resultFacts: null,
    characterReadout: '',
    name: '',
    bio: '',
    personaSeed: '',
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createEmptySessionState(): AgentCaptureSessionState {
  return {
    messages: [],
    currentBrief: '',
    workingMemory: createEmptyWorkingMemory(),
    pendingBriefConfirmation: false,
    workingState: 'idle',
    surfaceError: '',
    inputMode: 'dialogue',
    lastTextTraceId: '',
    lastImageTraceId: '',
  };
}

export function createEmptyRouteState(): AgentCaptureRouteState {
  return {
    textRouteBinding: null,
    imageRouteBinding: null,
  };
}

export function createEmptyWorkingMemory(): AgentCaptureWorkingMemory {
  return {
    effectiveIntentSummary: '',
    preserveFocus: [],
    adjustFocus: [],
    negativeConstraints: [],
  };
}

function sanitizeStringList(values: string[] | null | undefined, maxItems = 8): string[] {
  const result: string[] = [];
  for (const value of values || []) {
    const normalized = String(value || '').trim();
    if (!normalized || result.includes(normalized)) {
      continue;
    }
    result.push(normalized);
    if (result.length >= maxItems) {
      break;
    }
  }
  return result;
}

export function sanitizeFeelingAnchor(
  value: AgentCaptureFeelingAnchor | null | undefined,
): AgentCaptureFeelingAnchor | null {
  if (!value) {
    return null;
  }
  const coreVibe = String(value.coreVibe || '').trim();
  const tonePhrases = sanitizeStringList(value.tonePhrases, 3);
  const avoidVibe = sanitizeStringList(value.avoidVibe, 4);
  if (!coreVibe && tonePhrases.length === 0 && avoidVibe.length === 0) {
    return null;
  }
  return {
    coreVibe,
    tonePhrases,
    avoidVibe,
  };
}

export function sanitizeWorkingMemory(
  value: AgentCaptureWorkingMemory | null | undefined,
): AgentCaptureWorkingMemory {
  if (!value) {
    return createEmptyWorkingMemory();
  }
  return {
    effectiveIntentSummary: String(value.effectiveIntentSummary || '').trim(),
    preserveFocus: sanitizeStringList(value.preserveFocus, 8),
    adjustFocus: sanitizeStringList(value.adjustFocus, 8),
    negativeConstraints: sanitizeStringList(value.negativeConstraints, 8),
  };
}

export function sanitizeHydratedSessionState(
  value: AgentCaptureSessionState | null | undefined,
): AgentCaptureSessionState {
  if (!value) {
    return createEmptySessionState();
  }
  return {
    messages: Array.isArray(value.messages) ? value.messages : [],
    currentBrief: String(value.currentBrief || '').trim(),
    workingMemory: sanitizeWorkingMemory(value.workingMemory),
    pendingBriefConfirmation: false,
    workingState: 'idle',
    surfaceError: '',
    inputMode: value.inputMode === 'dialogue' ? 'dialogue' : 'expanded',
    lastTextTraceId: String(value.lastTextTraceId || '').trim(),
    lastImageTraceId: String(value.lastImageTraceId || '').trim(),
  };
}

export function buildSourcePromptFromMessages(messages: AgentCaptureMessage[]): string {
  return messages
    .filter((message) => message.role === 'user')
    .map((message) => String(message.content || '').trim())
    .filter(Boolean)
    .join('\n');
}

export function appendSessionMessage(
  session: AgentCaptureSessionState,
  input: {
    role: AgentCaptureMessage['role'];
    kind: AgentCaptureMessage['kind'];
    content: string;
  },
): AgentCaptureSessionState {
  return {
    ...session,
    messages: [...session.messages, {
      id: makeId(),
      role: input.role,
      kind: input.kind,
      content: input.content,
      createdAt: createTimestamp(),
    }],
  };
}

function isEmptyImageRef(input: AgentCaptureDraftSnapshot['sourceImage'] | AgentCaptureDraftSnapshot['generatedImage']): boolean {
  if (!input) {
    return true;
  }
  return !String(input.url || '').trim() && !String(input.path || '').trim();
}

export function isDraftFactuallyEmpty(snapshot: AgentCaptureDraftSnapshot): boolean {
  return (
    !String(snapshot.sourcePrompt || '').trim()
    && !snapshot.feelingAnchor
    && isEmptyImageRef(snapshot.sourceImage)
    && !String(snapshot.selectedAgentId || '').trim()
    && isEmptyImageRef(snapshot.generatedImage)
    && !snapshot.visualSpec
    && !snapshot.lastVisualDelta
    && !snapshot.resultFacts
    && !String(snapshot.characterReadout || '').trim()
    && !String(snapshot.name || '').trim()
    && !String(snapshot.bio || '').trim()
    && !String(snapshot.personaSeed || '').trim()
    && snapshot.tags.length === 0
  );
}

export function hasMinimumGenerationInput(snapshot: AgentCaptureDraftSnapshot): boolean {
  return Boolean(String(snapshot.sourcePrompt || '').trim() || snapshot.sourceImage);
}
