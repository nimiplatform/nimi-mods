import { useTranslation } from 'react-i18next';
import type { KismetBirthInputV2 } from '../types.js';
import { normalizeDateValue, normalizeTimeValue } from '../utils/normalize-birth-fields.js';

type InputFormProps = {
  title: string;
  value: Partial<KismetBirthInputV2>;
  onChange: (input: Partial<KismetBirthInputV2>) => void;
  onSubmit: () => void;
  submitLabel: string;
  disabled?: boolean;
  showConsent?: boolean;
};

export function InputForm({
  title,
  value,
  onChange,
  onSubmit,
  submitLabel,
  disabled,
  showConsent = true,
}: InputFormProps) {
  const { t } = useTranslation('kismet');

  function updateConsent<K extends keyof NonNullable<KismetBirthInputV2['consent']>>(key: K, checked: boolean) {
    onChange({
      consent: {
        allowCityAffinityUse: value.consent?.allowCityAffinityUse ?? true,
        allowLocalProfileMatchUse: value.consent?.allowLocalProfileMatchUse ?? false,
        allowLocalProfilePersist: value.consent?.allowLocalProfilePersist ?? false,
        [key]: checked,
      },
    });
  }

  return (
    <div>
      <div className="mb-5">
        <h3 className="ks-serif text-sm" style={{ color: '#8A7254', fontWeight: 600, letterSpacing: 1 }}>{title}</h3>
        <p className="mt-1 text-xs" style={{ color: '#8C857B' }}>{t('InputForm.subtitle')}</p>
      </div>

      <div className="space-y-5">
        <div>
          <label className="mb-2 block text-xs" style={{ color: '#8C857B', letterSpacing: 1 }}>{t('InputForm.nameLabel')}</label>
          <input
            type="text"
            value={value.name || ''}
            onChange={(e) => onChange({ name: e.target.value })}
            className="ks-input"
            placeholder={t('InputForm.namePlaceholder')}
            disabled={disabled}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-2 block text-xs" style={{ color: '#8C857B', letterSpacing: 1 }}>{t('InputForm.genderLabel')}</label>
            <select
              value={value.gender || 'male'}
              onChange={(e) => onChange({ gender: e.target.value as KismetBirthInputV2['gender'] })}
              className="ks-input"
              style={{ appearance: 'none' }}
              disabled={disabled}
            >
              <option value="male" style={{ background: '#181615' }}>{t('InputForm.genderMale')}</option>
              <option value="female" style={{ background: '#181615' }}>{t('InputForm.genderFemale')}</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-xs" style={{ color: '#8C857B', letterSpacing: 1 }}>{t('InputForm.timezoneLabel')}</label>
            <input
              type="text"
              value={value.timezone || 'Asia/Shanghai'}
              onChange={(e) => onChange({ timezone: e.target.value })}
              className="ks-input"
              placeholder="Asia/Shanghai"
              disabled={disabled}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-2 block text-xs" style={{ color: '#8C857B', letterSpacing: 1 }}>{t('InputForm.birthDateLabel')}</label>
            <input
              type="text"
              value={value.birthDate || ''}
              onChange={(e) => onChange({ birthDate: e.target.value })}
              onBlur={(e) => onChange({ birthDate: normalizeDateValue(e.target.value) })}
              className="ks-input"
              placeholder="1995-03-09"
              inputMode="numeric"
              disabled={disabled}
            />
          </div>
          <div>
            <label className="mb-2 block text-xs" style={{ color: '#8C857B', letterSpacing: 1 }}>{t('InputForm.birthTimeLabel')}</label>
            <input
              type="text"
              value={value.birthTime || ''}
              onChange={(e) => onChange({ birthTime: e.target.value })}
              onBlur={(e) => onChange({ birthTime: normalizeTimeValue(e.target.value) })}
              className="ks-input"
              placeholder="16:30"
              inputMode="numeric"
              disabled={disabled}
            />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-xs" style={{ color: '#8C857B', letterSpacing: 1 }}>{t('InputForm.birthPlaceLabel')}</label>
          <input
            type="text"
            value={value.birthPlaceLabel || ''}
            onChange={(e) => onChange({ birthPlaceLabel: e.target.value })}
            className="ks-input"
            placeholder={t('InputForm.birthPlacePlaceholder')}
            disabled={disabled}
          />
        </div>

        {showConsent && (
          <div style={{ background: 'rgba(138,114,84,0.05)', border: '1px solid rgba(138,114,84,0.2)', padding: 15 }}>
            <div className="ks-serif mb-3 text-xs" style={{ color: '#8A7254' }}>{t('InputForm.consentTitle')}</div>
            <div className="space-y-2.5 text-xs" style={{ color: '#8C857B' }}>
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={value.consent?.allowCityAffinityUse ?? true}
                  onChange={(e) => updateConsent('allowCityAffinityUse', e.target.checked)}
                  disabled={disabled}
                  className="mt-0.5"
                  style={{ accentColor: '#A6382E' }}
                />
                <span>{t('InputForm.allowCityAffinityUse')}</span>
              </label>
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={value.consent?.allowLocalProfilePersist ?? false}
                  onChange={(e) => updateConsent('allowLocalProfilePersist', e.target.checked)}
                  disabled={disabled}
                  className="mt-0.5"
                  style={{ accentColor: '#A6382E' }}
                />
                <span>{t('InputForm.allowLocalProfilePersist')}</span>
              </label>
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={value.consent?.allowLocalProfileMatchUse ?? false}
                  onChange={(e) => updateConsent('allowLocalProfileMatchUse', e.target.checked)}
                  disabled={disabled}
                  className="mt-0.5"
                  style={{ accentColor: '#A6382E' }}
                />
                <span>{t('InputForm.allowLocalProfileMatchUse')}</span>
              </label>
            </div>
          </div>
        )}

        <button type="button" onClick={onSubmit} disabled={disabled} className="ks-btn-seal">
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
