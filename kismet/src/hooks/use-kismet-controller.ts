import { useCallback, useEffect } from 'react';
import { KismetCanonicalProfileSchema } from '../schemas.js';
import { useKismetStore } from '../state/kismet-store.js';
import { useKismetRoute } from './use-kismet-route.js';
import { validateKismetBirthInput } from '../validation/validate-input.js';
import {
  buildCompatibilityPromptPackage,
  buildDailyPromptPackage,
  buildNatalPromptPackage,
  parseImportedResult,
} from '../services/prompt-import.js';
import { generateJsonViaAi } from '../services/runtime-ai.js';
import { getKismetAiClient } from '../runtime-mod.js';
import { emitKismetLog } from '../logging.js';
import { KISMET_AUDIT, KISMET_REASON } from '../contracts.js';
import { deriveCanonicalProfile } from '../services/bazi/derive-profile.js';
import { buildLocationContext } from '../services/city-affinity.js';
import { interpolateKeyNodes } from '../services/interpolation.js';
import { buildDailyDefaults } from '../services/daily-context.js';
import {
  validateCompatibilityResult,
  validateDailyResult,
  validateNatalAiOutput,
} from '../validation/validate-result.js';
import {
  createLocalShareProfile,
  loadLocalShareProfiles,
  persistLocalShareProfiles,
} from '../services/local-share-profiles.js';
import { buildCompatibilityFallback, scoreCompatibility } from '../services/compatibility.js';
import type {
  KismetCompatibilityResult,
  KismetDailyFortuneResult,
  KismetNatalAiOutput,
} from '../types.js';

function buildCanonicalProfileError(issues: string[]) {
  return {
    reasonCode: KISMET_REASON.CANONICAL_PROFILE_INVALID,
    message: `命盘推导失败: ${issues.join('; ')}`,
    actionHint: '请检查出生日期、时间与出生地后重试。',
  };
}

function buildRouteUnavailableError(): {
  reasonCode: string;
  message: string;
  actionHint: string;
} {
  return {
    reasonCode: KISMET_REASON.ROUTE_UNAVAILABLE,
    message: '当前 AI 路由无有效 connector/model 绑定，已阻止本次请求。',
    actionHint: '请确认 token-api 已选择有效连接器和模型，或改用 Prompt Import。',
  };
}

export function useKismetController() {
  const store = useKismetStore();
  const route = useKismetRoute();
  const setSavedProfiles = useKismetStore((state) => state.setSavedProfiles);
  const setLastAiRawResponse = useKismetStore((state) => state.setLastAiRawResponse);

  useEffect(() => {
    setSavedProfiles(loadLocalShareProfiles());
  }, [setSavedProfiles]);

  const deriveBirthProfile = useCallback(() => {
    const validation = validateKismetBirthInput(store.birthInput);
    if (!validation.ok) {
      store.setError(validation.error);
      return null;
    }

    const canonicalProfile = deriveCanonicalProfile(validation.data);
    const profileValidation = KismetCanonicalProfileSchema.safeParse(canonicalProfile);
    if (!profileValidation.success) {
      store.setError(buildCanonicalProfileError(profileValidation.error.issues.map((issue) => issue.message)));
      return null;
    }

    store.setBirthInput(validation.data);
    store.setDraftProfile(profileValidation.data);
    store.setError(null);
    emitKismetLog({ message: KISMET_AUDIT.BIRTH_INPUT_DERIVED, source: 'useKismetController' });
    return {
      birthInput: validation.data,
      canonicalProfile: profileValidation.data,
    };
  }, [store]);

  const generateNatalAnalysis = useCallback(async () => {
    const derived = deriveBirthProfile();
    if (!derived) {
      return;
    }

    const birthCityLabel = derived.birthInput.birthPlaceLabel;

    store.setConfirmedProfile(derived.canonicalProfile);
    emitKismetLog({ message: KISMET_AUDIT.PROFILE_CONFIRMED, source: 'useKismetController' });

    const promptPackage = buildNatalPromptPackage({
      canonicalProfile: derived.canonicalProfile,
      birthCityLabel,
    });
    store.setGeneratedPrompt(promptPackage);
    if (route.routeOverride && !route.isUsableRouteBinding(route.routeOverride)) {
      setLastAiRawResponse(null);
      store.setRouteSource('unavailable');
      store.setError(buildRouteUnavailableError());
      return;
    }
    setLastAiRawResponse(null);
    store.setLoading(true);
    store.setError(null);
    emitKismetLog({ message: KISMET_AUDIT.NATAL_GENERATE_STARTED, source: 'useKismetController' });

    const aiClient = getKismetAiClient();
    const result = await generateJsonViaAi({
      aiClient,
      systemPrompt: promptPackage.systemPrompt,
      userPrompt: promptPackage.userPrompt,
      routeOverride: route.routeOverride || undefined,
      validate: validateNatalAiOutput,
    });

    store.setLoading(false);
    if (result.ok) {
      setLastAiRawResponse(result.rawResponse);
      store.setRouteSource(result.routeSource);
      store.setNatalResult({
        canonicalProfile: derived.canonicalProfile,
        birthCityLabel,
        analysis: result.data.analysis,
        keyNodes: result.data.keyNodes,
        chartData: interpolateKeyNodes(result.data.keyNodes, Number(derived.birthInput.birthDate.slice(0, 4))),
        recommendedCities: result.data.recommendedCities,
        citySummary: result.data.citySummary,
      });
      emitKismetLog({ message: KISMET_AUDIT.NATAL_GENERATE_SUCCEEDED, source: 'useKismetController' });
      return;
    }

    setLastAiRawResponse(result.rawResponse || null);
    if (result.error.reasonCode === KISMET_REASON.ROUTE_UNAVAILABLE) {
      emitKismetLog({
        level: 'warn',
        message: KISMET_AUDIT.FALLBACK_TO_IMPORT,
        source: 'useKismetController',
        details: {
          reasonCode: result.error.reasonCode,
          upstreamReasonCode: result.error.upstreamReasonCode,
          traceId: result.error.traceId,
        },
      });
      store.setRouteSource('unavailable');
    }
    store.setError(result.error);
    emitKismetLog({ level: 'error', message: KISMET_AUDIT.NATAL_GENERATE_FAILED, source: 'useKismetController' });
  }, [deriveBirthProfile, route.routeOverride, setLastAiRawResponse, store]);

  const generateDailyFortune = useCallback(async () => {
    const confirmedProfile = store.confirmedProfile || deriveBirthProfile()?.canonicalProfile;
    if (!confirmedProfile) {
      return;
    }

    const validation = validateKismetBirthInput(store.birthInput);
    if (!validation.ok) {
      store.setError(validation.error);
      return;
    }

    const locationContextResult = buildLocationContext({
      profile: confirmedProfile,
      birthPlaceId: validation.data.birthPlaceId,
      birthPlaceLabel: validation.data.birthPlaceLabel,
    });
    if (!locationContextResult.ok) {
      store.setError(locationContextResult.error);
      return;
    }

    const dailyDefaults = buildDailyDefaults(confirmedProfile, validation.data.timezone);
    const promptPackage = buildDailyPromptPackage({
      canonicalProfile: confirmedProfile,
      locationContext: locationContextResult.data,
      dailyDefaults,
    });
    store.setGeneratedPrompt(promptPackage);
    if (route.routeOverride && !route.isUsableRouteBinding(route.routeOverride)) {
      setLastAiRawResponse(null);
      store.setRouteSource('unavailable');
      store.setError(buildRouteUnavailableError());
      return;
    }
    setLastAiRawResponse(null);
    store.setLoading(true);
    store.setError(null);
    emitKismetLog({ message: KISMET_AUDIT.DAILY_GENERATE_STARTED, source: 'useKismetController' });

    const result = await generateJsonViaAi({
      aiClient: getKismetAiClient(),
      systemPrompt: promptPackage.systemPrompt,
      userPrompt: promptPackage.userPrompt,
      routeOverride: route.routeOverride || undefined,
      validate: validateDailyResult,
    });

    store.setLoading(false);
    if (result.ok) {
      setLastAiRawResponse(result.rawResponse);
      store.setRouteSource(result.routeSource);
      store.setDailyResult(result.data);
      emitKismetLog({ message: KISMET_AUDIT.DAILY_GENERATE_SUCCEEDED, source: 'useKismetController' });
      return;
    }

    setLastAiRawResponse(result.rawResponse || null);
    if (result.error.reasonCode === KISMET_REASON.ROUTE_UNAVAILABLE) {
      store.setRouteSource('unavailable');
    }
    store.setError(result.error);
    emitKismetLog({ level: 'error', message: KISMET_AUDIT.DAILY_GENERATE_FAILED, source: 'useKismetController' });
  }, [deriveBirthProfile, route.routeOverride, setLastAiRawResponse, store]);

  const generateCompatibility = useCallback(async () => {
    const selfProfile = store.confirmedProfile || deriveBirthProfile()?.canonicalProfile;
    if (!selfProfile) {
      return;
    }

    let targetShareProfile = store.savedProfiles.find((profile) => profile.id === store.selectedSavedProfileId) || null;
    if (!targetShareProfile) {
      const validation = validateKismetBirthInput(store.comparisonInput);
      if (!validation.ok) {
        store.setError({
          ...validation.error,
          reasonCode: KISMET_REASON.COMPATIBILITY_INPUT_INVALID,
        });
        return;
      }
      const targetCanonical = deriveCanonicalProfile(validation.data);
      targetShareProfile = createLocalShareProfile(validation.data.name || validation.data.birthPlaceLabel, targetCanonical);
    }

    const selfShareProfile = createLocalShareProfile(store.birthInput.name || store.birthInput.birthPlaceLabel || 'Self', selfProfile);
    const compatibilityInput = scoreCompatibility(selfShareProfile, targetShareProfile);
    const promptPackage = buildCompatibilityPromptPackage(compatibilityInput);
    store.setGeneratedPrompt(promptPackage);
    if (route.routeOverride && !route.isUsableRouteBinding(route.routeOverride)) {
      setLastAiRawResponse(null);
      store.setRouteSource('unavailable');
      store.setError(buildRouteUnavailableError());
      return;
    }
    setLastAiRawResponse(null);
    store.setLoading(true);
    store.setError(null);
    emitKismetLog({ message: KISMET_AUDIT.COMPATIBILITY_GENERATE_STARTED, source: 'useKismetController' });

    const result = await generateJsonViaAi({
      aiClient: getKismetAiClient(),
      systemPrompt: promptPackage.systemPrompt,
      userPrompt: promptPackage.userPrompt,
      routeOverride: route.routeOverride || undefined,
      validate: validateCompatibilityResult,
    });

    store.setLoading(false);
    if (result.ok) {
      setLastAiRawResponse(result.rawResponse);
      store.setRouteSource(result.routeSource);
      store.setCompatibilityResult(result.data);
      emitKismetLog({ message: KISMET_AUDIT.COMPATIBILITY_GENERATE_SUCCEEDED, source: 'useKismetController' });
      return;
    }

    setLastAiRawResponse(result.rawResponse || null);
    if (result.error.reasonCode === KISMET_REASON.ROUTE_UNAVAILABLE) {
      store.setRouteSource('unavailable');
    }
    store.setCompatibilityResult(buildCompatibilityFallback(compatibilityInput));
    store.setError(result.error);
    emitKismetLog({ level: 'error', message: KISMET_AUDIT.COMPATIBILITY_GENERATE_FAILED, source: 'useKismetController' });
  }, [deriveBirthProfile, route.routeOverride, setLastAiRawResponse, store]);

  const importResult = useCallback((rawText: string) => {
    if (!store.generatedPrompt) {
      return;
    }
    emitKismetLog({ message: KISMET_AUDIT.IMPORT_STARTED, source: 'useKismetController' });
    store.setLoading(true);
    const result = parseImportedResult(store.generatedPrompt.kind, rawText);
    store.setLoading(false);

    if (!result.ok) {
      store.setError(result.error);
      emitKismetLog({ level: 'error', message: KISMET_AUDIT.IMPORT_FAILED, source: 'useKismetController' });
      return;
    }

    if (store.generatedPrompt.kind === 'natal-profile') {
      const validation = validateKismetBirthInput(store.birthInput);
      const confirmedProfile = store.confirmedProfile;
      if (!validation.ok || !confirmedProfile) {
        store.setError(validation.ok ? {
          reasonCode: KISMET_REASON.CANONICAL_PROFILE_INVALID,
          message: '缺少已确认命盘，无法导入命盘分析结果。',
          actionHint: '请先重新推导并确认命盘。',
        } : validation.error);
        return;
      }
      const aiOutput = result.data as KismetNatalAiOutput;
      store.setNatalResult({
        canonicalProfile: confirmedProfile,
        birthCityLabel: validation.data.birthPlaceLabel,
        analysis: aiOutput.analysis,
        keyNodes: aiOutput.keyNodes,
        chartData: interpolateKeyNodes(aiOutput.keyNodes, Number(validation.data.birthDate.slice(0, 4))),
        recommendedCities: aiOutput.recommendedCities,
        citySummary: aiOutput.citySummary,
      });
    } else if (store.generatedPrompt.kind === 'daily-fortune') {
      store.setDailyResult(result.data as KismetDailyFortuneResult);
    } else {
      store.setCompatibilityResult(result.data as KismetCompatibilityResult);
    }
    emitKismetLog({ message: KISMET_AUDIT.IMPORT_SUCCEEDED, source: 'useKismetController' });
  }, [store]);

  const copyPrompts = useCallback(() => {
    if (!store.generatedPrompt) return;
    const text = `${store.generatedPrompt.systemPrompt}\n\n---\n\n${store.generatedPrompt.userPrompt}`;
    navigator.clipboard.writeText(text);
    emitKismetLog({ message: KISMET_AUDIT.PROMPT_COPIED, source: 'useKismetController' });
  }, [store.generatedPrompt]);

  const saveLocalProfile = useCallback(() => {
    const profileToSave = store.confirmedProfile || store.draftProfile;
    if (!profileToSave) {
      return;
    }
    if (!store.birthInput.consent?.allowLocalProfilePersist) {
      store.setError({
        reasonCode: KISMET_REASON.LOCAL_PROFILE_CONSENT_REQUIRED,
        message: '当前未授权保存本地匹配画像。',
        actionHint: '勾选”允许保存本地画像”后再保存。',
      });
      return;
    }
    const profile = createLocalShareProfile(
      store.birthInput.name || store.birthInput.birthPlaceLabel || 'Kismet Profile',
      profileToSave,
    );
    const nextProfiles = [profile, ...store.savedProfiles.filter((item) => item.displayName !== profile.displayName)];
    store.setSavedProfiles(nextProfiles);
    persistLocalShareProfiles(nextProfiles);
    emitKismetLog({ message: KISMET_AUDIT.LOCAL_PROFILE_SAVED, source: 'useKismetController' });
  }, [store]);

  const removeSavedProfile = useCallback((profileId: string) => {
    const nextProfiles = store.savedProfiles.filter((profile) => profile.id !== profileId);
    store.setSavedProfiles(nextProfiles);
    if (store.selectedSavedProfileId === profileId) {
      store.setSelectedSavedProfileId(null);
    }
    persistLocalShareProfiles(nextProfiles);
    emitKismetLog({ message: KISMET_AUDIT.LOCAL_PROFILE_REMOVED, source: 'useKismetController' });
  }, [store]);

  return {
    deriveBirthProfile,
    generateNatalAnalysis,
    generateDailyFortune,
    generateCompatibility,
    importResult,
    copyPrompts,
    saveLocalProfile,
    removeSavedProfile,
    route,
  };
}
