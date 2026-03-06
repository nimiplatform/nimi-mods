import { create } from 'zustand';
import type { RuntimeRouteBinding, RuntimeRouteOptionsSnapshot } from '@nimiplatform/sdk/mod/runtime-route';
import type { KismetInput, KismetResult, KismetError, KismetMode, RouteSourceDisplay } from '../types.js';

type KismetStore = {
  // Input
  input: Partial<KismetInput>;
  setInput: (input: Partial<KismetInput>) => void;
  resetInput: () => void;

  // Mode
  mode: KismetMode;
  setMode: (mode: KismetMode) => void;

  // Loading
  loading: boolean;
  setLoading: (loading: boolean) => void;

  // Result
  result: KismetResult | null;
  setResult: (result: KismetResult | null) => void;

  // Error
  error: KismetError | null;
  setError: (error: KismetError | null) => void;

  // Prompts (for prompt-import fallback)
  generatedPrompts: { systemPrompt: string; userPrompt: string } | null;
  setGeneratedPrompts: (prompts: { systemPrompt: string; userPrompt: string } | null) => void;

  // Route
  routeSource: RouteSourceDisplay;
  setRouteSource: (source: RouteSourceDisplay) => void;
  routeBinding: RuntimeRouteBinding | null;
  setRouteBinding: (binding: RuntimeRouteBinding | null) => void;
  chatRouteOptions: RuntimeRouteOptionsSnapshot | null;
  setChatRouteOptions: (options: RuntimeRouteOptionsSnapshot | null) => void;

  // Reset all
  reset: () => void;
};

const initialState = {
  input: {} as Partial<KismetInput>,
  mode: 'runtime-ai' as KismetMode,
  loading: false,
  result: null as KismetResult | null,
  error: null as KismetError | null,
  generatedPrompts: null as { systemPrompt: string; userPrompt: string } | null,
  routeSource: 'unavailable' as RouteSourceDisplay,
  routeBinding: null as RuntimeRouteBinding | null,
  chatRouteOptions: null as RuntimeRouteOptionsSnapshot | null,
};

export const useKismetStore = create<KismetStore>((set) => ({
  ...initialState,

  setInput: (input) => set((state) => ({
    input: { ...state.input, ...input },
  })),
  resetInput: () => set({ input: {} }),

  setMode: (mode) => set({ mode }),
  setLoading: (loading) => set({ loading }),
  setResult: (result) => set({ result, error: null }),
  setError: (error) => set({ error, result: null }),
  setGeneratedPrompts: (generatedPrompts) => set({ generatedPrompts }),
  setRouteSource: (routeSource) => set({ routeSource }),
  setRouteBinding: (routeBinding) => set({ routeBinding }),
  setChatRouteOptions: (chatRouteOptions) => set({ chatRouteOptions }),

  reset: () => set(initialState),
}));
