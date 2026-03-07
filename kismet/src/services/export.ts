import type {
  KismetBirthInputV2,
  KismetCompatibilityResult,
  KismetDailyFortuneResult,
  KismetNatalAnalysisResult,
} from '../types.js';

type ExportPayload = {
  birthInput: Partial<KismetBirthInputV2>;
  natalResult: KismetNatalAnalysisResult | null;
  dailyResult: KismetDailyFortuneResult | null;
  compatibilityResult: KismetCompatibilityResult | null;
};

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function buildFilename(input: Partial<KismetBirthInputV2>, ext: string): string {
  const name = input.name || input.birthPlaceLabel || 'kismet-v2';
  const date = new Date().toISOString().slice(0, 10);
  return `${name}-${date}.${ext}`;
}

export function exportAsJson(payload: ExportPayload): void {
  const json = JSON.stringify({
    exportedAt: new Date().toISOString(),
    ...payload,
  }, null, 2);
  downloadBlob(new Blob([json], { type: 'application/json' }), buildFilename(payload.birthInput, 'json'));
}

function renderHtml(payload: ExportPayload): string {
  const subject = payload.birthInput.name || payload.birthInput.birthPlaceLabel || 'Kismet';
  const natalSummary = payload.natalResult
    ? `<section><h2>命盘分析</h2><p>${payload.natalResult.analysis.summary}</p></section>`
    : '';
  const dailySummary = payload.dailyResult
    ? `<section><h2>今日运势</h2><p>${payload.dailyResult.summary}</p></section>`
    : '';
  const compatibilitySummary = payload.compatibilityResult
    ? `<section><h2>命理匹配</h2><p>${payload.compatibilityResult.summary}</p></section>`
    : '';

  return `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8" />
  <title>Kismet v2 - ${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 960px; margin: 0 auto; padding: 32px; color: #111827; }
    h1, h2 { margin-bottom: 8px; }
    section { margin-bottom: 20px; padding: 16px; border: 1px solid #e5e7eb; border-radius: 16px; background: #ffffff; }
    .meta { color: #6b7280; margin-bottom: 24px; }
    pre { white-space: pre-wrap; word-break: break-word; background: #f9fafb; border-radius: 12px; padding: 12px; }
  </style>
</head>
<body>
  <h1>Kismet v2 导出</h1>
  <p class="meta">${subject} · ${payload.birthInput.birthDate || '-'} ${payload.birthInput.birthTime || ''} · ${payload.birthInput.birthPlaceLabel || '-'}</p>
  ${natalSummary}
  ${dailySummary}
  ${compatibilitySummary}
  <section><h2>原始导出 JSON</h2><pre>${JSON.stringify(payload, null, 2)}</pre></section>
</body>
</html>`;
}

export function exportAsHtml(payload: ExportPayload): void {
  downloadBlob(new Blob([renderHtml(payload)], { type: 'text/html' }), buildFilename(payload.birthInput, 'html'));
}

export function exportAsPdf(payload: ExportPayload): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    return;
  }
  printWindow.document.write(renderHtml(payload));
  printWindow.document.close();
  printWindow.print();
}
