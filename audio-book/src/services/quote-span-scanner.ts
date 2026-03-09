export type QuoteSpan = {
  startOffset: number;
  endOffset: number;
  openQuote: string;
  closeQuote: string;
  text: string;
};

export type NarrationSpan = {
  startOffset: number;
  endOffset: number;
  text: string;
};

const ASYMMETRIC_QUOTE_PAIRS = new Map<string, string>([
  ['“', '”'],
  ['「', '」'],
  ['『', '』'],
]);
const SYMMETRIC_QUOTES = new Set(['"']);

type QuoteFrame = {
  openQuote: string;
  closeQuote: string;
  startOffset: number;
};

export function scanQuoteSpans(text: string): QuoteSpan[] {
  const source = String(text || '');
  if (!source.trim()) return [];

  const spans: QuoteSpan[] = [];
  const stack: QuoteFrame[] = [];
  let topLevelFrame: QuoteFrame | null = null;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i] || '';
    if (stack.length > 0 && ch === '\n' && source[i + 1] === '\n' && topLevelFrame) {
      spans.push({
        startOffset: topLevelFrame.startOffset,
        endOffset: i,
        openQuote: topLevelFrame.openQuote,
        closeQuote: topLevelFrame.closeQuote,
        text: source.slice(topLevelFrame.startOffset, i),
      });
      stack.length = 0;
      topLevelFrame = null;
      continue;
    }

    const top = stack[stack.length - 1];

    if (SYMMETRIC_QUOTES.has(ch)) {
      if (top && top.openQuote === ch) {
        stack.pop();
        if (stack.length === 0 && topLevelFrame) {
          spans.push({
            startOffset: topLevelFrame.startOffset,
            endOffset: i + 1,
            openQuote: topLevelFrame.openQuote,
            closeQuote: ch,
            text: source.slice(topLevelFrame.startOffset, i + 1),
          });
          topLevelFrame = null;
        }
      } else {
        const frame = {
          openQuote: ch,
          closeQuote: ch,
          startOffset: i,
        };
        if (stack.length === 0) {
          topLevelFrame = frame;
        }
        stack.push(frame);
      }
      continue;
    }

    const closeQuote = ASYMMETRIC_QUOTE_PAIRS.get(ch);
    if (closeQuote) {
      const frame = {
        openQuote: ch,
        closeQuote,
        startOffset: i,
      };
      if (stack.length === 0) {
        topLevelFrame = frame;
      }
      stack.push(frame);
      continue;
    }

    if (!top || ch !== top.closeQuote) {
      continue;
    }

    stack.pop();
    if (stack.length === 0 && topLevelFrame) {
      spans.push({
        startOffset: topLevelFrame.startOffset,
        endOffset: i + 1,
        openQuote: topLevelFrame.openQuote,
        closeQuote: ch,
        text: source.slice(topLevelFrame.startOffset, i + 1),
      });
      topLevelFrame = null;
    }
  }

  if (stack.length > 0 && topLevelFrame) {
    spans.push({
      startOffset: topLevelFrame.startOffset,
      endOffset: source.length,
      openQuote: topLevelFrame.openQuote,
      closeQuote: topLevelFrame.closeQuote,
      text: source.slice(topLevelFrame.startOffset),
    });
  }

  return spans;
}

export function buildNarrationSpans(text: string, quoteSpans: QuoteSpan[]): NarrationSpan[] {
  const source = String(text || '');
  if (!source.trim()) return [];
  if (quoteSpans.length === 0) {
    return source.trim()
      ? [{
        startOffset: 0,
        endOffset: source.length,
        text: source,
      }]
      : [];
  }

  const spans: NarrationSpan[] = [];
  let cursor = 0;

  for (const quote of quoteSpans) {
    if (quote.startOffset > cursor) {
      const narrationText = source.slice(cursor, quote.startOffset);
      if (narrationText.trim()) {
        spans.push({
          startOffset: cursor,
          endOffset: quote.startOffset,
          text: narrationText,
        });
      }
    }
    cursor = Math.max(cursor, quote.endOffset);
  }

  if (cursor < source.length) {
    const tail = source.slice(cursor);
    if (tail.trim()) {
      spans.push({
        startOffset: cursor,
        endOffset: source.length,
        text: tail,
      });
    }
  }

  return spans;
}
