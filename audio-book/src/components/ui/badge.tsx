// ---------------------------------------------------------------------------
// Shared Badge component
// ---------------------------------------------------------------------------

import React from 'react';
import type { CharacterTier, SegmentType } from '../../types.js';

type BadgeProps = {
  children: React.ReactNode;
  className?: string;
};

const TIER_CLASSES: Record<CharacterTier, string> = {
  major: 'bg-blue-100 text-blue-800',
  supporting: 'bg-green-100 text-green-800',
  minor: 'bg-gray-100 text-gray-600',
};

const SEGMENT_TYPE_CLASSES: Record<SegmentType, string> = {
  dialogue: 'bg-blue-50 text-blue-700',
  narration: 'bg-gray-100 text-gray-600',
  inner_thought: 'bg-purple-50 text-purple-700',
  sound_effect: 'bg-amber-50 text-amber-700',
};

const SEGMENT_TYPE_ICONS: Record<SegmentType, string> = {
  dialogue: '\u{1F4AC}',
  narration: '\u{1F4D6}',
  inner_thought: '\u{1F9E0}',
  sound_effect: '\u{1F50A}',
};

export function Badge({ children, className }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${className ?? ''}`}>
      {children}
    </span>
  );
}

export function TierBadge({ tier }: { tier: CharacterTier }) {
  return (
    <Badge className={TIER_CLASSES[tier]}>
      {tier}
    </Badge>
  );
}

export function SegmentTypeBadge({ type, showIcon }: { type: SegmentType; showIcon?: boolean }) {
  return (
    <Badge className={SEGMENT_TYPE_CLASSES[type]}>
      {showIcon && <span>{SEGMENT_TYPE_ICONS[type]}</span>}
      {type}
    </Badge>
  );
}
