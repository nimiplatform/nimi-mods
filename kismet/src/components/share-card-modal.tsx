import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { KismetNatalAnalysisResult } from '../types.js';
import { createShareCardElement, downloadShareCard } from '../services/share-card-renderer.js';

type ShareCardModalProps = {
  result: KismetNatalAnalysisResult;
  name: string;
  open: boolean;
  onClose: () => void;
};

export function ShareCardModal({ result, name, open, onClose }: ShareCardModalProps) {
  const { t } = useTranslation('kismet');
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const wrap = previewRef.current;
    if (!wrap) return;

    wrap.innerHTML = '';
    const iframe = createShareCardElement({ name, result });
    wrap.appendChild(iframe);

    return () => { wrap.innerHTML = ''; };
  }, [open, name, result]);

  const handleDownload = useCallback(() => {
    downloadShareCard({ name, result });
  }, [name, result]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(8px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
        <div
          ref={previewRef}
          style={{ boxShadow: '0 20px 50px rgba(0,0,0,0.8)' }}
        />

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            onClick={handleDownload}
            className="ks-serif"
            style={{
              padding: '10px 32px',
              background: 'transparent',
              border: '1px solid #dcb347',
              color: '#dcb347',
              fontSize: '0.95rem',
              cursor: 'pointer',
              letterSpacing: 4,
              transition: 'all 0.3s',
            }}
          >
            {t('ShareCard.download')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ks-serif"
            style={{
              padding: '10px 24px',
              background: 'transparent',
              border: '1px solid rgba(138,114,84,0.4)',
              color: '#8C857B',
              fontSize: '0.95rem',
              cursor: 'pointer',
              letterSpacing: 2,
            }}
          >
            {t('ShareCard.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
