export type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type WorldResolutionSource = 'profile' | 'unresolved';

export type LocalChatCoreQueryBridge = {
  query: (capability: string, query?: Record<string, unknown>) => Promise<unknown>;
  withOpenApiContextLock?: <T>(
    context: {
      apiBaseUrl: string;
      accessToken?: string;
      fetchImpl?: FetchImpl | null;
    },
    task: () => Promise<T>,
  ) => Promise<T>;
};

export type LocalChatReadContext = {
  apiBaseUrl: string;
  accessToken?: string;
  fetchImpl?: FetchImpl | null;
};

export type LocalChatTarget = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  friendsSince: string | null;
  isAgent: boolean;
  worldId: string | null;
  worldResolvedBy: WorldResolutionSource;
  agentMetadata: Record<string, unknown>;
  agentProfile: Record<string, unknown>;
  world: Record<string, unknown> | null;
  worldview: Record<string, unknown> | null;
  payload: Record<string, unknown>;
  latestLocalMessage?: string | null;
  latestLocalMessageAt?: string | null;
};

export type LocalChatHistoryMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type LocalChatPromptInput = {
  target: LocalChatTarget;
  history: LocalChatHistoryMessage[];
  userInput: string;
  maxPromptChars?: number;
  maxHistoryChars?: number;
  maxJsonChars?: number;
};
