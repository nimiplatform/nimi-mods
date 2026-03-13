import React, { useEffect } from 'react';
import { useMintYouStore } from '../state/mint-you-store.js';
import { useMintYouSession } from '../hooks/use-mint-you-session.js';
import { MintYouShell } from './mint-you-shell.js';

export function MintYouPage() {
  const sessionId = useMintYouStore((s) => s.sessionId);
  const { initSession } = useMintYouSession();

  useEffect(() => {
    if (!sessionId) {
      void initSession();
    }
  }, [sessionId, initSession]);

  return (
    <div
      data-nimi-mod-root="mint-you"
      className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-gray-50"
    >
      <MintYouShell />
    </div>
  );
}
