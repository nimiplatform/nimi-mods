export type MediaIntentType = 'image' | 'video';
export type MediaIntentSource = 'marker' | 'heuristic';
export type MediaTriggerMode = 'marker_only' | 'marker_plus_heuristic';

export type ParsedMediaIntent = {
  id: string;
  type: MediaIntentType;
  prompt: string;
  triggerSource: MediaIntentSource;
};

export type MediaIntentParseResult = {
  cleanedText: string;
  intents: ParsedMediaIntent[];
  invalidTagCount: number;
};

const IMAGE_MARKER = '[[IMG:';
const VIDEO_MARKER = '[[VID:';

function createIntentId(type: MediaIntentType, index: number): string {
  return `intent-${type}-${Date.now().toString(36)}-${index.toString(36)}`;
}

function normalizeWhitespace(value: string): string {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function shouldHeuristicGenerateImage(text: string): boolean {
  const normalized = String(text || '').trim();
  if (!normalized) return false;
  const heuristics = [
    /(?:我来|让我|我给你|帮你)(?:画|生成|做|整)(?:一|1)?(?:张|幅)?(?:图|图片|插画)/i,
    /(?:给你|帮你)(?:来|做|整|生成)(?:一|1)?(?:张|幅)?(?:图|图片|插画)/i,
    /(?:i(?:'ll| will)|let me)\s+(?:draw|generate|make|create)\s+(?:you\s+)?(?:an?\s+)?(?:image|picture|illustration)\b/i,
    /(?:i can)\s+(?:send|make|generate)\s+(?:an?\s+)?(?:image|picture)\b/i,
  ];
  return heuristics.some((pattern) => pattern.test(normalized));
}

function buildHeuristicPrompt(input: {
  assistantText: string;
  userText?: string;
}): string {
  const assistant = normalizeWhitespace(input.assistantText);
  const user = normalizeWhitespace(input.userText || '');
  if (assistant && user) {
    return `聊天上下文:\n用户: ${user}\n助手: ${assistant}\n请生成一张贴合当前话题和情绪的图片。`;
  }
  if (assistant) {
    return `请根据助手刚才这句话生成一张贴合语境的图片：${assistant}`;
  }
  return user ? `请根据用户这句话生成一张贴合语境的图片：${user}` : '';
}

function buildMarkerFallbackPrompt(input: {
  type: MediaIntentType;
  assistantText: string;
  userText?: string;
}): string {
  const assistant = normalizeWhitespace(input.assistantText);
  const user = normalizeWhitespace(input.userText || '');
  const lines = input.type === 'image'
    ? ['请基于当前对话生成一张图片，要求画面具体且贴合情绪。']
    : ['请基于当前对话生成一段短视频，要求镜头感自然且贴合情绪。'];
  if (user) {
    lines.push(`用户: ${user}`);
  }
  if (assistant) {
    lines.push(`助手: ${assistant}`);
  }
  return normalizeWhitespace(lines.join('\n'));
}

export function parseMediaIntent(input: {
  text: string;
  userText?: string;
  triggerMode?: MediaTriggerMode;
}): MediaIntentParseResult {
  const triggerMode = input.triggerMode || 'marker_only';
  const sourceText = String(input.text || '');
  const intents: ParsedMediaIntent[] = [];
  const markerFallbackNeeded: Array<{
    id: string;
    type: MediaIntentType;
  }> = [];
  let invalidTagCount = 0;
  let index = 0;
  let output = '';

  while (index < sourceText.length) {
    const escapedMarkerStart = sourceText[index] === '\\'
      && sourceText[index + 1] === '['
      && sourceText[index + 2] === '[';
    if (escapedMarkerStart) {
      output += '[[';
      index += 3;
      continue;
    }

    const atImageTag = sourceText.startsWith(IMAGE_MARKER, index);
    const atVideoTag = sourceText.startsWith(VIDEO_MARKER, index);
    if (!atImageTag && !atVideoTag) {
      output += sourceText[index];
      index += 1;
      continue;
    }

    const type: MediaIntentType = atImageTag ? 'image' : 'video';
    const marker = atImageTag ? IMAGE_MARKER : VIDEO_MARKER;
    const promptStart = index + marker.length;
    const promptEnd = sourceText.indexOf(']]', promptStart);
    if (promptEnd < 0) {
      output += sourceText[index];
      index += 1;
      invalidTagCount += 1;
      continue;
    }

    const prompt = normalizeWhitespace(sourceText.slice(promptStart, promptEnd));
    if (prompt) {
      intents.push({
        id: createIntentId(type, intents.length),
        type,
        prompt,
        triggerSource: 'marker',
      });
    } else {
      markerFallbackNeeded.push({
        id: createIntentId(type, intents.length + markerFallbackNeeded.length),
        type,
      });
    }
    index = promptEnd + 2;
  }

  const cleanedText = normalizeWhitespace(output);
  markerFallbackNeeded.forEach((marker, markerIndex) => {
    const prompt = buildMarkerFallbackPrompt({
      type: marker.type,
      assistantText: cleanedText,
      userText: input.userText,
    });
    if (!prompt) {
      invalidTagCount += 1;
      return;
    }
    intents.push({
      id: `${marker.id}-${markerIndex}`,
      type: marker.type,
      prompt,
      triggerSource: 'marker',
    });
  });
  if (
    intents.length === 0
    && triggerMode === 'marker_plus_heuristic'
    && shouldHeuristicGenerateImage(cleanedText)
  ) {
    const prompt = buildHeuristicPrompt({
      assistantText: cleanedText,
      userText: input.userText,
    });
    if (prompt) {
      intents.push({
        id: createIntentId('image', 0),
        type: 'image',
        prompt,
        triggerSource: 'heuristic',
      });
    }
  }

  return {
    cleanedText,
    intents,
    invalidTagCount,
  };
}
