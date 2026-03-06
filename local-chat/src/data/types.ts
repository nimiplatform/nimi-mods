import type { LocalChatContextPacket } from '../state/ledger-types.js';

export type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type WorldResolutionSource = 'profile' | 'unresolved';

export type LocalChatCoreQueryBridge = {
  query: (capability: string, query?: Record<string, unknown>) => Promise<unknown>;
  withOpenApiContextLock?: <T>(
    context: {
      realmBaseUrl: string;
      accessToken?: string;
      fetchImpl?: FetchImpl | null;
    },
    task: () => Promise<T>,
  ) => Promise<T>;
};

export type LocalChatReadContext = {
  realmBaseUrl: string;
  accessToken?: string;
  fetchImpl?: FetchImpl | null;
  viewerId?: string | null;
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

export type LocalChatPromptInput = {
  contextPacket: LocalChatContextPacket;
  maxPromptChars?: number;
};
