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
  segmentsCount?: number;
  castingsCount?: number;
  onConfirmBacktrack?: (targetStep: AudioBookStep, callback: () => void) => void;
}) {
  const {
    currentStep,
    setCurrentStep,
    projectState,
    segmentsCount = 0,
    castingsCount = 0,
    onConfirmBacktrack,
  } = input;

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
    if (currentStep === 'cast' && next === 'synth') {
      return canEnterStep(next) && segmentsCount > 0 && castingsCount > 0;
    }
    return canEnterStep(next);
  }, [currentIndex, currentStep, canEnterStep, segmentsCount, castingsCount]);

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
    const next = STEPS[currentIndex + 1];
    if (!next) return;
    if (!canAdvance) {
      console.info('[audio-book:flow]', 'nav:next:blocked', {
        currentStep,
        targetStep: next,
        projectState: projectState || '(none)',
        segmentsCount,
        castingsCount,
        ...(currentStep === 'cast' && next === 'synth' && segmentsCount === 0
          ? { reason: 'segments-empty' }
          : {}),
        ...(currentStep === 'cast' && next === 'synth' && segmentsCount > 0 && castingsCount === 0
          ? { reason: 'castings-empty' }
          : {}),
      });
      return;
    }
    console.info('[audio-book:flow]', 'nav:next', {
      currentStep,
      targetStep: next,
      projectState: projectState || '(none)',
      segmentsCount,
      castingsCount,
    });
    setCurrentStep(next);
  }, [canAdvance, castingsCount, currentIndex, currentStep, projectState, segmentsCount, setCurrentStep]);

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
