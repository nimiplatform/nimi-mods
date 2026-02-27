const CHARACTER_STOPWORDS = new Set([
  '我们',
  '你们',
  '他们',
  '她们',
  '它们',
  '自己',
  '这个',
  '那个',
  '这些',
  '那些',
  '有人',
  '大家',
  '世界',
  '事件',
  '角色',
  '地点',
  '时间',
  '文明',
  '历史',
  '系统',
  '计划',
  '任务',
]);

const SPEECH_SUFFIXES = [
  '说道',
  '问道',
  '答道',
  '表示',
  '认为',
  '觉得',
  '知道',
  '看到',
  '听到',
  '听见',
  '发现',
  '解释',
  '强调',
  '补充',
  '喊道',
  '叫道',
  '说道',
  '看见',
  '说',
  '道',
  '问',
  '答',
  '将',
  '称',
  '讲',
  '喊',
  '叫',
];

const EDGE_PUNCTUATION_RE = /^[\s"'“”‘’《》〈〉「」【】（）()[\]{}<>]+|[\s"'“”‘’《》〈〉「」【】（）()[\]{}<>，。！？、；：,.!?]+$/g;
const HAS_CJK_RE = /[\u4e00-\u9fff]/;
const LATIN_NAME_RE = /^[A-Za-z][A-Za-z0-9'\-. ]{1,40}$/;
const PLACEHOLDER_ENTITY_RE = /^(?:char(?:acter)?|loc(?:ation)?|evt|event|timeline|segment|item|node)(?:[-_: ]+[a-z0-9]+|\d+)$/i;
const PLACEHOLDER_CJK_RE = /^(?:角色|人物|地点|事件|时间线)[-_:\s]*\d+$/;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function trimSpeechSuffix(value: string): string {
  let next = value;
  let changed = true;
  while (changed && next.length >= 2) {
    changed = false;
    for (const suffix of SPEECH_SUFFIXES) {
      if (next.endsWith(suffix) && next.length - suffix.length >= 2) {
        next = next.slice(0, next.length - suffix.length);
        changed = true;
        break;
      }
    }
  }
  return next.replace(/[地的着了]+$/g, '').trim();
}

function normalizeRawName(raw: string): string {
  const cleaned = normalizeWhitespace(String(raw || '').replace(EDGE_PUNCTUATION_RE, ''));
  if (!cleaned) return '';
  const deSuffixed = trimSpeechSuffix(cleaned);
  return normalizeWhitespace(deSuffixed.replace(EDGE_PUNCTUATION_RE, ''));
}

function isLikelyValidName(name: string): boolean {
  if (!name) return false;
  if (PLACEHOLDER_ENTITY_RE.test(name) || PLACEHOLDER_CJK_RE.test(name)) return false;
  if (CHARACTER_STOPWORDS.has(name)) return false;
  if (HAS_CJK_RE.test(name)) {
    if (/\d/.test(name)) return false;
    if (name.length < 2 || name.length > 6) return false;
    if (/^(是|在|和|与|对|把|被|从|向|由|并|而|或)+$/.test(name)) return false;
    return true;
  }
  if (!LATIN_NAME_RE.test(name)) return false;
  if (!/[A-Za-z]/.test(name)) return false;
  return name.length >= 2 && name.length <= 42;
}

function isAliasLike(a: string, b: string): boolean {
  if (a === b) return true;
  if (!HAS_CJK_RE.test(a) || !HAS_CJK_RE.test(b)) return false;
  if (Math.min(a.length, b.length) < 2) return false;
  if (a.startsWith(b) || b.startsWith(a)) return true;
  return false;
}

function resolveCanonicalName(name: string, canonicals: string[]): string {
  for (const canonical of canonicals) {
    if (isAliasLike(name, canonical)) {
      return canonical.length >= name.length ? canonical : name;
    }
  }
  return name;
}

export function normalizeZhCharacterName(raw: string): string | null {
  const normalized = normalizeRawName(raw);
  if (!isLikelyValidName(normalized)) return null;
  return normalized;
}

export function canonicalizeCharacterNames(rawNames: string[]): {
  canonicalNames: string[];
  aliasToCanonical: Record<string, string>;
  dropped: string[];
  purity: number;
} {
  const aliasToCanonical: Record<string, string> = {};
  const dropped: string[] = [];
  const normalizedEntries = rawNames
    .map((raw) => {
      const normalized = normalizeZhCharacterName(raw);
      if (!normalized) {
        const text = String(raw || '').trim();
        if (text) dropped.push(text);
        return null;
      }
      return {
        raw: String(raw || '').trim(),
        normalized,
      };
    })
    .filter((item): item is { raw: string; normalized: string } => Boolean(item));

  const frequency = new Map<string, number>();
  normalizedEntries.forEach((item) => {
    frequency.set(item.normalized, (frequency.get(item.normalized) || 0) + 1);
  });

  const ordered = Array.from(frequency.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return b[0].length - a[0].length;
    })
    .map(([name]) => name);

  const canonicals: string[] = [];
  ordered.forEach((name) => {
    const resolved = resolveCanonicalName(name, canonicals);
    if (resolved === name && !canonicals.includes(name)) {
      canonicals.push(name);
    }
  });

  normalizedEntries.forEach((entry) => {
    const canonical = resolveCanonicalName(entry.normalized, canonicals);
    aliasToCanonical[entry.normalized] = canonical;
    if (entry.raw) {
      aliasToCanonical[entry.raw] = canonical;
    }
  });

  const normalizedCount = normalizedEntries.length;
  const purity = normalizedCount > 0 ? Math.max(0, Math.min(1, canonicals.length / normalizedCount)) : 1;

  return {
    canonicalNames: canonicals,
    aliasToCanonical,
    dropped,
    purity,
  };
}
