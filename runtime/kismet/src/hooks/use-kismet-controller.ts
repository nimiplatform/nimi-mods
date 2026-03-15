import { useCallback, useEffect } from 'react';
import { KismetCanonicalProfileSchema } from '../schemas.js';
import { useKismetStore } from '../state/kismet-store.js';
import { useKismetRoute } from './use-kismet-route.js';
import { validateKismetBirthInput } from '../validation/validate-input.js';
import {
  buildCompatibilityPromptPackage,
  buildDailyPromptPackage,
  buildFortuneStickPromptPackage,
  buildNatalPromptPackage,
  parseImportedResult,
} from '../services/prompt-import.js';
import { generateJsonViaAi } from '../services/runtime-ai.js';
import { getKismetAiClient } from '../runtime-mod.js';
import { emitKismetLog } from '../logging.js';
import { KISMET_AUDIT, KISMET_REASON } from '../contracts.js';
import { kismetMessage } from '../i18n/messages.js';
import { deriveCanonicalProfile } from '../services/bazi/derive-profile.js';
import { buildLocationContext } from '../services/city-affinity.js';
import { interpolateKeyNodes } from '../services/interpolation.js';
import { buildDailyDefaults } from '../services/daily-context.js';
import {
  validateCompatibilityResult,
  validateDailyResult,
  validateFortuneStickResult,
  validateNatalAiOutput,
} from '../validation/validate-result.js';
import {
  clearPrimaryProfile,
  createLocalShareProfile,
  hydrateLocalShareProfilesState,
  loadCachedFortuneStick,
  loadLocalShareProfiles,
  loadPrimaryProfile,
  persistFortuneStick,
  persistLocalShareProfiles,
  persistPrimaryProfile,
} from '../services/local-share-profiles.js';
import { resolveLocalDateString } from '../services/daily-context.js';
import { buildCompatibilityFallback, scoreCompatibility } from '../services/compatibility.js';
import type {
  KismetCompatibilityResult,
  KismetDailyFortuneResult,
  KismetFortuneStickResult,
  KismetNatalAiOutput,
} from '../types.js';

function buildCanonicalProfileError(issues: string[]) {
  return {
    reasonCode: KISMET_REASON.CANONICAL_PROFILE_INVALID,
    message: kismetMessage('Messages.canonicalProfileInvalid', 'Canonical profile derivation failed: {{issues}}', {
      issues: issues.join('; '),
    }),
    actionHint: kismetMessage(
      'Messages.canonicalProfileInvalidHint',
      'Check birth date, time, and birth city, then try again.',
    ),
  };
}

function buildRouteUnavailableError(): {
  reasonCode: string;
  message: string;
  actionHint: string;
} {
  return {
    reasonCode: KISMET_REASON.ROUTE_UNAVAILABLE,
    message: kismetMessage(
      'Messages.routeUnavailable',
      'Current AI route has no valid connector/model binding. Request blocked.',
    ),
    actionHint: kismetMessage(
      'Messages.routeUnavailableHint',
      'Pick a valid cloud connector and model, or switch to Prompt Import.',
    ),
  };
}

export function useKismetController() {
  const store = useKismetStore();
  const route = useKismetRoute();
  const setSavedProfiles = useKismetStore((state) => state.setSavedProfiles);
  const setLastAiRawResponse = useKismetStore((state) => state.setLastAiRawResponse);

  useEffect(() => {
    let cancelled = false;
    void hydrateLocalShareProfilesState().then(() => {
      if (cancelled) {
        return;
      }
      setSavedProfiles(loadLocalShareProfiles());
      const primary = loadPrimaryProfile();
      if (primary) {
        store.setPrimaryProfile(primary);
        store.setConfirmedProfile(primary.canonicalProfile);
        emitKismetLog({ message: 'kismet.primary-profile.restored', source: 'useKismetController' });
      }
      const cachedStick = loadCachedFortuneStick();
      if (cachedStick) {
        const today = resolveLocalDateString('Asia/Shanghai');
        if (cachedStick.date === today) {
          store.setFortuneStickResult(cachedStick.result);
        }
      }
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (route.routeBinding && !route.isUsableRouteBinding(route.routeBinding)) {
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
      routeBinding: route.routeBinding || undefined,
      validate: validateNatalAiOutput,
    });

    store.setLoading(false);
    if (result.ok) {
      setLastAiRawResponse(result.rawResponse);
      store.setRouteSource(result.routeSource);
      const natalResult = {
        canonicalProfile: derived.canonicalProfile,
        birthCityLabel,
        analysis: result.data.analysis,
        keyNodes: result.data.keyNodes,
        chartData: interpolateKeyNodes(result.data.keyNodes, Number(derived.birthInput.birthDate.slice(0, 4))),
        recommendedCities: result.data.recommendedCities,
        citySummary: result.data.citySummary,
      };
      store.setNatalResult(natalResult);
      // Save/update primary profile with natal result
      const primary = {
        birthInput: derived.birthInput,
        canonicalProfile: derived.canonicalProfile,
        natalResult,
        savedAt: new Date().toISOString(),
      };
      if (derived.birthInput.consent.allowLocalProfilePersist) {
        void persistPrimaryProfile(primary);
      } else {
        void clearPrimaryProfile();
      }
      store.setPrimaryProfile(primary);
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
  }, [deriveBirthProfile, route.routeBinding, setLastAiRawResponse, store]);

  const generateDailyFortune = useCallback(async () => {
    const confirmedProfile = store.confirmedProfile || deriveBirthProfile()?.canonicalProfile;
    if (!confirmedProfile) {
      return;
    }

    // Use current birthInput if filled, otherwise fall back to cached primaryProfile birthInput
    const effectiveBirthInput = store.birthInput.birthDate
      ? store.birthInput
      : store.primaryProfile?.birthInput ?? store.birthInput;
    const validation = validateKismetBirthInput(effectiveBirthInput);
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
    if (route.routeBinding && !route.isUsableRouteBinding(route.routeBinding)) {
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
      routeBinding: route.routeBinding || undefined,
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
  }, [deriveBirthProfile, route.routeBinding, setLastAiRawResponse, store]);

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

    const selfShareProfile = createLocalShareProfile(
      store.birthInput.name || store.birthInput.birthPlaceLabel || kismetMessage('Messages.selfProfileFallback', 'Self'),
      selfProfile,
    );
    const compatibilityInput = scoreCompatibility(selfShareProfile, targetShareProfile);
    const promptPackage = buildCompatibilityPromptPackage(compatibilityInput);
    store.setGeneratedPrompt(promptPackage);
    if (route.routeBinding && !route.isUsableRouteBinding(route.routeBinding)) {
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
      routeBinding: route.routeBinding || undefined,
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
  }, [deriveBirthProfile, route.routeBinding, setLastAiRawResponse, store]);

  const generateFortuneStick = useCallback(async () => {
    const confirmedProfile = store.confirmedProfile;
    if (!confirmedProfile) {
      return;
    }

    // Use existing dailyResult if available, otherwise build minimal daily context
    const dailyResult: KismetDailyFortuneResult = store.dailyResult || (() => {
      const defaults = buildDailyDefaults(confirmedProfile, 'Asia/Shanghai');
      return {
        ...defaults,
        summary: '',
        recommendedActions: [],
        avoidActions: [],
      } as KismetDailyFortuneResult;
    })();

    const promptPackage = buildFortuneStickPromptPackage({
      canonicalProfile: confirmedProfile,
      dailyResult,
    });
    store.setGeneratedPrompt(promptPackage);
    if (route.routeBinding && !route.isUsableRouteBinding(route.routeBinding)) {
      setLastAiRawResponse(null);
      store.setRouteSource('unavailable');
      store.setError(buildRouteUnavailableError());
      return;
    }
    setLastAiRawResponse(null);
    store.setLoading(true);
    store.setError(null);
    emitKismetLog({ message: KISMET_AUDIT.FORTUNE_STICK_GENERATE_STARTED, source: 'useKismetController' });

    const result = await generateJsonViaAi({
      aiClient: getKismetAiClient(),
      systemPrompt: promptPackage.systemPrompt,
      userPrompt: promptPackage.userPrompt,
      routeBinding: route.routeBinding || undefined,
      validate: validateFortuneStickResult,
    });

    store.setLoading(false);
    if (result.ok) {
      setLastAiRawResponse(result.rawResponse);
      store.setRouteSource(result.routeSource);
      store.setFortuneStickResult(result.data);
      void persistFortuneStick({
        result: result.data,
        date: dailyResult.date || resolveLocalDateString('Asia/Shanghai'),
        savedAt: new Date().toISOString(),
      });
      emitKismetLog({ message: KISMET_AUDIT.FORTUNE_STICK_GENERATE_SUCCEEDED, source: 'useKismetController' });
      return;
    }

    setLastAiRawResponse(result.rawResponse || null);
    if (result.error.reasonCode === KISMET_REASON.ROUTE_UNAVAILABLE) {
      store.setRouteSource('unavailable');
    }
    store.setError(result.error);
    emitKismetLog({ level: 'error', message: KISMET_AUDIT.FORTUNE_STICK_GENERATE_FAILED, source: 'useKismetController' });
  }, [route.routeBinding, setLastAiRawResponse, store]);

  const shareContent = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      store.setShareMessage(text);
      setTimeout(() => store.setShareMessage(null), 3000);
      emitKismetLog({ message: KISMET_AUDIT.SHARE_COPIED, source: 'useKismetController' });
    });
    window.dispatchEvent(new CustomEvent('nimi:share-content', {
      detail: { source: 'kismet', text },
    }));
  }, [store]);

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
          message: kismetMessage(
            'Messages.importMissingProfile',
            'No confirmed natal profile is available, so the natal result cannot be imported.',
          ),
          actionHint: kismetMessage(
            'Messages.importMissingProfileHint',
            'Re-derive and confirm the natal profile first.',
          ),
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
    } else if (store.generatedPrompt.kind === 'fortune-stick') {
      store.setFortuneStickResult(result.data as KismetFortuneStickResult);
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

  const savePrimaryProfile = useCallback(() => {
    const profileToSave = store.confirmedProfile || store.draftProfile;
    if (!profileToSave) {
      return;
    }
    const validation = validateKismetBirthInput(store.birthInput);
    if (!validation.ok) {
      store.setError(validation.error);
      return;
    }
    const primary = {
      birthInput: validation.data,
      canonicalProfile: profileToSave,
      savedAt: new Date().toISOString(),
    };
    if (validation.data.consent.allowLocalProfilePersist) {
      void persistPrimaryProfile(primary);
    } else {
      void clearPrimaryProfile();
    }
    store.setPrimaryProfile(primary);
    store.setConfirmedProfile(profileToSave);
    emitKismetLog({ message: KISMET_AUDIT.LOCAL_PROFILE_SAVED, source: 'useKismetController' });
  }, [store]);

  const saveLocalProfile = useCallback(() => {
    const profileToSave = store.confirmedProfile || store.draftProfile;
    if (!profileToSave) {
      return;
    }
    // Save as primary profile
    savePrimaryProfile();
    // Also save to compatibility profiles list
    if (store.birthInput.consent?.allowLocalProfilePersist && store.birthInput.consent?.allowLocalProfileMatchUse) {
      const profile = createLocalShareProfile(
        store.birthInput.name || store.birthInput.birthPlaceLabel || kismetMessage('Messages.savedProfileFallback', 'Kismet Profile'),
        profileToSave,
      );
      const nextProfiles = [profile, ...store.savedProfiles.filter((item) => item.displayName !== profile.displayName)];
      store.setSavedProfiles(nextProfiles);
      void persistLocalShareProfiles(nextProfiles);
    }
  }, [savePrimaryProfile, store]);

  const removeSavedProfile = useCallback((profileId: string) => {
    const nextProfiles = store.savedProfiles.filter((profile) => profile.id !== profileId);
    store.setSavedProfiles(nextProfiles);
    if (store.selectedSavedProfileId === profileId) {
      store.setSelectedSavedProfileId(null);
    }
    void persistLocalShareProfiles(nextProfiles);
    emitKismetLog({ message: KISMET_AUDIT.LOCAL_PROFILE_REMOVED, source: 'useKismetController' });
  }, [store]);

  return {
    deriveBirthProfile,
    generateNatalAnalysis,
    generateDailyFortune,
    generateFortuneStick,
    generateCompatibility,
    shareContent,
    importResult,
    copyPrompts,
    savePrimaryProfile,
    saveLocalProfile,
    removeSavedProfile,
    route,
  };
}
