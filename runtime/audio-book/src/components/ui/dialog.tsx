// ---------------------------------------------------------------------------
// Shared Dialog component (Radix UI)
// ---------------------------------------------------------------------------

import React from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Button } from './button.js';

type ConfirmDialogProps = {
  open: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
};

export function ConfirmDialog({
  open,
  message,
  onConfirm,
  onCancel,
  confirmLabel,
  cancelLabel,
  variant = 'default',
}: ConfirmDialogProps) {
  const { t } = useModTranslation('audio-book');

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay data-nimi-mod-portal="audio-book" className="fixed inset-0 z-40 bg-black/30 transition-opacity duration-150 data-[state=closed]:opacity-0 data-[state=open]:opacity-100" />
        <DialogPrimitive.Content data-nimi-mod-portal="audio-book" className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-gray-200 bg-white p-5 shadow-xl">
          <DialogPrimitive.Description className="text-sm text-gray-700">
            {message}
          </DialogPrimitive.Description>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              {cancelLabel ?? t('dialog.cancel')}
            </Button>
            <Button
              variant={variant === 'destructive' ? 'destructive' : 'primary'}
              size="sm"
              onClick={onConfirm}
            >
              {confirmLabel ?? t('dialog.confirm')}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
