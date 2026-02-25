import { useTranslation } from 'react-i18next';
import type { KismetMode } from '../types.js';

type ModeSwitcherProps = {
  mode: KismetMode;
  onModeChange: (mode: KismetMode) => void;
};

export function ModeSwitcher({ mode, onModeChange }: ModeSwitcherProps) {
  const { t } = useTranslation('kismet');

  return (
    <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-1">
      {(['prompt-import', 'runtime-ai'] as KismetMode[]).map((m) => (
        <button
          key={m}
          onClick={() => onModeChange(m)}
          className={`flex-1 rounded-md px-3 py-2 text-center text-xs font-medium transition-colors ${
            mode === m
              ? 'bg-white text-indigo-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <div>{m === 'prompt-import' ? t('ModeSwitcher.promptImport') : t('ModeSwitcher.runtimeAi')}</div>
          <div className="mt-0.5 text-[10px] font-normal opacity-70">
            {m === 'prompt-import' ? t('ModeSwitcher.promptImportDesc') : t('ModeSwitcher.runtimeAiDesc')}
          </div>
        </button>
      ))}
    </div>
  );
}
