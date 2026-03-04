import React, { useState, useEffect } from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import {
  getAuthState,
  canRequest,
  getCooldownRemaining,
  requestPhoto,
  respondToRequest,
  revokeAccess,
} from '../services/photo-auth.js';
import { emitMintYouLog } from '../logging.js';
import { MINTYOU_AUDIT } from '../contracts.js';
import type { PhotoAuthState } from '../types.js';

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
  const [authState, setAuthState] = useState<PhotoAuthState>(() =>
    getAuthState(currentUserId, otherUserId, worldId),
  );
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (authState !== 'DECLINED') return;
    const remaining = getCooldownRemaining(currentUserId, otherUserId, worldId);
    setCooldown(remaining);
    if (remaining <= 0) return;
    const interval = setInterval(() => {
      const r = getCooldownRemaining(currentUserId, otherUserId, worldId);
      setCooldown(r);
      if (r <= 0) clearInterval(interval);
    }, 60000);
    return () => clearInterval(interval);
  }, [authState, currentUserId, otherUserId, worldId]);

  const handleRequest = () => {
    const newState = requestPhoto(currentUserId, otherUserId, worldId);
    setAuthState(newState);
    emitMintYouLog({ message: MINTYOU_AUDIT.PHOTO_REQUESTED, source: 'PhotoTrustPanel' });
  };

  const handleRespond = (accept: boolean) => {
    const newState = respondToRequest(currentUserId, otherUserId, worldId, accept);
    setAuthState(newState);
    if (accept) {
      emitMintYouLog({ message: MINTYOU_AUDIT.PHOTO_ACCEPTED, source: 'PhotoTrustPanel' });
    } else {
      emitMintYouLog({ message: MINTYOU_AUDIT.PHOTO_DECLINED, source: 'PhotoTrustPanel' });
    }
  };

  const handleRevoke = () => {
    const newState = revokeAccess(currentUserId, otherUserId, worldId);
    setAuthState(newState);
    emitMintYouLog({ message: MINTYOU_AUDIT.PHOTO_REVOKED, source: 'PhotoTrustPanel' });
  };

  const requestAllowed = canRequest(currentUserId, otherUserId, worldId);

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
          disabled={!requestAllowed}
          className="rounded-lg bg-[#4ECCA3] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3DBB92] disabled:opacity-50"
        >
          {t('PhotoTrust.requestReveal')}
        </button>
      )}

      {authState === 'A_REQUESTED' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">{t('PhotoTrust.pendingRequest')}</p>
          <div className="flex gap-2">
            <button
              onClick={() => handleRespond(true)}
              className="rounded-lg bg-[#4ECCA3] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3DBB92]"
            >
              {t('PhotoTrust.accept')}
            </button>
            <button
              onClick={() => handleRespond(false)}
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
          className="rounded-lg bg-[#4ECCA3] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3DBB92]"
        >
          {t('PhotoTrust.requestAgain')}
        </button>
      )}
    </div>
  );
}
