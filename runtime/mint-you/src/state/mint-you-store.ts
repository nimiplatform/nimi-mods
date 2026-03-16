import { create } from 'zustand';
import type { MintYouPipelineStep, DnaPrimaryType, DnaSecondaryTrait, RelationshipMode, FormalityValue, SentimentValue, MbtiValue, } from '../contracts.js';
import type { BasicInfo, TraitExtractionResult, DnaSynthesisOutput, InterviewMessage, InterviewTurnSignal, InterviewStatus, MintYouError, SocialProfile, MintYouInterviewLanguage, } from '../types.js';
import { type RuntimeRouteBinding } from "@nimiplatform/sdk/mod";
type TraitOverrides = {
    dnaPrimary?: DnaPrimaryType;
    dnaSecondary?: DnaSecondaryTrait[];
    relationshipMode?: RelationshipMode;
    formality?: FormalityValue;
    sentiment?: SentimentValue;
} | null;
type MintYouStore = {
    // Session
    sessionId: string | null;
    currentStep: MintYouPipelineStep;
    // Step data
    basicInfo: BasicInfo | null;
    selectedInterests: string[];
    selfReportedMbti: MbtiValue | null;
    currentFocus: string;
    // Interview state
    interviewMessages: InterviewMessage[];
    interviewSignals: InterviewTurnSignal[];
    interviewTurnCount: number;
    interviewValidTurnCount: number;
    interviewLanguage: MintYouInterviewLanguage | null;
    interviewStatus: InterviewStatus;
    memoryDigest: string;
    currentRequestId: string | null;
    // Pipeline results
    traitResult: TraitExtractionResult | null;
    dnaSynthesis: DnaSynthesisOutput | null;
    // Preview overrides
    traitOverrides: TraitOverrides;
    referenceImageUrl: string | null;
    // Confirmation
    worldId: string | null;
    confirmed: boolean;
    createdAgentId: string | null;
    // UI state
    loading: boolean;
    error: MintYouError | null;
    routeBinding: RuntimeRouteBinding | null;
    sessionPersistWarning: string | null;
    // Actions
    setSessionId: (id: string) => void;
    goToStep: (step: MintYouPipelineStep) => void;
    goNext: () => void;
    goBack: () => void;
    setBasicInfo: (info: BasicInfo) => void;
    setSelectedInterests: (interests: string[]) => void;
    applySocialProfile: (profile: SocialProfile) => void;
    addInterviewMessage: (message: InterviewMessage) => void;
    addInterviewSignals: (signals: InterviewTurnSignal[]) => void;
    setInterviewTurnCount: (count: number) => void;
    setInterviewValidTurnCount: (count: number) => void;
    setInterviewLanguage: (language: MintYouInterviewLanguage | null) => void;
    setInterviewStatus: (status: InterviewStatus) => void;
    setMemoryDigest: (digest: string) => void;
    setCurrentRequestId: (id: string | null) => void;
    setTraitResult: (result: TraitExtractionResult) => void;
    setDnaSynthesis: (output: DnaSynthesisOutput) => void;
    setTraitOverrides: (overrides: TraitOverrides) => void;
    setReferenceImageUrl: (url: string | null) => void;
    setWorldId: (id: string | null) => void;
    setConfirmed: (confirmed: boolean) => void;
    setCreatedAgentId: (id: string | null) => void;
    setLoading: (loading: boolean) => void;
    setError: (error: MintYouError | null) => void;
    setRouteBinding: (routeBinding: RuntimeRouteBinding | null) => void;
    setSessionPersistWarning: (warning: string | null) => void;
    reset: () => void;
    startNewSession: (sessionId: string) => void;
};
const STEP_ORDER: readonly MintYouPipelineStep[] = [
    'basic-info',
    'interest-tags',
    'interview',
    'trait-extract',
    'dna-synthesize',
    'preview-card',
    'user-confirm',
    'agent-create',
];
function getStepIndex(step: MintYouPipelineStep): number {
    return STEP_ORDER.indexOf(step);
}
const INITIAL_STATE = {
    sessionId: null as string | null,
    currentStep: 'basic-info' as MintYouPipelineStep,
    basicInfo: null as BasicInfo | null,
    selectedInterests: [] as string[],
    selfReportedMbti: null as MbtiValue | null,
    currentFocus: '',
    interviewMessages: [] as InterviewMessage[],
    interviewSignals: [] as InterviewTurnSignal[],
    interviewTurnCount: 0,
    interviewValidTurnCount: 0,
    interviewLanguage: null as MintYouInterviewLanguage | null,
    interviewStatus: 'idle' as InterviewStatus,
    memoryDigest: '',
    currentRequestId: null as string | null,
    traitResult: null as TraitExtractionResult | null,
    dnaSynthesis: null as DnaSynthesisOutput | null,
    traitOverrides: null as TraitOverrides,
    referenceImageUrl: null as string | null,
    worldId: null as string | null,
    confirmed: false,
    createdAgentId: null as string | null,
    loading: false,
    error: null as MintYouError | null,
    routeBinding: null as RuntimeRouteBinding | null,
    sessionPersistWarning: null as string | null,
};
export const useMintYouStore = create<MintYouStore>((set) => ({
    ...INITIAL_STATE,
    setSessionId: (id) => set({ sessionId: id }),
    goToStep: (step) => set({ currentStep: step, error: null }),
    goNext: () => set((state) => {
        const idx = getStepIndex(state.currentStep);
        if (idx < STEP_ORDER.length - 1) {
            return { currentStep: STEP_ORDER[idx + 1], error: null };
        }
        return {};
    }),
    goBack: () => set((state) => {
        const idx = getStepIndex(state.currentStep);
        if (idx > 0) {
            return { currentStep: STEP_ORDER[idx - 1], error: null };
        }
        return {};
    }),
    setBasicInfo: (info) => set({ basicInfo: info }),
    setSelectedInterests: (interests) => set({ selectedInterests: interests }),
    applySocialProfile: (profile) => set({
        selectedInterests: profile.selectedInterests,
        selfReportedMbti: profile.selfReportedMbti,
        currentFocus: profile.currentFocus,
    }),
    addInterviewMessage: (message) => set((state) => ({
        interviewMessages: [...state.interviewMessages, message],
    })),
    addInterviewSignals: (signals) => set((state) => ({
        interviewSignals: [...state.interviewSignals, ...signals],
    })),
    setInterviewTurnCount: (count) => set({ interviewTurnCount: count }),
    setInterviewValidTurnCount: (count) => set({ interviewValidTurnCount: count }),
    setInterviewLanguage: (language) => set({ interviewLanguage: language }),
    setInterviewStatus: (status) => set({ interviewStatus: status }),
    setMemoryDigest: (digest) => set({ memoryDigest: digest }),
    setCurrentRequestId: (id) => set({ currentRequestId: id }),
    setTraitResult: (result) => set({ traitResult: result }),
    setDnaSynthesis: (output) => set({ dnaSynthesis: output }),
    setTraitOverrides: (overrides) => set({ traitOverrides: overrides }),
    setReferenceImageUrl: (url) => set({ referenceImageUrl: url }),
    setWorldId: (id) => set({ worldId: id }),
    setConfirmed: (confirmed) => set({ confirmed }),
    setCreatedAgentId: (id) => set({ createdAgentId: id }),
    setLoading: (loading) => set({ loading }),
    setError: (error) => set({ error }),
    setRouteBinding: (routeBinding) => set({ routeBinding }),
    setSessionPersistWarning: (warning) => set({ sessionPersistWarning: warning }),
    reset: () => set({ ...INITIAL_STATE }),
    startNewSession: (sessionId) => set({
        ...INITIAL_STATE,
        sessionId,
    }),
}));
