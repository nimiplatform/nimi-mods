import { create } from 'zustand';
import type { RuntimeRouteBinding, RuntimeRouteOptionsSnapshot } from '@nimiplatform/sdk/mod/runtime-route';
import type {
  KismetAiRawResponse,
  GeneratedPromptPackage,
  KismetBirthInputV2,
  KismetCanonicalProfile,
  KismetCompatibilityResult,
  KismetDailyFortuneResult,
  KismetError,
  KismetFeatureTab,
  KismetLocalShareProfile,
  KismetNatalAnalysisResult,
  RouteSourceDisplay,
} from '../types.js';

type KismetStore = {
  activeTab: KismetFeatureTab;
  setActiveTab: (tab: KismetFeatureTab) => void;

  birthInput: Partial<KismetBirthInputV2>;
  setBirthInput: (input: Partial<KismetBirthInputV2>) => void;
  resetBirthInput: () => void;

  comparisonInput: Partial<KismetBirthInputV2>;
  setComparisonInput: (input: Partial<KismetBirthInputV2>) => void;
  resetComparisonInput: () => void;

  draftProfile: KismetCanonicalProfile | null;
  setDraftProfile: (profile: KismetCanonicalProfile | null) => void;
  confirmedProfile: KismetCanonicalProfile | null;
  setConfirmedProfile: (profile: KismetCanonicalProfile | null) => void;

  natalResult: KismetNatalAnalysisResult | null;
  setNatalResult: (result: KismetNatalAnalysisResult | null) => void;
  dailyResult: KismetDailyFortuneResult | null;
  setDailyResult: (result: KismetDailyFortuneResult | null) => void;
  compatibilityResult: KismetCompatibilityResult | null;
  setCompatibilityResult: (result: KismetCompatibilityResult | null) => void;

  savedProfiles: KismetLocalShareProfile[];
  setSavedProfiles: (profiles: KismetLocalShareProfile[]) => void;
  selectedSavedProfileId: string | null;
  setSelectedSavedProfileId: (profileId: string | null) => void;

  loading: boolean;
  setLoading: (loading: boolean) => void;
  error: KismetError | null;
  setError: (error: KismetError | null) => void;

  generatedPrompt: GeneratedPromptPackage | null;
  setGeneratedPrompt: (prompt: GeneratedPromptPackage | null) => void;

  lastAiRawResponse: KismetAiRawResponse | null;
  setLastAiRawResponse: (response: KismetAiRawResponse | null) => void;

  routeSource: RouteSourceDisplay;
  setRouteSource: (source: RouteSourceDisplay) => void;
  routeOverride: RuntimeRouteBinding | null;
  setRouteOverride: (override: RuntimeRouteBinding | null) => void;
  chatRouteOptions: RuntimeRouteOptionsSnapshot | null;
  setChatRouteOptions: (options: RuntimeRouteOptionsSnapshot | null | ((prev: RuntimeRouteOptionsSnapshot | null) => RuntimeRouteOptionsSnapshot | null)) => void;

  resetTransientState: () => void;
};

const initialBirthInput: Partial<KismetBirthInputV2> = {
  gender: 'male',
  timezone: 'Asia/Shanghai',
  consent: {
    allowCityAffinityUse: true,
    allowLocalProfileMatchUse: false,
    allowLocalProfilePersist: false,
  },
};

const initialState = {
  activeTab: 'natal-profile' as KismetFeatureTab,
  birthInput: initialBirthInput,
  comparisonInput: {
    gender: 'female',
    timezone: 'Asia/Shanghai',
    consent: {
      allowCityAffinityUse: false,
      allowLocalProfileMatchUse: false,
      allowLocalProfilePersist: false,
    },
  } as Partial<KismetBirthInputV2>,
  draftProfile: null as KismetCanonicalProfile | null,
  confirmedProfile: null as KismetCanonicalProfile | null,
  natalResult: null as KismetNatalAnalysisResult | null,
  dailyResult: null as KismetDailyFortuneResult | null,
  compatibilityResult: null as KismetCompatibilityResult | null,
  savedProfiles: [] as KismetLocalShareProfile[],
  selectedSavedProfileId: null as string | null,
  loading: false,
  error: null as KismetError | null,
  generatedPrompt: null as GeneratedPromptPackage | null,
  lastAiRawResponse: null as KismetAiRawResponse | null,
  routeSource: 'unavailable' as RouteSourceDisplay,
  routeOverride: null as RuntimeRouteBinding | null,
  chatRouteOptions: null as RuntimeRouteOptionsSnapshot | null,
};

export const useKismetStore = create<KismetStore>((set) => ({
  ...initialState,

  setActiveTab: (activeTab) => set({ activeTab }),
  setBirthInput: (input) => set((state) => {
    const nextConsent = {
      allowCityAffinityUse: input.consent?.allowCityAffinityUse ?? state.birthInput.consent?.allowCityAffinityUse ?? true,
      allowLocalProfileMatchUse: input.consent?.allowLocalProfileMatchUse ?? state.birthInput.consent?.allowLocalProfileMatchUse ?? false,
      allowLocalProfilePersist: input.consent?.allowLocalProfilePersist ?? state.birthInput.consent?.allowLocalProfilePersist ?? false,
    };
    return {
      birthInput: {
        ...state.birthInput,
        ...input,
        consent: nextConsent,
      },
    };
  }),
  resetBirthInput: () => set({ birthInput: initialBirthInput }),

  setComparisonInput: (input) => set((state) => {
    const nextConsent = {
      allowCityAffinityUse: input.consent?.allowCityAffinityUse ?? state.comparisonInput.consent?.allowCityAffinityUse ?? false,
      allowLocalProfileMatchUse: input.consent?.allowLocalProfileMatchUse ?? state.comparisonInput.consent?.allowLocalProfileMatchUse ?? false,
      allowLocalProfilePersist: input.consent?.allowLocalProfilePersist ?? state.comparisonInput.consent?.allowLocalProfilePersist ?? false,
    };
    return {
      comparisonInput: {
        ...state.comparisonInput,
        ...input,
        consent: nextConsent,
      },
    };
  }),
  resetComparisonInput: () => set({ comparisonInput: initialState.comparisonInput }),

  setDraftProfile: (draftProfile) => set({ draftProfile }),
  setConfirmedProfile: (confirmedProfile) => set({ confirmedProfile }),
  setNatalResult: (natalResult) => set({ natalResult, error: null }),
  setDailyResult: (dailyResult) => set({ dailyResult, error: null }),
  setCompatibilityResult: (compatibilityResult) => set({ compatibilityResult, error: null }),

  setSavedProfiles: (savedProfiles) => set({ savedProfiles }),
  setSelectedSavedProfileId: (selectedSavedProfileId) => set({ selectedSavedProfileId }),

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setGeneratedPrompt: (generatedPrompt) => set({ generatedPrompt }),
  setLastAiRawResponse: (lastAiRawResponse) => set({ lastAiRawResponse }),

  setRouteSource: (routeSource) => set({ routeSource }),
  setRouteOverride: (routeOverride) => set({ routeOverride }),
  setChatRouteOptions: (chatRouteOptions) => set((state) => ({
    chatRouteOptions: typeof chatRouteOptions === 'function'
      ? chatRouteOptions(state.chatRouteOptions)
      : chatRouteOptions,
  })),

  resetTransientState: () => set({
    draftProfile: null,
    confirmedProfile: null,
    natalResult: null,
    dailyResult: null,
    compatibilityResult: null,
    error: null,
    generatedPrompt: null,
    lastAiRawResponse: null,
  }),
}));
