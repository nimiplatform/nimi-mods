import { useCallback } from 'react';
import { useKismetStore } from '../state/kismet-store.js';
import { exportAsHtml, exportAsJson, exportAsPdf } from '../services/export.js';
import { emitKismetLog } from '../logging.js';
import { KISMET_AUDIT } from '../contracts.js';

export function useKismetExport() {
  const { birthInput, natalResult, dailyResult, compatibilityResult } = useKismetStore();
  const payload = { birthInput, natalResult, dailyResult, compatibilityResult };
  const canExport = Boolean(natalResult || dailyResult || compatibilityResult);

  const handleExportJson = useCallback(() => {
    if (!canExport) return;
    emitKismetLog({ message: KISMET_AUDIT.EXPORT_JSON, source: 'useKismetExport' });
    exportAsJson(payload);
  }, [canExport, payload]);

  const handleExportPdf = useCallback(() => {
    if (!canExport) return;
    emitKismetLog({ message: KISMET_AUDIT.EXPORT_PDF, source: 'useKismetExport' });
    exportAsPdf(payload);
  }, [canExport, payload]);

  const handleExportHtml = useCallback(() => {
    if (!canExport) return;
    emitKismetLog({ message: KISMET_AUDIT.EXPORT_HTML, source: 'useKismetExport' });
    exportAsHtml(payload);
  }, [canExport, payload]);

  return {
    canExport,
    handleExportJson,
    handleExportPdf,
    handleExportHtml,
  };
}
