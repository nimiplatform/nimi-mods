import React, { useState } from 'react';
import { BasicInfoSchema } from '../schemas.js';
import { useMintYouStore } from '../state/mint-you-store.js';
import type { Gender, AgeRange, SocialIntent } from '../types.js';
import { useModTranslation } from "@nimiplatform/sdk/mod";
const GENDER_OPTIONS: {
    value: Gender;
    icon: string;
}[] = [
    { value: 'MALE', icon: '\u2642' },
    { value: 'FEMALE', icon: '\u2640' },
    { value: 'NONBINARY', icon: '\u26A7' },
    { value: 'PREFER_NOT_SAY', icon: '\u2014' },
];
const AGE_OPTIONS: AgeRange[] = ['18-24', '25-30', '31-40', '40+'];
const INTENT_OPTIONS: {
    value: SocialIntent;
    emoji: string;
    descKey: string;
}[] = [
    { value: 'dating', emoji: '\u2764\uFE0F', descKey: 'BasicInfo.intentDating' },
    { value: 'friendship', emoji: '\uD83E\uDD1D', descKey: 'BasicInfo.intentFriendship' },
    { value: 'social-explore', emoji: '\uD83C\uDF0D', descKey: 'BasicInfo.intentSocialExplore' },
    { value: 'professional', emoji: '\uD83D\uDCBC', descKey: 'BasicInfo.intentProfessional' },
];
export function StepBasicInfo() {
    const { t } = useModTranslation('mint-you');
    const store = useMintYouStore();
    const [name, setName] = useState(store.basicInfo?.displayName ?? '');
    const [gender, setGender] = useState<Gender | null>(store.basicInfo?.gender ?? null);
    const [ageRange, setAgeRange] = useState<AgeRange | null>(store.basicInfo?.ageRange ?? null);
    const [socialIntent, setSocialIntent] = useState<SocialIntent | null>(store.basicInfo?.socialIntent ?? null);
    const [errors, setErrors] = useState<string[]>([]);
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const raw = {
            displayName: name.trim(),
            gender,
            ageRange,
            socialIntent,
        };
        const result = BasicInfoSchema.safeParse(raw);
        if (!result.success) {
            setErrors(result.error.issues.map(i => i.message));
            return;
        }
        setErrors([]);
        store.setBasicInfo(result.data as typeof store.basicInfo & object);
        store.goNext();
    };
    return (<form onSubmit={handleSubmit} className="ui-sync-card ui-sync-card-inset mx-auto my-4 max-w-lg space-y-6 p-6">
      <h2 className="text-lg font-semibold text-gray-900">{t('BasicInfo.title')}</h2>

      {/* Display Name */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          {t('BasicInfo.nameLabel')}
        </label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('BasicInfo.namePlaceholder')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#4ECCA3] focus:outline-none focus:ring-1 focus:ring-[#4ECCA3]" maxLength={50}/>
      </div>

      {/* Gender */}
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">
          {t('BasicInfo.genderLabel')}
        </label>
        <div className="flex gap-2">
          {GENDER_OPTIONS.map((opt) => (<button key={opt.value} type="button" onClick={() => setGender(opt.value)} className={`ui-sync-btn flex-1 rounded-lg border px-3 py-2 text-center text-sm transition-colors ${gender === opt.value
                ? 'ui-sync-btn-selected border-[#4ECCA3] bg-[#4ECCA3]/10 text-[#4ECCA3]'
                : 'ui-sync-btn-secondary border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
              <span className="mr-1">{opt.icon}</span>
              {t(`BasicInfo.gender${opt.value.charAt(0) + opt.value.slice(1).toLowerCase()}`)}
            </button>))}
        </div>
      </div>

      {/* Age Range */}
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">
          {t('BasicInfo.ageLabel')}
        </label>
        <div className="flex gap-2">
          {AGE_OPTIONS.map((opt) => (<button key={opt} type="button" onClick={() => setAgeRange(opt)} className={`ui-sync-btn flex-1 rounded-lg border px-3 py-2 text-center text-sm transition-colors ${ageRange === opt
                ? 'ui-sync-btn-selected border-[#4ECCA3] bg-[#4ECCA3]/10 text-[#4ECCA3]'
                : 'ui-sync-btn-secondary border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
              {opt}
            </button>))}
        </div>
      </div>

      {/* Social Intent */}
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">
          {t('BasicInfo.intentLabel')}
        </label>
        <div className="grid grid-cols-2 gap-2">
          {INTENT_OPTIONS.map((opt) => (<button key={opt.value} type="button" onClick={() => setSocialIntent(opt.value)} className={`ui-sync-btn rounded-lg border p-3 text-left transition-colors ${socialIntent === opt.value
                ? 'ui-sync-btn-selected border-[#4ECCA3] bg-[#4ECCA3]/10'
                : 'ui-sync-btn-secondary border-gray-300 hover:bg-gray-50'}`}>
              <span className="text-lg">{opt.emoji}</span>
              <div className="mt-1 text-sm font-medium text-gray-800">
                {t(`BasicInfo.intent${opt.value.charAt(0).toUpperCase() + opt.value.slice(1).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())}`)}
              </div>
              <div className="mt-0.5 text-xs text-gray-500">{t(opt.descKey)}</div>
            </button>))}
        </div>
      </div>

      {/* Errors */}
      {errors.length > 0 && (<div className="rounded-lg border border-red-200 bg-red-50 p-2">
          {errors.map((err, i) => (<p key={i} className="text-xs text-red-600">{err}</p>))}
        </div>)}

      {/* Submit */}
      <button type="submit" className="ui-sync-btn ui-sync-btn-primary w-full rounded-lg bg-[#4ECCA3] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#3DBB92] disabled:opacity-50">
        {t('BasicInfo.next')}
      </button>
    </form>);
}
