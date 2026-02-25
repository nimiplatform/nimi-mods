import { useCallback } from 'react';
import { useKismetStore } from '../state/kismet-store.js';
import { exportAsJson, exportAsHtml, exportAsPdf } from '../services/export.js';
import { emitKismetLog } from '../logging.js';
import { KISMET_AUDIT } from '../contracts.js';
import type { KismetInput } from '../types.js';

export function useKismetExport() {
  const { result, input } = useKismetStore();

  const validInput = input as KismetInput;

  const handleExportJson = useCallback(() => {
    if (!result) return;
    emitKismetLog({ message: KISMET_AUDIT.EXPORT_JSON, source: 'useKismetExport' });
    exportAsJson(result, validInput);
  }, [result, validInput]);

  const handleExportPdf = useCallback(() => {
    if (!result) return;
    emitKismetLog({ message: KISMET_AUDIT.EXPORT_PDF, source: 'useKismetExport' });
    exportAsPdf(result, validInput);
  }, [result, validInput]);

  const handleExportHtml = useCallback(() => {
    if (!result) return;
    emitKismetLog({ message: KISMET_AUDIT.EXPORT_HTML, source: 'useKismetExport' });
    exportAsHtml(result, validInput);
  }, [result, validInput]);

  return {
    canExport: result !== null,
    handleExportJson,
    handleExportPdf,
    handleExportHtml,
  };
}
