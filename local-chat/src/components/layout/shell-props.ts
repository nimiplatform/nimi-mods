import type React from 'react';
import type {
  DerivedInteractionProfile,
  InteractionSnapshot,
  LocalChatProductSettings,
  LocalChatSession,
  RelationMemorySlot,
  VoiceConversationMode,
} from '../../state/index.js';
import type { ChatMessage } from '../../types.js';
import type { RuntimeStatusSidebar } from '../runtime-status-sidebar.js';
import type { LocalChatTargetItem, VoiceContextMenu, VoiceInputState } from './types.js';
import type { MemorySyncStatus } from '../../services/memory/memory-sync-adapter.js';

export type LocalChatShellProps = {
  visibleTargets: LocalChatTargetItem[];
  loadingTargets: boolean;
  selectedTargetId: string;
  setSelectedTargetId: (value: string) => void;
  targetSearchText: string;
  setTargetSearchText: (value: string) => void;
  onRefresh: () => void;
  selectedTarget: LocalChatTargetItem | null;
  selectedTargetAvatarUrl: string | null;
  selectedTargetInitial: string;
  selectedTargetInteractionProfile: DerivedInteractionProfile | null;
  onOpenSelectedTargetProfile: () => void;
  loadingTargetDetail: boolean;
  sessions: LocalChatSession[];
  loadingSessions: boolean;
  selectedSessionId: string | null;
  onCreateSession: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  isSessionMenuOpen: boolean;
  setIsSessionMenuOpen: (updater: boolean | ((previous: boolean) => boolean)) => void;
  sessionMenuAnchorRef: React.RefObject<HTMLDivElement | null>;
  sessionMenuPanelRef: React.RefObject<HTMLDivElement | null>;
  isRuntimeSidebarOpen: boolean;
  setIsRuntimeSidebarOpen: (updater: (previous: boolean) => boolean) => void;
  runtimeSidebarProps: React.ComponentProps<typeof RuntimeStatusSidebar>;
  messages: ChatMessage[];
  isSending: boolean;
  currentUserDisplayName: string;
  currentUserAvatarUrl: string | null;
  playingVoiceMessageId: string | null;
  voiceTranscriptVisibleById: Record<string, boolean>;
  onPlayVoiceMessage: (message: ChatMessage) => void;
  onVoiceContextMenu: (message: ChatMessage, event: React.MouseEvent<HTMLButtonElement>) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  inputText: string;
  setInputText: (value: string) => void;
  productSettings: LocalChatProductSettings;
  activeInteractionSnapshot: InteractionSnapshot | null;
  activeRelationMemorySlots: RelationMemorySlot[];
  memorySyncStatus: MemorySyncStatus;
  onToggleProductSetting: (key: 'enableVoice' | 'allowProactiveContact' | 'autoPlayVoiceReplies', value: boolean) => void;
  onDefaultMediaAutonomyChange: (value: LocalChatProductSettings['mediaAutonomy']) => void;
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
  onSend: () => void;
  canSend: boolean;
  voiceContextMenu: VoiceContextMenu | null;
  onToggleVoiceTranscript: (messageId: string) => void;
};
