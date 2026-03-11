import React from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import type { DnaPrimaryType, DnaSecondaryTrait, RelationshipMode, FormalityValue, SentimentValue } from '../contracts.js';

const ARCHETYPE_COLORS: Record<DnaPrimaryType, string> = {
  CARING: 'bg-pink-100 text-pink-700',
  PLAYFUL: 'bg-amber-100 text-amber-700',
  INTELLECTUAL: 'bg-blue-100 text-blue-700',
  CONFIDENT: 'bg-red-100 text-red-700',
  MYSTERIOUS: 'bg-purple-100 text-purple-700',
  ROMANTIC: 'bg-rose-100 text-rose-700',
};

type PersonaCardProps = {
  displayName: string;
  dnaPrimary: DnaPrimaryType;
  dnaSecondary: DnaSecondaryTrait[];
  mbti: string;
  greeting: string;
  personalitySummary: string;
  formality: FormalityValue;
  sentiment: SentimentValue;
  relationshipMode: RelationshipMode;
  interests: string[];
  referenceImageUrl?: string | null;
  compact?: boolean;
};

export function PersonaCard({
  displayName,
  dnaPrimary,
  dnaSecondary,
  mbti,
  greeting,
  personalitySummary,
  formality,
  sentiment,
  relationshipMode,
  interests,
  referenceImageUrl,
  compact,
}: PersonaCardProps) {
  const { t } = useModTranslation('mint-you');

  return (
    <div className="ui-sync-card rounded-xl border border-gray-200 bg-white p-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        {/* Avatar area */}
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gray-100">
          {referenceImageUrl ? (
            <img src={referenceImageUrl} alt={displayName} className="h-full w-full rounded-full object-cover" />
          ) : (
            <span className="text-xl text-gray-400">{displayName.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-gray-900">{displayName}</h3>
          <div className="mt-1 flex flex-wrap gap-1">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ARCHETYPE_COLORS[dnaPrimary]}`}>
              {dnaPrimary}
            </span>
            <span className="ui-sync-pill rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
              {mbti}
            </span>
          </div>
        </div>
      </div>

      {/* Secondary traits */}
      <div className="mt-3 flex flex-wrap gap-1">
        {dnaSecondary.map((trait) => (
          <span key={trait} className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-600">
            {trait}
          </span>
        ))}
      </div>

      {!compact && (
        <>
          {/* Greeting */}
          <div className="ui-sync-soft-card mt-3 rounded-lg bg-gray-50 p-3">
            <p className="text-sm italic text-gray-700">&ldquo;{greeting}&rdquo;</p>
          </div>

          {/* Personality summary */}
          <p className="mt-3 text-sm leading-relaxed text-gray-600">{personalitySummary}</p>

          {/* Communication style */}
          <div className="mt-3 flex gap-2 text-xs text-gray-500">
            <span className="rounded border border-gray-200 px-2 py-0.5">{formality}</span>
            <span className="rounded border border-gray-200 px-2 py-0.5">{sentiment}</span>
            <span className="rounded border border-gray-200 px-2 py-0.5">{relationshipMode}</span>
          </div>

          {/* Interests */}
          {interests.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {interests.map((tag) => (
                <span key={tag} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
