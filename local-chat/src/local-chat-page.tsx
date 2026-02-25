import React from 'react';
import { LocalChatShell } from './components/index.js';
import { useLocalChatPageController } from './hooks/use-local-chat-page-controller.js';

export function LocalChatPage() {
  const props = useLocalChatPageController();
  return <LocalChatShell {...props} />;
}
