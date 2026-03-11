function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function normalizeDateValue(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  const direct = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (direct) {
    return `${direct[1]}-${pad2(Number(direct[2]))}-${pad2(Number(direct[3]))}`;
  }

  const chinese = raw.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日?$/);
  if (chinese) {
    return `${chinese[1]}-${pad2(Number(chinese[2]))}-${pad2(Number(chinese[3]))}`;
  }

  const digits = raw.match(/(\d{4}).*?(\d{1,2}).*?(\d{1,2})/);
  if (digits) {
    return `${digits[1]}-${pad2(Number(digits[2]))}-${pad2(Number(digits[3]))}`;
  }

  return raw.replace(/\//g, '-');
}

export function normalizeTimeValue(value: unknown): string {
  const raw = String(value || '').trim().replaceAll('：', ':').replaceAll('.', ':');
  if (!raw) {
    return '';
  }

  const direct = raw.match(/^(\d{1,2}):(\d{1,2})(?::\d{1,2})?$/);
  if (direct) {
    return `${pad2(Number(direct[1]))}:${pad2(Number(direct[2]))}`;
  }

  const digitsOnly = raw.match(/^(\d{1,2})(\d{2})$/);
  if (digitsOnly) {
    return `${pad2(Number(digitsOnly[1]))}:${pad2(Number(digitsOnly[2]))}`;
  }

  const hm = raw.match(/(\d{1,2}).*?(\d{1,2})/);
  if (hm) {
    return `${pad2(Number(hm[1]))}:${pad2(Number(hm[2]))}`;
  }

  return raw.slice(0, 5);
}
