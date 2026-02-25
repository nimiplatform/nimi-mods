type ChunkerOptions = {
  chunkSize?: number;
  overlap?: number;
};

const HEADING_REGEX =
  /^(?:\s*(?:第[0-9一二三四五六七八九十百千〇零两]+[章节回部卷][^\n\r]*|chapter\s+\d+[^\n\r]*|part\s+\d+[^\n\r]*))$/i;

function splitIntoSections(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const sections: string[] = [];
  let current: string[] = [];

  const flush = () => {
    const joined = current.join('\n').trim();
    if (joined) sections.push(joined);
    current = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const isHeading = HEADING_REGEX.test(trimmed);
    if (isHeading && current.length > 0) {
      flush();
    }
    current.push(line);
  }
  flush();
  return sections.length > 0 ? sections : [text];
}

function splitSection(section: string, chunkSize: number, overlap: number): string[] {
  const normalized = section.trim();
  if (!normalized) return [];
  const safeChunkSize = Math.max(600, chunkSize);
  const safeOverlap = Math.max(0, Math.min(overlap, safeChunkSize - 1));
  const chunks: string[] = [];

  let cursor = 0;
  while (cursor < normalized.length) {
    const end = Math.min(normalized.length, cursor + safeChunkSize);
    chunks.push(normalized.slice(cursor, end));
    if (end >= normalized.length) break;
    cursor = Math.max(0, end - safeOverlap);
  }
  return chunks;
}

export function splitSourceText(sourceText: string, options?: ChunkerOptions): string[] {
  const normalized = String(sourceText || '').trim();
  if (!normalized) return [];
  const chunkSize = options?.chunkSize ?? 3000;
  const overlap = options?.overlap ?? 300;
  const sections = splitIntoSections(normalized);
  return sections.flatMap((section) => splitSection(section, chunkSize, overlap));
}

