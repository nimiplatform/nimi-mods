// ---------------------------------------------------------------------------
// Step navigation logic
// ---------------------------------------------------------------------------

import { useCallback, useMemo } from 'react';
import type { AudioBookStep } from './use-audio-book-ui-state.js';
import type { ProjectState } from '../types.js';

const STEPS: AudioBookStep[] = ['import', 'analyze', 'cast', 'synth', 'play'];

/** Minimum project state required to enter each step */
const STEP_MIN_STATE: Record<AudioBookStep, ProjectState[]> = {
  import: ['draft', 'imported', 'analyzing', 'analyzed', 'casting', 'cast_complete', 'synthesizing', 'done', 'done_with_errors', 'cancelled', 'paused'],
  analyze: ['imported', 'analyzing', 'analyzed', 'casting', 'cast_complete', 'synthesizing', 'done', 'done_with_errors', 'cancelled', 'paused'],
  cast: ['analyzed', 'casting', 'cast_complete', 'synthesizing', 'done', 'done_with_errors', 'cancelled', 'paused'],
  synth: ['cast_complete', 'synthesizing', 'done', 'done_with_errors', 'cancelled', 'paused'],
  play: ['done', 'done_with_errors'],
};

export function useStepNavigation(input: {
  currentStep: AudioBookStep;
  setCurrentStep: (step: AudioBookStep) => void;
  projectState: ProjectState | null;
  onConfirmBacktrack?: (targetStep: AudioBookStep, callback: () => void) => void;
}) {
  const { currentStep, setCurrentStep, projectState, onConfirmBacktrack } = input;

  const currentIndex = STEPS.indexOf(currentStep);

  const canEnterStep = useCallback(
    (step: AudioBookStep): boolean => {
      if (!projectState) return step === 'import';
      return STEP_MIN_STATE[step].includes(projectState);
    },
    [projectState],
  );

  const canAdvance = useMemo(() => {
    if (currentIndex >= STEPS.length - 1) return false;
    const next = STEPS[currentIndex + 1]!;
    return canEnterStep(next);
  }, [currentIndex, canEnterStep]);

  const canRetreat = currentIndex > 0;

  const goToStep = useCallback(
    (target: AudioBookStep) => {
      if (!canEnterStep(target)) return;
      const targetIndex = STEPS.indexOf(target);

      // Going backward from cast/synth/play to an earlier step might need confirmation
      if (targetIndex < currentIndex && currentIndex >= 2 && onConfirmBacktrack) {
        onConfirmBacktrack(target, () => setCurrentStep(target));
      } else {
        setCurrentStep(target);
      }
    },
    [canEnterStep, currentIndex, setCurrentStep, onConfirmBacktrack],
  );

  const goNext = useCallback(() => {
    if (!canAdvance) return;
    setCurrentStep(STEPS[currentIndex + 1]!);
  }, [canAdvance, currentIndex, setCurrentStep]);

  const goPrev = useCallback(() => {
    if (!canRetreat) return;
    goToStep(STEPS[currentIndex - 1]!);
  }, [canRetreat, currentIndex, goToStep]);

  return {
    steps: STEPS,
    currentStep,
    currentIndex,
    canAdvance,
    canRetreat,
    canEnterStep,
    goToStep,
    goNext,
    goPrev,
  };
}
