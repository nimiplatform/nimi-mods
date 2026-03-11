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

  const btnStyle: React.CSSProperties = {
    background: 'transparent',
    border: '1px solid rgba(138,114,84,0.4)',
    color: '#8A7254',
    padding: '5px 14px',
    fontSize: '0.8rem',
    cursor: 'pointer',
    transition: 'all 0.3s',
    fontFamily: 'var(--font-serif)',
  };

  return (
    <div className="flex gap-2">
      <button onClick={onExportJson} style={btnStyle}>{t('ExportToolbar.exportJson')}</button>
      <button onClick={onExportPdf} style={btnStyle}>{t('ExportToolbar.exportPdf')}</button>
      <button onClick={onExportHtml} style={btnStyle}>{t('ExportToolbar.exportHtml')}</button>
    </div>
  );
}
