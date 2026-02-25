import { useTranslation } from 'react-i18next';

type ExportToolbarProps = {
  canExport: boolean;
  onExportJson: () => void;
  onExportPdf: () => void;
  onExportHtml: () => void;
};

export function ExportToolbar({ canExport, onExportJson, onExportPdf, onExportHtml }: ExportToolbarProps) {
  const { t } = useTranslation('kismet');

  if (!canExport) return null;

  return (
    <div className="flex gap-2">
      <button
        onClick={onExportJson}
        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
      >
        {t('ExportToolbar.exportJson')}
      </button>
      <button
        onClick={onExportPdf}
        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
      >
        {t('ExportToolbar.exportPdf')}
      </button>
      <button
        onClick={onExportHtml}
        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
      >
        {t('ExportToolbar.exportHtml')}
      </button>
    </div>
  );
}
