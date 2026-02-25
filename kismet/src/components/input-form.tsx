import { useTranslation } from 'react-i18next';
import { useKismetStore } from '../state/kismet-store.js';
import type { Gender } from '../types.js';

type InputFormProps = {
  onSubmit: () => void;
  disabled?: boolean;
};

export function InputForm({ onSubmit, disabled }: InputFormProps) {
  const { t } = useTranslation('kismet');
  const { input, setInput, loading } = useKismetStore();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">{t('InputForm.nameLabel')}</label>
        <input
          type="text"
          value={input.name || ''}
          onChange={(e) => setInput({ name: e.target.value })}
          placeholder={t('InputForm.namePlaceholder')}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          disabled={disabled}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">{t('InputForm.genderLabel')}</label>
        <div className="flex gap-3">
          {(['Male', 'Female'] as Gender[]).map((g) => (
            <label key={g} className="flex items-center gap-1.5 text-sm">
              <input
                type="radio"
                name="gender"
                value={g}
                checked={input.gender === g}
                onChange={() => setInput({ gender: g })}
                disabled={disabled}
                className="text-indigo-600"
              />
              {g === 'Male' ? t('InputForm.genderMale') : t('InputForm.genderFemale')}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">{t('InputForm.birthYearLabel')}</label>
        <input
          type="number"
          value={input.birthYear || ''}
          onChange={(e) => setInput({ birthYear: Number(e.target.value) })}
          placeholder={t('InputForm.birthYearPlaceholder')}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          disabled={disabled}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {(['yearPillar', 'monthPillar', 'dayPillar', 'hourPillar'] as const).map((key) => (
          <div key={key}>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              {t(`InputForm.${key}Label`)}
            </label>
            <input
              type="text"
              value={(input[key] as string) || ''}
              onChange={(e) => setInput({ [key]: e.target.value })}
              placeholder={t('InputForm.pillarPlaceholder')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              disabled={disabled}
            />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">{t('InputForm.startAgeLabel')}</label>
          <input
            type="number"
            value={input.startAge || ''}
            onChange={(e) => setInput({ startAge: Number(e.target.value) })}
            placeholder={t('InputForm.startAgePlaceholder')}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            disabled={disabled}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">{t('InputForm.firstDaYunLabel')}</label>
          <input
            type="text"
            value={input.firstDaYun || ''}
            onChange={(e) => setInput({ firstDaYun: e.target.value })}
            placeholder={t('InputForm.firstDaYunPlaceholder')}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            disabled={disabled}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={disabled || loading}
        className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? t('InputForm.analyzing') : t('InputForm.submitButton')}
      </button>
    </form>
  );
}
