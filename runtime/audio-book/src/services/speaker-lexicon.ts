export const SPEECH_VERBS = [
  '冷笑道', '冷冷地说', '冷冷道', '厉声喝道', '厉声说道', '厉声说', '厉声道',
  '低声说道', '低声说', '低声道', '轻声说道', '轻声说', '轻声道',
  '高声说道', '高声说', '高声道', '沉声说道', '沉声说', '沉声道',
  '大声命令', '大声说道', '大声说', '大声喊', '大声叫',
  '接着说道', '接着说', '继续说道', '继续说', '急忙说道', '急忙说', '急忙道',
  '赶紧说道', '赶紧说', '连忙说道', '连忙说',
  '说道', '问道', '答道', '喊道', '叫道', '吼道', '嚷道', '笑道', '怒道', '喝道',
  '质问', '反驳', '解释', '提示', '回答', '命令',
  '大叫', '大喊', '说', '道', '问', '答', '喊', '叫', '嚷',
] as const;

export const THOUGHT_VERBS = [
  '心中暗道', '心中想道', '暗自思忖', '心中暗想', '暗自想', '心中想', '心想',
  '寻思', '思忖', '暗道', '心道', '想道', '想',
] as const;

export const PRONOUNS = new Set([
  '他', '她', '它', '我', '你', '您',
  '他们', '她们', '你们', '我们', '咱', '咱们',
  '大家', '众人',
]);

const INVALID_SINGLE_CHAR_SPEAKERS = new Set([
  '边', '旁', '里', '外', '前', '后', '上', '下', '中', '完',
]);
const INVALID_SPEAKER_PATTERNS = [
  /^口号$/u,
  /^标语$/u,
  /^呼声$/u,
  /^呐喊$/u,
  /^打倒/u,
  /^砸烂/u,
] as const;

const TRAILING_MODIFIER_RE = /(?:平静地?|冷冷地?|轻声地?|低声地?|高声地?|沉声地?|厉声地?|大声地?|慢条斯理地?|不动声色地?|若有所思地?|惊恐万状地?|笑着?|怒气冲冲地?|迫不及待地?|不安地?|慈祥地?|急忙|连忙|赶紧|接着|继续|回头|抬头|望着|看着|盯着|指着|对着|向着|冲着|朝着|点点头|示意|提示|继续下去|大叫起来|说起来)$/u;
const TRAILING_VERB_RE = /(?:说|说道|问|问道|答|答道|喊|喊道|叫|叫道|喝道|命令|质问|大叫|大喊|提示说)$/u;
const STRUCTURAL_BREAK_RE = /[，。！？；：、“”「」『』"\s]|(?:不由自主|平静地?|冷冷地?|轻声地?|低声地?|高声地?|沉声地?|厉声地?|大声地?|慢条斯理地?|不动声色地?|若有所思地?|惊恐万状地?|笑着?|怒气冲冲地?|迫不及待地?|不安地?|慈祥地?|急忙|连忙|赶紧|接着|继续|回头|抬头|望着|看着|盯着|指着|对着|向着|冲着|朝着|点点头|示意|提示|继续下去|站在|坐在|走到|转向|口号平息后|平息后|之后|以后|然后|此时|这时|对|给|跟|从|把|被|在)/u;

function escapePattern(input: string): string {
  return input.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
}

export function buildVerbPattern(verbs: readonly string[]): string {
  return verbs.map(escapePattern).sort((left, right) => right.length - left.length).join('|');
}

export function cleanSpeakerName(raw: string): string {
  let speaker = String(raw || '')
    .trim()
    .replace(/^[：:，,、“”「」『』"、\s]+/u, '')
    .replace(/[：:，,、。！？!?；;\s]+$/u, '');

  if (!speaker) return 'unknown';
  if (/[“”「」『』]/u.test(speaker)) {
    speaker = speaker.split(/[“”「」『』]/u).pop()?.trim() ?? speaker;
  }
  speaker = speaker
    .replace(/^旁边的/u, '')
    .replace(/^旁边/u, '')
    .replace(/^(?:那个|那名|那位|这名|这位)/u, '')
    .trim();

  for (const pronoun of PRONOUNS) {
    if (speaker.startsWith(pronoun) && speaker.length > pronoun.length) {
      return pronoun;
    }
  }

  while (speaker && TRAILING_MODIFIER_RE.test(speaker)) {
    speaker = speaker.replace(TRAILING_MODIFIER_RE, '').trim();
  }
  while (speaker && TRAILING_VERB_RE.test(speaker)) {
    speaker = speaker.replace(TRAILING_VERB_RE, '').trim();
  }

  const structuralMatch = speaker.match(STRUCTURAL_BREAK_RE);
  if (structuralMatch?.index !== undefined && structuralMatch.index > 0) {
    speaker = speaker.slice(0, structuralMatch.index).trim();
  }

  speaker = speaker.replace(/[的地得着]$/u, '').trim();

  if (!speaker) return 'unknown';
  if (/^(?:那|这)?(?:个)?小?女?孩儿$/u.test(speaker)) return '女孩儿';
  if (/^(?:那|这)?(?:个)?小?男孩儿$/u.test(speaker)) return '男孩儿';
  if (speaker.length === 1 && INVALID_SINGLE_CHAR_SPEAKERS.has(speaker)) return 'unknown';
  if (INVALID_SPEAKER_PATTERNS.some((pattern) => pattern.test(speaker))) return 'unknown';
  return speaker;
}

export function classifySpeakerName(name: string): 'high' | 'medium' | 'low' {
  if (!name || name === 'unknown') return 'low';
  if (PRONOUNS.has(name)) return 'low';
  if (name.length === 1) return 'medium';
  if (name.length > 6 && !/^一[位名个]/u.test(name)) return 'medium';
  return 'high';
}
