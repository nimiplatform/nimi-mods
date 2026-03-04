import React, { useState } from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import { useMintYouStore } from '../state/mint-you-store.js';
import { SCENARIO_BANK } from '../data/scenario-bank.js';

export function StepScenarios() {
  const { t } = useModTranslation('mint-you');
  const store = useMintYouStore();
  const [currentIdx, setCurrentIdx] = useState(0);
  const choices = store.scenarioChoices;

  const scenario = SCENARIO_BANK[currentIdx];
  const totalScenarios = SCENARIO_BANK.length;
  const answeredCount = Object.keys(choices).length;
  const allAnswered = answeredCount >= totalScenarios;

  if (!scenario) return null;

  const selectedChoice = choices[scenario.id] ?? null;

  const handleChoice = (choiceId: string) => {
    store.setScenarioChoice(scenario.id, choiceId);
    // Auto-advance to next unanswered scenario
    if (currentIdx < totalScenarios - 1) {
      setTimeout(() => setCurrentIdx(currentIdx + 1), 300);
    }
  };

  const handleNext = () => {
    if (allAnswered) {
      store.goNext();
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">{t('Scenarios.title')}</h2>
        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
          {answeredCount}/{totalScenarios}
        </span>
      </div>

      {/* Scenario navigation dots */}
      <div className="flex gap-1.5">
        {SCENARIO_BANK.map((s, idx) => {
          const isAnswered = !!choices[s.id];
          const isCurrent = idx === currentIdx;
          return (
            <button
              key={s.id}
              onClick={() => setCurrentIdx(idx)}
              className={`h-2 flex-1 rounded-full transition-colors ${
                isCurrent
                  ? 'bg-[#4ECCA3]'
                  : isAnswered
                    ? 'bg-[#4ECCA3]/40'
                    : 'bg-gray-200'
              }`}
            />
          );
        })}
      </div>

      {/* Scenario card */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-xs font-medium text-gray-400">{scenario.id}</p>
        <p className="mt-2 text-sm italic leading-relaxed text-gray-700">
          {scenario.narrative}
        </p>
      </div>

      {/* Choices */}
      <div className="space-y-2">
        {scenario.choices.map((choice) => (
          <button
            key={choice.id}
            onClick={() => handleChoice(choice.id)}
            className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${
              selectedChoice === choice.id
                ? 'border-[#4ECCA3] bg-[#4ECCA3]/10 text-gray-900'
                : 'border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {choice.label}
          </button>
        ))}
      </div>

      {/* Navigation */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={() => {
            if (currentIdx > 0) {
              setCurrentIdx(currentIdx - 1);
            } else {
              store.goBack();
            }
          }}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          {currentIdx > 0 ? t('Scenarios.prevScenario') : t('Common.back')}
        </button>

        {currentIdx < totalScenarios - 1 ? (
          <button
            onClick={() => setCurrentIdx(currentIdx + 1)}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            {t('Scenarios.nextScenario')}
          </button>
        ) : (
          <button
            onClick={handleNext}
            disabled={!allAnswered}
            className="flex-1 rounded-lg bg-[#4ECCA3] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#3DBB92] disabled:opacity-50"
          >
            {t('Scenarios.finish')}
          </button>
        )}
      </div>
    </div>
  );
}
