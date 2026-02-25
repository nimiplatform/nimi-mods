import { AiKismetOutputSchema, KismetResultSchema } from '../schemas.js';
import { KISMET_REASON } from '../contracts.js';
import type { AiKismetOutput, KismetResult, KismetError } from '../types.js';

type ValidateAiOutputResult =
  | { ok: true; data: AiKismetOutput }
  | { ok: false; error: KismetError };

export function validateAiOutput(raw: unknown): ValidateAiOutputResult {
  const schemaResult = AiKismetOutputSchema.safeParse(raw);
  if (!schemaResult.success) {
    const issues = schemaResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    return {
      ok: false,
      error: {
        reasonCode: KISMET_REASON.RESULT_SCHEMA_INVALID,
        message: `AI 输出 schema 校验失败: ${issues}`,
        actionHint: '请确保 AI 输出包含完整的 analysis 和 keyNodes',
      },
    };
  }

  const data = schemaResult.data as AiKismetOutput;
  const semanticIssues: string[] = [];

  if (!data.keyNodes.some((n) => n.age === 1)) {
    semanticIssues.push('keyNodes 缺少 age=1 的起点节点');
  }
  if (!data.keyNodes.some((n) => n.age >= 95)) {
    semanticIssues.push('keyNodes 缺少接近 age=100 的终点节点');
  }

  if (semanticIssues.length > 0) {
    return {
      ok: false,
      error: {
        reasonCode: KISMET_REASON.RESULT_POINTS_INVALID,
        message: `语义校验失败: ${semanticIssues.join('; ')}`,
        actionHint: '请重新生成，确保 keyNodes 包含起点和终点',
      },
    };
  }

  return { ok: true, data };
}

type ValidateResultOutput =
  | { ok: true; data: KismetResult }
  | { ok: false; error: KismetError };

export function validateKismetResult(raw: unknown): ValidateResultOutput {
  const schemaResult = KismetResultSchema.safeParse(raw);
  if (!schemaResult.success) {
    const issues = schemaResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    return {
      ok: false,
      error: {
        reasonCode: KISMET_REASON.RESULT_SCHEMA_INVALID,
        message: `结果 schema 校验失败: ${issues}`,
        actionHint: '请确保 AI 输出包含完整的 analysis 和 100 条 chartData',
      },
    };
  }

  const data = schemaResult.data as KismetResult;
  const semanticIssues: string[] = [];

  if (data.chartData.length !== 100) {
    semanticIssues.push(`chartData 应有 100 条，实际 ${data.chartData.length} 条`);
  }

  for (let i = 0; i < data.chartData.length; i++) {
    const expected = i + 1;
    if (data.chartData[i]!.age !== expected) {
      semanticIssues.push(`chartData[${i}].age 应为 ${expected}，实际为 ${data.chartData[i]!.age}`);
      break;
    }
  }

  for (let i = 0; i < data.chartData.length; i++) {
    const p = data.chartData[i]!;
    if (p.high < Math.max(p.open, p.close)) {
      semanticIssues.push(`chartData[${i}] OHLC 约束违反: high(${p.high}) < max(open,close)(${Math.max(p.open, p.close)})`);
      break;
    }
    if (p.low > Math.min(p.open, p.close)) {
      semanticIssues.push(`chartData[${i}] OHLC 约束违反: low(${p.low}) > min(open,close)(${Math.min(p.open, p.close)})`);
      break;
    }
  }

  if (semanticIssues.length > 0) {
    return {
      ok: false,
      error: {
        reasonCode: KISMET_REASON.RESULT_POINTS_INVALID,
        message: `语义校验失败: ${semanticIssues.join('; ')}`,
        actionHint: '请重新生成，确保 chartData 包含 1-100 岁的完整数据且 OHLC 约束正确',
      },
    };
  }

  return { ok: true, data };
}
