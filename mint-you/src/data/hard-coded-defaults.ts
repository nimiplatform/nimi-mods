export const HARDCODED_IDENTITY = {
  species: 'human',
} as const;

export const HARDCODED_BIOLOGICAL = {
  ethnicity: 'unspecified',
  heightCm: 170,
  weightKg: 60,
} as const;

export const HARDCODED_APPEARANCE = {
  artStyle: 'realistic',
  hair: 'black medium-length',
  eyes: 'dark brown',
  skin: 'fair',
  fashionStyle: 'casual',
  signatureItems: [] as string[],
} as const;

export const HARDCODED_AGENT = {
  ownershipType: 'MASTER_OWNED' as const,
  wakeStrategy: 'PASSIVE' as const,
  agentLorebooks: [] as never[],
  alternateGreetings: [] as never[],
  postHistoryInstructions: null,
} as const;

export function ageRangeToVisualAge(ageRange: string): string {
  switch (ageRange) {
    case '18-24': return '21';
    case '25-30': return '27';
    case '31-40': return '35';
    case '40+': return '45';
    default: return '27';
  }
}
