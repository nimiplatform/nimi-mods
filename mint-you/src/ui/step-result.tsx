import React from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import { useMintYouStore } from '../state/mint-you-store.js';
import { createUlid } from '../utils/ulid.js';
import { ErrorBanner } from './error-banner.js';
import { PhotoTrustPanel } from './photo-trust-panel.js';

function readPhotoTrustContext(): {
  currentUserId: string;
  otherUserId: string;
  otherHasPhoto: boolean;
} {
  if (typeof window === 'undefined') {
    return {
      currentUserId: '',
      otherUserId: '',
      otherHasPhoto: false,
    };
  }

  const params = new URLSearchParams(window.location.search);
  const currentUserId = String(
    params.get('mint_you_current_user_id')
    || params.get('currentUserId')
    || '',
  ).trim();
  const otherUserId = String(
    params.get('mint_you_other_user_id')
    || params.get('otherUserId')
    || '',
  ).trim();
  const rawOtherHasPhoto = String(params.get('mint_you_other_has_photo') || '').trim().toLowerCase();
  const otherHasPhoto = rawOtherHasPhoto === '1' || rawOtherHasPhoto === 'true' || rawOtherHasPhoto === 'yes';

  return {
    currentUserId,
    otherUserId,
    otherHasPhoto,
  };
}

export function StepResult() {
  const { t } = useModTranslation('mint-you');
  const store = useMintYouStore();
  const { createdAgentId, error, loading, basicInfo, worldId } = store;

  if (loading) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 p-8">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-[#4ECCA3]" />
        <p className="text-sm text-gray-600">{t('Result.creating')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-4">
        <ErrorBanner
          error={error}
          onRetry={() => {
            // Go back to confirm step to retry
            store.goToStep('user-confirm');
          }}
        />
      </div>
    );
  }

  if (createdAgentId) {
    const photoTrustContext = readPhotoTrustContext();
    const photoTrustReady = Boolean(worldId && photoTrustContext.currentUserId && photoTrustContext.otherUserId);

    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-6 p-8">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#4ECCA3]/10">
          <span className="text-3xl text-[#4ECCA3]">{'\u2713'}</span>
        </div>

        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-900">{t('Result.successTitle')}</h2>
          <p className="mt-1 text-sm text-gray-500">
            {t('Result.successMessage', { name: basicInfo?.displayName ?? '' })}
          </p>
        </div>

        <div className="rounded-lg bg-gray-50 px-4 py-2">
          <p className="text-xs text-gray-500">Agent ID</p>
          <p className="font-mono text-sm text-gray-700">{createdAgentId}</p>
        </div>

        {/* Photo Trust Panel — requires host-provided current/other user context. */}
        {worldId && photoTrustReady && (
          <div className="w-full max-w-sm">
            <PhotoTrustPanel
              currentUserId={photoTrustContext.currentUserId}
              otherUserId={photoTrustContext.otherUserId}
              worldId={worldId}
              otherHasPhoto={photoTrustContext.otherHasPhoto}
            />
          </div>
        )}
        {worldId && !photoTrustReady && (
          <p className="text-center text-xs text-gray-500">
            Photo trust controls appear when host integration provides current and peer user IDs.
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => {
              store.reset();
              store.startNewSession(createUlid());
            }}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            {t('Result.createAnother')}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
