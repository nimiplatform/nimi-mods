export type ExplicitMediaRequest = {
  kind: 'image' | 'video';
  prompt: string;
  sourceText: string;
};

const VIDEO_NOUN_RE = /\b(?:video|clip|movie|film|animation|gif)\b|(?:视频|短视频|短片|影片|动图)/i;
const IMAGE_NOUN_RE = /\b(?:image|picture|photo|illustration|artwork|portrait|wallpaper)\b|(?:图片|图|照片|插画|头像|壁纸)/i;
const REQUEST_VERB_RE = /\b(?:send|show|make|create|generate|draw|render|give)\b|(?:发|给|来|做|生成|画|出|整|弄)/i;
const DIRECT_REQUEST_RE = /\b(?:can you|could you|please|send me|show me|make me|create me|generate me|draw me|render me)\b|(?:给我|帮我|替我|发我|来个|来一|来段|来张|发张|发个|做个|做张|整点|生成个|生成张|画张)/i;
const NEGATION_RE = /\b(?:don't|do not|no need to|not now|stop)\b|(?:不要|别|不用|先别|不必|暂时别|别再)/i;
const IMAGE_HINT_RE = /\b(?:pic|pics)\b|(?:配图|发图|看图|上图)/i;
const VIDEO_HINT_RE = /\b(?:vid)\b|(?:发视频|看视频|上视频)/i;

function normalizeWhitespace(value: string): string {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+\n/g, '\n')
    .trim();
}

function hasNegativeRequest(normalized: string): boolean {
  if (!NEGATION_RE.test(normalized)) {
    return false;
  }
  const lowered = normalized.toLowerCase();
  return (
    /(?:不要|别|不用|先别|不必|暂时别).{0,12}(?:发|给|来|做|生成|画|出|整|弄).{0,12}(?:图|图片|照片|插画|视频|短片|短视频|影片|动图)/i.test(normalized)
    || /(?:不要|别|不用|先别|不必|暂时别).{0,8}(?:图|图片|照片|插画|视频|短片|短视频|影片|动图)/i.test(normalized)
    || /(?:don't|do not|no need to|not now|stop).{0,16}(?:send|show|make|create|generate|draw|render|give).{0,16}(?:image|picture|photo|illustration|artwork|video|clip|movie|film|animation|gif)/i.test(lowered)
  );
}

function hasRequestIntent(normalized: string): boolean {
  return REQUEST_VERB_RE.test(normalized) || DIRECT_REQUEST_RE.test(normalized);
}

function matchesImageRequest(normalized: string): boolean {
  if (!(IMAGE_NOUN_RE.test(normalized) || IMAGE_HINT_RE.test(normalized))) {
    return false;
  }
  return hasRequestIntent(normalized);
}

function matchesVideoRequest(normalized: string): boolean {
  if (!(VIDEO_NOUN_RE.test(normalized) || VIDEO_HINT_RE.test(normalized))) {
    return false;
  }
  return hasRequestIntent(normalized);
}

function sanitizePrompt(text: string): string {
  return normalizeWhitespace(
    text
      .replace(/[!?！？]+$/g, '')
      .replace(/^(?:能不能|可以|可不可以|麻烦|请|please\s+)/i, '')
      .replace(/^(?:给我|帮我|替我|发我)\s*/i, ''),
  );
}

export function parseExplicitMediaRequest(text: string): ExplicitMediaRequest | null {
  const normalized = normalizeWhitespace(text);
  if (!normalized) {
    return null;
  }
  if (hasNegativeRequest(normalized)) {
    return null;
  }
  const videoRequest = matchesVideoRequest(normalized);
  const imageRequest = matchesImageRequest(normalized);
  if (!videoRequest && !imageRequest) {
    return null;
  }
  const kind: ExplicitMediaRequest['kind'] = videoRequest ? 'video' : 'image';
  return {
    kind,
    prompt: sanitizePrompt(normalized) || normalized,
    sourceText: normalized,
  };
}
