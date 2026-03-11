import { CITY_CATALOG } from '../data/city-catalog.js';
import { KismetBirthInputSchema } from '../schemas.js';
import type { KismetBirthInputV2, KismetError } from '../types.js';
import { KISMET_REASON } from '../contracts.js';
import { normalizeDateValue, normalizeTimeValue } from '../utils/normalize-birth-fields.js';

type ValidateInputResult =
  | { ok: true; data: KismetBirthInputV2 }
  | { ok: false; error: KismetError };

function normalizeBirthInput(raw: unknown): Partial<KismetBirthInputV2> {
  const input = raw && typeof raw === 'object' ? raw as Partial<KismetBirthInputV2> : {};
  const city = CITY_CATALOG.find((item) => (
    (input.birthPlaceId && item.cityId === input.birthPlaceId)
    || (input.birthPlaceLabel && (item.cityZh === input.birthPlaceLabel || item.city === input.birthPlaceLabel))
  ));

  const normalizedName = String(input.name || '').trim();
  const normalizedDate = normalizeDateValue(input.birthDate);
  const normalizedTime = normalizeTimeValue(input.birthTime);

  return {
    name: normalizedName || undefined,
    gender: input.gender,
    birthDate: normalizedDate,
    birthTime: normalizedTime,
    birthPlaceId: input.birthPlaceId || city?.cityId,
    birthPlaceLabel: String(input.birthPlaceLabel || city?.cityZh || '').trim(),
    timezone: String(input.timezone || city?.timezone || 'Asia/Shanghai').trim(),
    consent: {
      allowCityAffinityUse: input.consent?.allowCityAffinityUse ?? true,
      allowLocalProfilePersist: input.consent?.allowLocalProfilePersist ?? false,
      allowLocalProfileMatchUse: input.consent?.allowLocalProfileMatchUse ?? false,
    },
  };
}

export function validateKismetBirthInput(raw: unknown): ValidateInputResult {
  const normalized = normalizeBirthInput(raw);
  const result = KismetBirthInputSchema.safeParse(normalized);
  if (result.success) {
    return { ok: true, data: result.data };
  }

  const issues = result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
    return `${path}${issue.message}`;
  }).join('; ');
  return {
    ok: false,
    error: {
      reasonCode: KISMET_REASON.INPUT_INVALID,
      message: `输入校验失败: ${issues}`,
      actionHint: '请检查出生日期、时间、出生地和授权开关是否完整。',
    },
  };
}
