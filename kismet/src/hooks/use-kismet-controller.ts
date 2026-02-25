import { useCallback } from 'react';
import { useKismetStore } from '../state/kismet-store.js';
import { useKismetRoute } from './use-kismet-route.js';
import { validateKismetInput } from '../validation/validate-input.js';
import { generatePrompts, parseImportedResult } from '../services/prompt-import.js';
import { generateViaAi } from '../services/runtime-ai.js';
import { getKismetAiClient } from '../runtime-mod.js';
import { emitKismetLog } from '../logging.js';
import { KISMET_AUDIT } from '../contracts.js';

export function useKismetController() {
  const store = useKismetStore();
  const route = useKismetRoute();

  const submitInput = useCallback(async () => {
    const validation = validateKismetInput(store.input);
    if (!validation.ok) {
      store.setError(validation.error);
      return;
    }

    const validInput = validation.data;
    emitKismetLog({ message: KISMET_AUDIT.INPUT_SUBMITTED, source: 'useKismetController' });

    if (store.mode === 'prompt-import') {
      const prompts = generatePrompts(validInput);
      store.setGeneratedPrompts(prompts);
    } else {
      // Runtime-AI mode
      const source = await route.checkRouteHealth();
      if (source === 'unavailable') {
        emitKismetLog({ message: KISMET_AUDIT.FALLBACK_TO_IMPORT, source: 'useKismetController' });
        store.setMode('prompt-import');
        const prompts = generatePrompts(validInput);
        store.setGeneratedPrompts(prompts);
        store.setError({
          reasonCode: 'KISMET_ROUTE_UNAVAILABLE',
          message: 'AI 路由不可用，已自动切换到 Prompt 导入模式',
          actionHint: '请复制提示词到外部 AI 执行后粘贴结果',
        });
        return;
      }

      store.setLoading(true);
      store.setError(null);
      emitKismetLog({ message: KISMET_AUDIT.AI_GENERATE_STARTED, source: 'useKismetController' });

      const aiClient = getKismetAiClient();
      const result = await generateViaAi({
        aiClient,
        input: validInput,
        routeOverride: route.routeOverride || undefined,
      });

      store.setLoading(false);
      if (result.ok) {
        emitKismetLog({ message: KISMET_AUDIT.AI_GENERATE_SUCCEEDED, source: 'useKismetController' });
        store.setResult(result.data);
        store.setRouteSource(result.routeSource as 'local-runtime' | 'token-api');
      } else {
        emitKismetLog({
          level: 'error',
          message: KISMET_AUDIT.AI_GENERATE_FAILED,
          source: 'useKismetController',
          details: { reasonCode: result.error.reasonCode },
        });
        store.setError(result.error);
      }
    }
  }, [store, route]);

  const importResult = useCallback((rawText: string) => {
    emitKismetLog({ message: KISMET_AUDIT.IMPORT_STARTED, source: 'useKismetController' });
    store.setLoading(true);

    const result = parseImportedResult(rawText);
    store.setLoading(false);

    if (result.ok) {
      emitKismetLog({ message: KISMET_AUDIT.IMPORT_SUCCEEDED, source: 'useKismetController' });
      store.setResult(result.data);
    } else {
      emitKismetLog({
        level: 'error',
        message: KISMET_AUDIT.IMPORT_FAILED,
        source: 'useKismetController',
        details: { reasonCode: result.error.reasonCode },
      });
      store.setError(result.error);
    }
  }, [store]);

  const copyPrompts = useCallback(() => {
    if (!store.generatedPrompts) return;
    const text = `${store.generatedPrompts.systemPrompt}\n\n---\n\n${store.generatedPrompts.userPrompt}`;
    navigator.clipboard.writeText(text);
    emitKismetLog({ message: KISMET_AUDIT.PROMPT_COPIED, source: 'useKismetController' });
  }, [store.generatedPrompts]);

  return {
    submitInput,
    importResult,
    copyPrompts,
    route,
  };
}
