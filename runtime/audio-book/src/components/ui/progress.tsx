// ---------------------------------------------------------------------------
// Shared Progress component (Radix UI)
// ---------------------------------------------------------------------------

import React from 'react';
import * as ProgressPrimitive from '@radix-ui/react-progress';

type ProgressProps = {
  value: number;
  max?: number;
  className?: string;
  barClassName?: string;
};

export function Progress({ value, max = 100, className, barClassName }: ProgressProps) {
  const percentage = max > 0 ? Math.min(100, (value / max) * 100) : 0;

  return (
    <ProgressPrimitive.Root
      className={`relative h-2.5 w-full overflow-hidden rounded-full bg-gray-200 ${className ?? ''}`}
      value={value}
      max={max}
    >
      <ProgressPrimitive.Indicator
        className={`h-full rounded-full transition-all duration-300 ease-out ${barClassName ?? 'bg-indigo-600'}`}
        style={{ width: `${percentage}%` }}
      />
    </ProgressPrimitive.Root>
  );
}
