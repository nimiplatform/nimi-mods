import React from 'react';

export type ProcessingStep =
    | 'idle'
    | 'decoding'
    | 'loading-model'
    | 'detecting'
    | 'quantizing'
    | 'rendering'
    | 'complete'
    | 'error';

export interface ProcessingState {
    step: ProcessingStep;
    progress: number; // 0-100
    message: string;
    error?: string;
}

export interface ProgressBarProps {
    state: ProcessingState;
}

const STEP_ORDER: ProcessingStep[] = [
    'decoding',
    'loading-model',
    'detecting',
    'quantizing',
    'rendering',
    'complete',
];

export function ProgressBar({ state }: ProgressBarProps) {
    if (state.step === 'idle') return null;

    const isError = state.step === 'error';
    const isComplete = state.step === 'complete';
    const stepIndex = STEP_ORDER.indexOf(state.step);
    const totalSteps = STEP_ORDER.length - 1; // exclude 'complete' from counting
    const overallProgress = isComplete
        ? 100
        : isError
          ? 0
          : Math.round(((stepIndex + state.progress / 100) / totalSteps) * 100);

    return (
        <div className="w-full rounded-xl border border-gray-200 bg-white p-3">
            <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-medium text-gray-700">{state.message}</span>
                <span className="text-xs tabular-nums text-gray-400">{overallProgress}%</span>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                    className={[
                        'h-full rounded-full transition-all duration-300',
                        isError
                            ? 'bg-red-500'
                            : isComplete
                              ? 'bg-green-500'
                              : 'bg-blue-500',
                    ].join(' ')}
                    style={{ width: `${Math.max(overallProgress, 2)}%` }}
                />
            </div>

            {isError && state.error && (
                <p className="mt-1.5 text-xs text-red-600">{state.error}</p>
            )}

            {!isError && !isComplete && (
                <div className="mt-2 flex gap-1">
                    {STEP_ORDER.slice(0, -1).map((s, i) => (
                        <div
                            key={s}
                            className={[
                                'h-1 flex-1 rounded-full',
                                i < stepIndex
                                    ? 'bg-blue-500'
                                    : i === stepIndex
                                      ? 'bg-blue-300'
                                      : 'bg-gray-200',
                            ].join(' ')}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
