import { useTranslation } from 'react-i18next';
import type { KismetError } from '../types.js';

type ErrorPanelProps = {
  error: KismetError;
  onRetry?: () => void;
  onSwitchMode?: () => void;
};

export function ErrorPanel({ error, onRetry, onSwitchMode }: ErrorPanelProps) {
  const { t } = useTranslation('kismet');

  return (
    <div style={{ background: 'rgba(166,56,46,0.08)', border: '1px solid rgba(166,56,46,0.3)', padding: 20 }}>
      <h3 className="ks-serif mb-3 text-sm" style={{ color: '#A6382E', fontWeight: 600 }}>
        {t('ErrorPanel.title')}
      </h3>
      <div className="space-y-2 text-sm" style={{ color: '#E8E3D7' }}>
        <div>
          <span style={{ color: '#8C857B' }}>{t('ErrorPanel.reasonCode')}: </span>
          <code className="text-xs" style={{ background: 'rgba(166,56,46,0.15)', padding: '1px 4px', color: '#A6382E' }}>{error.reasonCode}</code>
        </div>
        {error.upstreamReasonCode && (
          <div>
            <span style={{ color: '#8C857B' }}>{t('ErrorPanel.upstreamReasonCode')}: </span>
            <code className="text-xs" style={{ background: 'rgba(166,56,46,0.15)', padding: '1px 4px', color: '#A6382E' }}>{error.upstreamReasonCode}</code>
          </div>
        )}
        {error.traceId && (
          <div>
            <span style={{ color: '#8C857B' }}>{t('ErrorPanel.traceId')}: </span>
            <code className="text-xs" style={{ background: 'rgba(0,0,0,0.2)', padding: '1px 4px' }}>{error.traceId}</code>
          </div>
        )}
        <p style={{ color: '#E8E3D7' }}>{error.message}</p>
        {error.diagnosticPreview && (
          <div>
            <span style={{ color: '#8C857B' }}>{t('ErrorPanel.preview')}: </span>
            <code className="break-all text-xs" style={{ background: 'rgba(0,0,0,0.2)', padding: '1px 4px' }}>{error.diagnosticPreview}</code>
          </div>
        )}
        {typeof error.diagnosticLength === 'number' && (
          <div>
            <span style={{ color: '#8C857B' }}>{t('ErrorPanel.rawLength')}: </span>
            <code className="text-xs" style={{ background: 'rgba(0,0,0,0.2)', padding: '1px 4px' }}>{error.diagnosticLength}</code>
          </div>
        )}
        {error.diagnosticTailPreview && error.diagnosticTailPreview !== error.diagnosticPreview && (
          <div>
            <span style={{ color: '#8C857B' }}>{t('ErrorPanel.tailPreview')}: </span>
            <code className="break-all text-xs" style={{ background: 'rgba(0,0,0,0.2)', padding: '1px 4px' }}>{error.diagnosticTailPreview}</code>
          </div>
        )}
        <div>
          <span style={{ color: '#8C857B' }}>{t('ErrorPanel.hint')}: </span>
          {error.actionHint}
        </div>
      </div>
      <div className="mt-4 flex gap-3">
        {onRetry && (
          <button
            onClick={onRetry}
            className="ks-serif text-xs"
            style={{ background: '#A6382E', border: 'none', color: '#E8E3D7', padding: '6px 16px', cursor: 'pointer' }}
          >
            {t('ErrorPanel.retry')}
          </button>
        )}
        {onSwitchMode && (
          <button
            onClick={onSwitchMode}
            className="ks-serif text-xs"
            style={{ background: 'transparent', border: '1px solid #A6382E', color: '#A6382E', padding: '6px 16px', cursor: 'pointer' }}
          >
            {t('ErrorPanel.switchMode')}
          </button>
        )}
      </div>
    </div>
  );
}
