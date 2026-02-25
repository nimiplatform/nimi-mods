import type { ModAiClient } from '@nimiplatform/mod-sdk/ai';
import type { RuntimeRouteBinding } from '@nimiplatform/mod-sdk/runtime-route';
import type { KismetInput, KismetResult, KismetError } from '../types.js';
import { KISMET_REASON } from '../contracts.js';
import { buildKismetSystemPrompt } from '../prompt/system-prompt.js';
import { buildKismetUserPrompt } from '../prompt/user-prompt.js';
import { parseResultFromText } from '../validation/parse-result-json.js';
import { validateAiOutput } from '../validation/validate-result.js';
import { interpolateKeyNodes } from './interpolation.js';
import { emitKismetLog } from '../logging.js';

type GenerateViaAiInput = {
  aiClient: ModAiClient;
  input: KismetInput;
  routeOverride?: RuntimeRouteBinding;
  abortSignal?: AbortSignal;
};

type GenerateViaAiOutput =
  | { ok: true; data: KismetResult; routeSource: string }
  | { ok: false; error: KismetError };

export async function generateViaAi(opts: GenerateViaAiInput): Promise<GenerateViaAiOutput> {
  const { aiClient, input, routeOverride, abortSignal } = opts;
  const routeInput = { routeHint: 'chat/default' as const, routeOverride };

  // Check route health first
  try {
    const health = await aiClient.checkRouteHealth(routeInput);
    if (health.reasonCode !== 'RUNTIME_ROUTE_HEALTHY' && health.reasonCode !== 'RUNTIME_ROUTE_DEGRADED') {
      return {
        ok: false,
        error: {
          reasonCode: KISMET_REASON.ROUTE_UNAVAILABLE,
          message: 'Chat 路由不可用',
          actionHint: '请检查模型状态或切换路由',
        },
      };
    }
  } catch {
    return {
      ok: false,
      error: {
        reasonCode: KISMET_REASON.ROUTE_UNAVAILABLE,
        message: 'Chat 路由健康检查失败',
        actionHint: '请检查 AI Runtime 状态或切换路由',
      },
    };
  }

  // Generate via AI
  try {
    const systemPrompt = buildKismetSystemPrompt(input);
    const userPrompt = buildKismetUserPrompt(input);

    const result = await aiClient.generateText({
      prompt: userPrompt,
      systemPrompt,
      maxTokens: 4096,
      temperature: 0.7,
      ...routeInput,
      abortSignal,
    });

    const routeSource = result.route?.source || 'unavailable';

    emitKismetLog({
      level: 'debug',
      message: 'action:ai-generate:response',
      source: 'generateViaAi',
      details: {
        routeSource,
        textLength: result.text?.length ?? 0,
        textPreview: (result.text || '').slice(0, 500),
      },
    });

    const parseResult = parseResultFromText(result.text);
    if (!parseResult.ok) {
      emitKismetLog({
        level: 'warn',
        message: 'action:ai-generate:parse-failed',
        source: 'generateViaAi',
        details: {
          reasonCode: parseResult.error.reasonCode,
          textLength: result.text?.length ?? 0,
          textTail: (result.text || '').slice(-200),
        },
      });
      return { ok: false, error: parseResult.error };
    }

    const validateResult = validateAiOutput(parseResult.data);
    if (!validateResult.ok) {
      emitKismetLog({
        level: 'warn',
        message: 'action:ai-generate:validate-failed',
        source: 'generateViaAi',
        details: {
          reasonCode: validateResult.error.reasonCode,
          message: validateResult.error.message,
        },
      });
      return { ok: false, error: validateResult.error };
    }

    const chartData = interpolateKeyNodes(validateResult.data.keyNodes, input.birthYear);

    return {
      ok: true,
      data: { analysis: validateResult.data.analysis, chartData },
      routeSource,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error || '');
    return {
      ok: false,
      error: {
        reasonCode: KISMET_REASON.AI_GENERATE_FAILED,
        message: `AI 生成失败: ${msg}`,
        actionHint: '请重试或切换到 Prompt-Import 模式',
      },
    };
  }
}
