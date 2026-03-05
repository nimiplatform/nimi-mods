import type { ChatMessage } from '../../types.js';

const GROUP_BREAK_GAP_MS = 180_000;

export type MessageVisualPosition = 'single' | 'start' | 'middle' | 'end';

export type MessageVisualItem = {
  message: ChatMessage;
  groupIndex: number;
  indexInGroup: number;
  groupSize: number;
  isGroupStart: boolean;
  isGroupEnd: boolean;
  position: MessageVisualPosition;
  showAvatar: boolean;
  showTimestamp: boolean;
};

export type MessageVisualGroup = {
  groupIndex: number;
  role: ChatMessage['role'];
  items: MessageVisualItem[];
};

function shouldStartNewGroup(previous: ChatMessage | null, current: ChatMessage): boolean {
  if (!previous) return true;
  if (previous.role !== current.role) return true;
  if (previous.kind === 'streaming' || current.kind === 'streaming') return true;
  const gapMs = Math.abs(current.timestamp.getTime() - previous.timestamp.getTime());
  return gapMs > GROUP_BREAK_GAP_MS;
}

function toPosition(input: {
  groupSize: number;
  indexInGroup: number;
}): MessageVisualPosition {
  if (input.groupSize <= 1) return 'single';
  if (input.indexInGroup === 0) return 'start';
  if (input.indexInGroup === input.groupSize - 1) return 'end';
  return 'middle';
}

export function buildMessageVisualGroups(messages: ChatMessage[]): MessageVisualGroup[] {
  const groups: MessageVisualGroup[] = [];
  let currentMessages: ChatMessage[] = [];
  let previous: ChatMessage | null = null;
  let groupIndex = 0;

  const pushGroup = () => {
    if (currentMessages.length === 0) return;
    const role = currentMessages[0]?.role || 'assistant';
    const groupSize = currentMessages.length;
    const items: MessageVisualItem[] = currentMessages.map((message, indexInGroup) => {
      const position = toPosition({ groupSize, indexInGroup });
      const isGroupStart = indexInGroup === 0;
      const isGroupEnd = indexInGroup === groupSize - 1;
      const showAvatar = groupSize === 1 || isGroupStart || isGroupEnd;
      return {
        message,
        groupIndex,
        indexInGroup,
        groupSize,
        isGroupStart,
        isGroupEnd,
        position,
        showAvatar,
        showTimestamp: isGroupEnd,
      };
    });
    groups.push({
      groupIndex,
      role,
      items,
    });
    groupIndex += 1;
    currentMessages = [];
  };

  for (const message of messages) {
    if (shouldStartNewGroup(previous, message)) {
      pushGroup();
    }
    currentMessages.push(message);
    previous = message;
  }
  pushGroup();

  return groups;
}
