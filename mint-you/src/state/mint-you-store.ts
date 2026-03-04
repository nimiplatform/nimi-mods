import { create } from 'zustand';
import type { MintYouPipelineStep, DnaPrimaryType, DnaSecondaryTrait } from '../contracts.js';
import type {
  BasicInfo,
  TraitExtractionResult,
  DnaSynthesisOutput,
  MintYouError,
} from '../types.js';

type MintYouStore = {
  // Session
  sessionId: string | null;
  currentStep: MintYouPipelineStep;

  // Step data
  basicInfo: BasicInfo | null;
  selectedInterests: string[];
  scenarioChoices: Record<string, string>;

  // Pipeline results
  traitResult: TraitExtractionResult | null;
  dnaSynthesis: DnaSynthesisOutput | null;

  // Preview overrides
  traitOverrides: {
    dnaPrimary?: DnaPrimaryType;
    dnaSecondary?: DnaSecondaryTrait[];
  } | null;
  referenceImageUrl: string | null;

  // Confirmation
  worldId: string | null;
  confirmed: boolean;
  createdAgentId: string | null;

  // UI state
  loading: boolean;
  error: MintYouError | null;

  // Actions
  setSessionId: (id: string) => void;
  goToStep: (step: MintYouPipelineStep) => void;
  goNext: () => void;
  goBack: () => void;
  setBasicInfo: (info: BasicInfo) => void;
  setSelectedInterests: (interests: string[]) => void;
  setScenarioChoice: (scenarioId: string, choiceId: string) => void;
  setTraitResult: (result: TraitExtractionResult) => void;
  setDnaSynthesis: (output: DnaSynthesisOutput) => void;
  setTraitOverrides: (overrides: { dnaPrimary?: DnaPrimaryType; dnaSecondary?: DnaSecondaryTrait[] } | null) => void;
  setReferenceImageUrl: (url: string | null) => void;
  setWorldId: (id: string | null) => void;
  setConfirmed: (confirmed: boolean) => void;
  setCreatedAgentId: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: MintYouError | null) => void;
  reset: () => void;
  startNewSession: (sessionId: string) => void;
};

const STEP_ORDER: readonly MintYouPipelineStep[] = [
  'basic-info',
  'interest-tags',
  'scenarios',
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
  scenarioChoices: {} as Record<string, string>,
  traitResult: null as TraitExtractionResult | null,
  dnaSynthesis: null as DnaSynthesisOutput | null,
  traitOverrides: null as { dnaPrimary?: DnaPrimaryType; dnaSecondary?: DnaSecondaryTrait[] } | null,
  referenceImageUrl: null as string | null,
  worldId: null as string | null,
  confirmed: false,
  createdAgentId: null as string | null,
  loading: false,
  error: null as MintYouError | null,
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
  setScenarioChoice: (scenarioId, choiceId) => set((state) => ({
    scenarioChoices: { ...state.scenarioChoices, [scenarioId]: choiceId },
  })),
  setTraitResult: (result) => set({ traitResult: result }),
  setDnaSynthesis: (output) => set({ dnaSynthesis: output }),
  setTraitOverrides: (overrides) => set({ traitOverrides: overrides }),
  setReferenceImageUrl: (url) => set({ referenceImageUrl: url }),
  setWorldId: (id) => set({ worldId: id }),
  setConfirmed: (confirmed) => set({ confirmed }),
  setCreatedAgentId: (id) => set({ createdAgentId: id }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  reset: () => set({ ...INITIAL_STATE }),

  startNewSession: (sessionId) => set({
    ...INITIAL_STATE,
    sessionId,
  }),
}));
