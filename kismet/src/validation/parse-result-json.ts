import { KISMET_REASON } from '../contracts.js';
import type { KismetError } from '../types.js';

type ParseJsonResult =
  | { ok: true; data: unknown }
  | { ok: false; error: KismetError };

export function parseResultFromText(text: string): ParseJsonResult {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return {
      ok: false,
      error: {
        reasonCode: KISMET_REASON.IMPORT_PARSE_FAILED,
        message: '输入文本为空',
        actionHint: '请粘贴 AI 生成的 JSON 结果',
      },
    };
  }

  // Try extracting from markdown code block
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  const jsonText = codeBlockMatch ? codeBlockMatch[1]!.trim() : trimmed;

  try {
    const parsed = JSON.parse(jsonText);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        ok: false,
        error: {
          reasonCode: KISMET_REASON.IMPORT_PARSE_FAILED,
          message: '解析结果不是有效的 JSON 对象',
          actionHint: '请确保粘贴的内容是完整的 JSON 对象',
        },
      };
    }
    return { ok: true, data: parsed };
  } catch {
    return {
      ok: false,
      error: {
        reasonCode: KISMET_REASON.IMPORT_PARSE_FAILED,
        message: 'JSON 解析失败',
        actionHint: '请检查粘贴的 JSON 格式是否正确（括号匹配、逗号等）',
      },
    };
  }
}
