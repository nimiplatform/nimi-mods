// ---------------------------------------------------------------------------
// Status badge component for Knowledge Base
// ---------------------------------------------------------------------------

import React from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import type { KBDocumentStatus } from '../../types.js';

type BadgeProps = {
  children: React.ReactNode;
  className?: string;
};

export function Badge({ children, className }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${className ?? ''}`}>
      {children}
    </span>
  );
}

const STATUS_CONFIG: Record<KBDocumentStatus, { bg: string; text: string }> = {
  pending: { bg: 'bg-gray-100', text: 'text-gray-600' },
  parsing: { bg: 'bg-blue-50', text: 'text-blue-600' },
  chunking: { bg: 'bg-blue-50', text: 'text-blue-600' },
  embedding: { bg: 'bg-purple-50', text: 'text-purple-600' },
  ready: { bg: 'bg-green-50', text: 'text-green-700' },
  error: { bg: 'bg-red-50', text: 'text-red-600' },
};

// SVG icons for status badges
function CheckCircleIcon() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function AlertCircleIcon() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

export function StatusBadge({ status }: { status: KBDocumentStatus }) {
  const { t } = useModTranslation('knowledge-base');
  const config = STATUS_CONFIG[status];
  const isProcessing = ['parsing', 'chunking', 'embedding'].includes(status);

  return (
    <Badge className={`${config.bg} ${config.text}`}>
      {status === 'ready' && <CheckCircleIcon />}
      {status === 'error' && <AlertCircleIcon />}
      {isProcessing && (
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      )}
      {t(`documents.status.${status}`)}
    </Badge>
  );
}
