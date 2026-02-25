import { KismetInputSchema } from '../schemas.js';
import type { KismetInput, KismetError } from '../types.js';
import { KISMET_REASON } from '../contracts.js';

type ValidateInputResult =
  | { ok: true; data: KismetInput }
  | { ok: false; error: KismetError };

export function validateKismetInput(raw: unknown): ValidateInputResult {
  const result = KismetInputSchema.safeParse(raw);
  if (result.success) {
    return { ok: true, data: result.data as KismetInput };
  }
  const issues = result.error.issues.map((i) => i.message).join('; ');
  return {
    ok: false,
    error: {
      reasonCode: KISMET_REASON.INPUT_INVALID,
      message: `输入校验失败: ${issues}`,
      actionHint: '请检查八字参数是否完整且格式正确',
    },
  };
}
