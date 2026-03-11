import React, { useCallback, useEffect, useState } from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import {
  readPhotoAuthSnapshot,
  requestPhoto,
  respondToRequest,
  revokeAccess,
} from '../services/photo-auth.js';
import { emitMintYouLog } from '../logging.js';
import { MINTYOU_AUDIT } from '../contracts.js';
import type { PhotoAuthSnapshot } from '../types.js';
import { getMintYouHookClient } from '../runtime-mod.js';

type PhotoTrustPanelProps = {
  currentUserId: string;
  otherUserId: string;
  worldId: string;
  otherHasPhoto: boolean;
};

function formatCooldown(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}

export function PhotoTrustPanel({
  currentUserId,
  otherUserId,
  worldId,
  otherHasPhoto,
}: PhotoTrustPanelProps) {
  const { t } = useModTranslation('mint-you');
  const [snapshot, setSnapshot] = useState<PhotoAuthSnapshot>({
    state: 'NONE',
    requestedBy: null,
    cooldownRemainingMs: 0,
    canRequest: true,
  });
  const [busy, setBusy] = useState(false);

  const refreshSnapshot = useCallback(async () => {
    const hookClient = getMintYouHookClient();
    const next = await readPhotoAuthSnapshot(
      hookClient.data,
      currentUserId,
      otherUserId,
      worldId,
    );
    setSnapshot(next);
  }, [currentUserId, otherUserId, worldId]);

  useEffect(() => {
    void refreshSnapshot();
  }, [refreshSnapshot]);

  useEffect(() => {
    if (snapshot.state !== 'DECLINED' || snapshot.cooldownRemainingMs <= 0) return;
    const interval = setInterval(() => {
      void refreshSnapshot();
    }, 60000);
    return () => clearInterval(interval);
  }, [refreshSnapshot, snapshot.cooldownRemainingMs, snapshot.state]);

  const handleRequest = useCallback(async () => {
    setBusy(true);
    try {
      const hookClient = getMintYouHookClient();
      await requestPhoto(hookClient.data, currentUserId, otherUserId, worldId);
      await refreshSnapshot();
    } finally {
      setBusy(false);
    }
    emitMintYouLog({ message: MINTYOU_AUDIT.PHOTO_REQUESTED, source: 'PhotoTrustPanel' });
  }, [currentUserId, otherUserId, refreshSnapshot, worldId]);

  const handleRespond = useCallback(async (accept: boolean) => {
    setBusy(true);
    try {
      const hookClient = getMintYouHookClient();
      await respondToRequest(hookClient.data, currentUserId, otherUserId, worldId, accept);
      await refreshSnapshot();
    } finally {
      setBusy(false);
    }
    if (accept) {
      emitMintYouLog({ message: MINTYOU_AUDIT.PHOTO_ACCEPTED, source: 'PhotoTrustPanel' });
    } else {
      emitMintYouLog({ message: MINTYOU_AUDIT.PHOTO_DECLINED, source: 'PhotoTrustPanel' });
    }
  }, [currentUserId, otherUserId, refreshSnapshot, worldId]);

  const handleRevoke = useCallback(async () => {
    setBusy(true);
    try {
      const hookClient = getMintYouHookClient();
      await revokeAccess(hookClient.data, currentUserId, otherUserId, worldId);
      await refreshSnapshot();
    } finally {
      setBusy(false);
    }
    emitMintYouLog({ message: MINTYOU_AUDIT.PHOTO_REVOKED, source: 'PhotoTrustPanel' });
  }, [currentUserId, otherUserId, refreshSnapshot, worldId]);

  const authState = snapshot.state;
  const cooldown = snapshot.cooldownRemainingMs;
  const requestAllowed = snapshot.canRequest;
  const isPendingIncoming = authState === 'A_REQUESTED' && snapshot.requestedBy !== currentUserId;
  const isPendingOutgoing = authState === 'A_REQUESTED' && snapshot.requestedBy === currentUserId;

  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <h4 className="mb-2 text-sm font-medium text-gray-700">{t('PhotoTrust.title')}</h4>

      {/* State badge */}
      <div className="mb-2">
        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
          authState === 'MUTUAL' ? 'bg-green-100 text-green-700'
            : authState === 'A_REQUESTED' ? 'bg-yellow-100 text-yellow-700'
              : authState === 'DECLINED' ? 'bg-red-100 text-red-700'
                : 'bg-gray-100 text-gray-600'
        }`}>
          {t(`PhotoTrust.state.${authState}`)}
        </span>
      </div>

      {!otherHasPhoto && (
        <p className="text-xs text-gray-400">{t('PhotoTrust.noPhoto')}</p>
      )}

      {otherHasPhoto && authState === 'NONE' && (
        <button
          onClick={handleRequest}
          disabled={!requestAllowed || busy}
          className="rounded-lg bg-[#4ECCA3] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3DBB92] disabled:opacity-50"
        >
          {t('PhotoTrust.requestReveal')}
        </button>
      )}

      {isPendingOutgoing && (
        <p className="text-xs text-gray-500">{t('PhotoTrust.pendingRequest')}</p>
      )}

      {isPendingIncoming && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">{t('PhotoTrust.pendingRequest')}</p>
          <div className="flex gap-2">
            <button
              onClick={() => handleRespond(true)}
              disabled={busy}
              className="rounded-lg bg-[#4ECCA3] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3DBB92]"
            >
              {t('PhotoTrust.accept')}
            </button>
            <button
              onClick={() => handleRespond(false)}
              disabled={busy}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
            >
              {t('PhotoTrust.decline')}
            </button>
          </div>
        </div>
      )}

      {authState === 'MUTUAL' && (
        <div className="space-y-2">
          <p className="text-xs text-green-600">{t('PhotoTrust.mutualAccess')}</p>
          <button
            onClick={handleRevoke}
            disabled={busy}
            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
          >
            {t('PhotoTrust.revoke')}
          </button>
        </div>
      )}

      {authState === 'DECLINED' && cooldown > 0 && (
        <p className="text-xs text-gray-400">
          {t('PhotoTrust.cooldownActive', { time: formatCooldown(cooldown) })}
        </p>
      )}

      {authState === 'DECLINED' && cooldown <= 0 && (
        <button
          onClick={handleRequest}
          disabled={busy}
          className="rounded-lg bg-[#4ECCA3] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3DBB92]"
        >
          {t('PhotoTrust.requestAgain')}
        </button>
      )}
    </div>
  );
}
