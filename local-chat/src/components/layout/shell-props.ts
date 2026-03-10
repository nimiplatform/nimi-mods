import type React from 'react';
import type {
  DerivedInteractionProfile,
  InteractionSnapshot,
  LocalChatProductSettings,
  LocalChatTurnSendPhase,
  RelationMemorySlot,
  VoiceConversationMode,
} from '../../state/index.js';
import type { ChatMessage } from '../../types.js';
import type { RuntimeStatusSidebar } from '../runtime-status-sidebar.js';
import type { LocalChatTargetItem, VoiceContextMenu, VoiceInputState } from './types.js';
import type { MemorySyncStatus } from '../../services/memory/memory-sync-adapter.js';
import type { LocalChatConversationViewMode } from '../../hooks/controller/use-local-chat-conversation-view-mode.js';

export type LocalChatShellProps = {
  visibleTargets: LocalChatTargetItem[];
  loadingTargets: boolean;
  selectedTargetId: string;
  setSelectedTargetId: (value: string) => void;
  targetSearchText: string;
  setTargetSearchText: (value: string) => void;
  selectedTarget: LocalChatTargetItem | null;
  selectedTargetAvatarUrl: string | null;
  selectedTargetInitial: string;
  selectedTargetInteractionProfile: DerivedInteractionProfile | null;
  onOpenSelectedTargetProfile: () => void;
  loadingTargetDetail: boolean;
  loadingSessions: boolean;
  onClearChatHistory: () => void;
  isRuntimeSidebarOpen: boolean;
  setIsRuntimeSidebarOpen: (updater: (previous: boolean) => boolean) => void;
  runtimeSidebarProps: React.ComponentProps<typeof RuntimeStatusSidebar>;
  messages: ChatMessage[];
  isSending: boolean;
  sendPhase: LocalChatTurnSendPhase;
  currentUserDisplayName: string;
  currentUserAvatarUrl: string | null;
  playingVoiceMessageId: string | null;
  voiceTranscriptVisibleById: Record<string, boolean>;
  onPlayVoiceMessage: (message: ChatMessage) => void;
  onVoiceContextMenu: (message: ChatMessage, event: React.MouseEvent<HTMLButtonElement>) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  inputTextRef: React.RefObject<string>;
  hasInputText: boolean;
  setInputText: (value: string) => void;
  productSettings: LocalChatProductSettings;
  activeInteractionSnapshot: InteractionSnapshot | null;
  activeRelationMemorySlots: RelationMemorySlot[];
  memorySyncStatus: MemorySyncStatus;
  onToggleProductSetting: (key: 'allowProactiveContact' | 'autoPlayVoiceReplies', value: boolean) => void;
  onDefaultMediaAutonomyChange: (value: LocalChatProductSettings['mediaAutonomy']) => void;
  onDefaultVoiceAutonomyChange: (value: LocalChatProductSettings['voiceAutonomy']) => void;
  onDefaultVoiceConversationModeChange: (value: VoiceConversationMode) => void;
  onVisualComfortLevelChange: (value: LocalChatProductSettings['visualComfortLevel']) => void;
  onMemoryOverrideChange: (slotId: string, override: RelationMemorySlot['userOverride']) => void;
  onDeleteMemorySlot: (slotId: string) => void;
  hasConversationHistory: boolean;
  onInputKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  voiceInputState: VoiceInputState;
  onToggleVoiceInput: () => void;
  onCancelVoiceInput: () => void;
  enableVoice: boolean;
  voiceConversationMode: VoiceConversationMode;
  onVoiceConversationModeChange: (mode: VoiceConversationMode) => void;
  conversationViewMode: LocalChatConversationViewMode;
  setConversationViewMode: (mode: LocalChatConversationViewMode) => void;
  isTranscriptNearBottom: boolean;
  setIsTranscriptNearBottom: (value: boolean) => void;
  onSend: () => void;
  canSend: boolean;
  voiceContextMenu: VoiceContextMenu | null;
  onToggleVoiceTranscript: (messageId: string) => void;
};
