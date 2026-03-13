export const DNA_PRIMARY_TYPES = [
  'CARING',
  'PLAYFUL',
  'INTELLECTUAL',
  'CONFIDENT',
  'MYSTERIOUS',
  'ROMANTIC',
] as const;

export const DNA_SECONDARY_TRAITS = [
  'HUMOROUS',
  'SARCASTIC',
  'GENTLE',
  'DIRECT',
  'OPTIMISTIC',
  'REALISTIC',
  'DRAMATIC',
  'PASSIONATE',
  'REBELLIOUS',
  'INNOCENT',
  'WISE',
  'ECCENTRIC',
] as const;

export type DnaPrimaryType = (typeof DNA_PRIMARY_TYPES)[number];
export type DnaSecondaryTrait = (typeof DNA_SECONDARY_TRAITS)[number];

const DNA_PRIMARY_SET = new Set<string>(DNA_PRIMARY_TYPES);
const DNA_SECONDARY_SET = new Set<string>(DNA_SECONDARY_TRAITS);

const PRIMARY_ALIAS_RULES: Array<{ pattern: RegExp; value: DnaPrimaryType }> = [
  { pattern: /(care|caring|kind|warm|gentle|empat|关怀|体贴|温柔|照料|善良|仁慈)/i, value: 'CARING' },
  { pattern: /(playful|fun|jok|humou|活泼|顽皮|有趣|爱玩|幽默)/i, value: 'PLAYFUL' },
  { pattern: /(intellect|rational|logic|analyt|wise|理性|冷静|聪明|智慧|学识|分析)/i, value: 'INTELLECTUAL' },
  { pattern: /(confiden|assertive|decisive|leader|brave|自信|果断|坚毅|强势|领导)/i, value: 'CONFIDENT' },
  { pattern: /(myster|enigmat|silent|stoic|神秘|深沉|寡言|难测|莫测)/i, value: 'MYSTERIOUS' },
  { pattern: /(roman|loving|affection|温情|浪漫|多情|深情)/i, value: 'ROMANTIC' },
];

const SECONDARY_ALIAS_RULES: Array<{ pattern: RegExp; value: DnaSecondaryTrait }> = [
  { pattern: /(humou|jok|搞笑|幽默)/i, value: 'HUMOROUS' },
  { pattern: /(sarcas|刻薄|阴阳怪气|讽刺)/i, value: 'SARCASTIC' },
  { pattern: /(gentle|soft|kind|温和|温柔|体贴)/i, value: 'GENTLE' },
  { pattern: /(direct|decisive|straight|直率|果断|直接)/i, value: 'DIRECT' },
  { pattern: /(optimis|乐观|积极)/i, value: 'OPTIMISTIC' },
  { pattern: /(realis|cautious|pragmatic|rational|务实|谨慎|现实|理性)/i, value: 'REALISTIC' },
  { pattern: /(dramatic|戏剧|夸张)/i, value: 'DRAMATIC' },
  { pattern: /(passion|热情|炽烈)/i, value: 'PASSIONATE' },
  { pattern: /(rebell|叛逆|反骨)/i, value: 'REBELLIOUS' },
  { pattern: /(innocent|pure|天真|单纯|纯真)/i, value: 'INNOCENT' },
  { pattern: /(wise|analyt|insight|睿智|分析|深思)/i, value: 'WISE' },
  { pattern: /(eccentric|quirk|怪诞|古怪|离经叛道)/i, value: 'ECCENTRIC' },
];

function normalizeToken(value: unknown): string {
  return String(value || '').trim();
}

function toUpperToken(value: unknown): string {
  return normalizeToken(value).toUpperCase();
}

function splitTraitTokens(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeToken(item))
      .filter(Boolean);
  }
  const text = normalizeToken(value);
  if (!text) return [];
  return text
    .split(/[,\n;，；、|/]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeDnaPrimaryTrait(value: unknown): DnaPrimaryType | null {
  const text = normalizeToken(value);
  if (!text) return null;
  const upper = text.toUpperCase();
  if (DNA_PRIMARY_SET.has(upper)) {
    return upper as DnaPrimaryType;
  }
  const matched = PRIMARY_ALIAS_RULES.find((rule) => rule.pattern.test(text));
  return matched?.value || null;
}

export function normalizeDnaSecondaryTraits(value: unknown, limit = 3): DnaSecondaryTrait[] {
  const output: DnaSecondaryTrait[] = [];
  splitTraitTokens(value).forEach((token) => {
    const upper = toUpperToken(token);
    if (DNA_SECONDARY_SET.has(upper)) {
      const trait = upper as DnaSecondaryTrait;
      if (!output.includes(trait)) {
        output.push(trait);
      }
      return;
    }
    const matched = SECONDARY_ALIAS_RULES.find((rule) => rule.pattern.test(token));
    if (matched && !output.includes(matched.value)) {
      output.push(matched.value);
    }
  });
  return output.slice(0, Math.max(0, limit));
}
