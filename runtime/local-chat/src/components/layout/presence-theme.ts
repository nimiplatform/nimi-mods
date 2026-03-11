import type { InteractionSnapshot } from '../../state/index.js';

type PresencePalette = {
  accent: string;
  accentStrong: string;
  accentSoft: string;
  border: string;
  text: string;
};

export type LocalChatPresenceTheme = {
  accent: string;
  accentStrong: string;
  accentSoft: string;
  border: string;
  text: string;
  bubbleSurface: string;
  bubbleGlow: string;
  roomAura: string;
  roomSurface: string;
};

const PRESENCE_PALETTES: PresencePalette[] = [
  {
    accent: '#5eead4',
    accentStrong: '#14b8a6',
    accentSoft: '#ccfbf1',
    border: 'rgba(20, 184, 166, 0.28)',
    text: '#115e59',
  },
  {
    accent: '#7dd3fc',
    accentStrong: '#0ea5e9',
    accentSoft: '#dbeafe',
    border: 'rgba(14, 165, 233, 0.28)',
    text: '#0c4a6e',
  },
  {
    accent: '#a7f3d0',
    accentStrong: '#22c55e',
    accentSoft: '#dcfce7',
    border: 'rgba(34, 197, 94, 0.28)',
    text: '#166534',
  },
  {
    accent: '#c4b5fd',
    accentStrong: '#8b5cf6',
    accentSoft: '#ede9fe',
    border: 'rgba(139, 92, 246, 0.28)',
    text: '#5b21b6',
  },
  {
    accent: '#f9a8d4',
    accentStrong: '#ec4899',
    accentSoft: '#fce7f3',
    border: 'rgba(236, 72, 153, 0.24)',
    text: '#9d174d',
  },
  {
    accent: '#fdba74',
    accentStrong: '#f97316',
    accentSoft: '#ffedd5',
    border: 'rgba(249, 115, 22, 0.24)',
    text: '#9a3412',
  },
];

function hashSeed(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '');
  const full = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized;
  const parsed = Number.parseInt(full, 16);
  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255,
  };
}

function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function roomAuraFor(input: {
  accentStrong: string;
  accent: string;
  temperature: InteractionSnapshot['emotionalTemperature'] | 'low';
}): string {
  if (input.temperature === 'heated') {
    return `
      radial-gradient(circle at 50% 18%, ${withAlpha('#fb923c', 0.22)} 0%, transparent 34%),
      radial-gradient(circle at 50% 32%, ${withAlpha(input.accentStrong, 0.3)} 0%, transparent 54%),
      linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(255,247,237,0.84) 52%, rgba(255,255,255,0.86) 100%)
    `;
  }
  if (input.temperature === 'warm') {
    return `
      radial-gradient(circle at 50% 18%, ${withAlpha('#fbbf24', 0.16)} 0%, transparent 32%),
      radial-gradient(circle at 50% 30%, ${withAlpha(input.accent, 0.24)} 0%, transparent 52%),
      linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(255,251,235,0.78) 48%, rgba(255,255,255,0.86) 100%)
    `;
  }
  if (input.temperature === 'steady') {
    return `
      radial-gradient(circle at 50% 24%, ${withAlpha(input.accent, 0.2)} 0%, transparent 48%),
      linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(240,249,255,0.76) 46%, rgba(255,255,255,0.86) 100%)
    `;
  }
  return `
    radial-gradient(circle at 50% 24%, ${withAlpha(input.accent, 0.14)} 0%, transparent 42%),
    linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,250,252,0.86) 48%, rgba(255,255,255,0.88) 100%)
  `;
}

export function resolvePresenceTheme(input: {
  seed: string;
  emotionalTemperature?: InteractionSnapshot['emotionalTemperature'] | 'low';
}): LocalChatPresenceTheme {
  const seed = String(input.seed || 'local-chat').trim() || 'local-chat';
  const paletteIndex = hashSeed(seed) % PRESENCE_PALETTES.length;
  const palette = PRESENCE_PALETTES[paletteIndex] ?? PRESENCE_PALETTES[0]!;
  const temperature = input.emotionalTemperature || 'low';
  return {
    accent: palette.accent,
    accentStrong: palette.accentStrong,
    accentSoft: palette.accentSoft,
    border: palette.border,
    text: palette.text,
    bubbleSurface: `linear-gradient(180deg, rgba(255,255,255,0.96) 0%, ${withAlpha(palette.accentSoft, 0.94)} 100%)`,
    bubbleGlow: `0 0 0 1px ${palette.border}, 0 18px 40px ${withAlpha(palette.accentStrong, 0.18)}, 0 0 48px ${withAlpha(palette.accent, 0.24)}`,
    roomAura: roomAuraFor({
      accentStrong: palette.accentStrong,
      accent: palette.accent,
      temperature,
    }),
    roomSurface: `linear-gradient(180deg, rgba(255,255,255,0.98) 0%, ${withAlpha(palette.accentSoft, 0.55)} 100%)`,
  };
}
