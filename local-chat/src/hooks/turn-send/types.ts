import type { RuntimeRouteBinding, RuntimeRouteOptionsSnapshot } from '@nimiplatform/sdk/mod/runtime-route';
import type { Dispatch, SetStateAction } from 'react';
import type { LocalChatTarget } from '../../data/index.js';
import type {
  LocalChatDefaultSettings,
  LocalChatPromptTrace,
  LocalChatSession,
  LocalChatTurnAudit,
} from '../../state/index.js';
import type { ChatMessage } from '../../types.js';
import type { LocalChatAiClient, LocalChatAudioPlaybackSource } from '../../runtime-ai-client.js';

export type ChatRouteSnapshot = {
  source: string;
  model: string;
};

export type AssistantPlanChannel = 'auto' | 'text' | 'voice';
export type AssistantPlanIntent = 'answer' | 'clarify' | 'plan' | 'checkin' | 'followup';
export type SegmentParseMode = 'explicit-delimiter' | 'double-newline' | 'single-message';
export type LocalChatScheduleCancelReason =
  | 'LOCAL_CHAT_SCHEDULE_CANCELLED_BY_NEW_USER_TURN'
  | 'LOCAL_CHAT_SCHEDULE_CANCELLED_BY_CONTEXT_CHANGE';

export type AssistantPlanSegment = {
  id: string;
  content: string;
  delayMs: number;
  channel: AssistantPlanChannel;
  intent: AssistantPlanIntent;
  reason?: string;
};

export type LocalChatTurnAiClient = Pick<
  LocalChatAiClient,
  'generateText' | 'generateObject' | 'streamText' | 'generateImage' | 'generateVideo' | 'resolveRoute'
>;

export type UseLocalChatTurnSendInput = {
  aiClient: LocalChatTurnAiClient;
  inputText: string;
  setInputText: (value: string) => void;
  runtimeMode: 'STORY' | 'SCENE_TURN' | undefined;
  chatRouteOptions: RuntimeRouteOptionsSnapshot | null;
  routeBinding: RuntimeRouteBinding | null;
  routeSnapshot: ChatRouteSnapshot | null;
  defaultSettings: LocalChatDefaultSettings;
  selectedTarget: LocalChatTarget | null;
  selectedSessionId: string;
  messages: ChatMessage[];
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setSessions: (sessions: LocalChatSession[]) => void;
  setSelectedSessionId: (sessionId: string) => void;
  setLatestPromptTrace: (trace: LocalChatPromptTrace | null) => void;
  setLatestTurnAudit: (audit: LocalChatTurnAudit | null) => void;
  setStatusBanner: (input: {
    kind: 'warn' | 'error' | 'success' | 'info';
    message: string;
    actionLabel?: string;
    onAction?: () => void;
  }) => void;
  isTranscribing?: boolean;
  onOpenRuntimeSetup?: () => void;
  synthesizeVoice?: (text: string) => Promise<LocalChatAudioPlaybackSource>;
};
