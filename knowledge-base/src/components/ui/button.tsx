// ---------------------------------------------------------------------------
// Shared Button component (adapted from audio-book mod)
// ---------------------------------------------------------------------------

import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
};

const VARIANT_CLASSES: Record<ButtonVariant, { enabled: string; disabled: string }> = {
  primary: {
    enabled: 'bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800',
    disabled: 'bg-indigo-200 text-indigo-400 cursor-default',
  },
  secondary: {
    enabled: 'bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300 border border-gray-300',
    disabled: 'bg-gray-50 text-gray-300 cursor-default border border-gray-200',
  },
  destructive: {
    enabled: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800',
    disabled: 'bg-red-200 text-red-400 cursor-default',
  },
  ghost: {
    enabled: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 active:bg-gray-200',
    disabled: 'text-gray-300 cursor-default',
  },
};

const SIZE_CLASSES = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
};

export function Button({ variant = 'primary', size = 'md', className, disabled, children, ...rest }: ButtonProps) {
  const v = VARIANT_CLASSES[variant];
  const s = SIZE_CLASSES[size];
  const state = disabled ? v.disabled : v.enabled;

  return (
    <button
      type="button"
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors ${s} ${state} ${className ?? ''}`}
      {...rest}
    >
      {children}
    </button>
  );
}
