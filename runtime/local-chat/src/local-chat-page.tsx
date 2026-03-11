import React from 'react';
import { LocalChatShell } from './components/index.js';
import { useLocalChatPageController } from './hooks/use-local-chat-page-controller.js';

export function LocalChatPage() {
  const props = useLocalChatPageController();
  return (
    <div data-nimi-mod-root="local-chat" className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
      <LocalChatShell {...props} />
    </div>
  );
}
