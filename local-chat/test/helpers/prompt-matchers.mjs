function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function includesAny(text, needles) {
  const input = String(text || '');
  return needles.some((needle) => input.includes(needle));
}

export function isPerceptionPromptText(prompt) {
  return includesAny(prompt, [
    '你是一个对话感知模块',
    'You are a conversation perception module.',
  ]);
}

export function isTailPlanPromptText(prompt) {
  return includesAny(prompt, [
    '请规划这轮对话在首拍之后的 tail beat 计划',
    'Plan the tail beats after the first beat for this turn.',
  ]);
}

export function isMediaPlannerPromptText(prompt) {
  return includesAny(prompt, [
    '媒体触发 planner',
    'local-chat media trigger planner',
  ]);
}

export function isPerceptionPrompt(payload) {
  return isPerceptionPromptText(payload?.prompt || '');
}

export function isTailPlanPrompt(payload) {
  return isTailPlanPromptText(payload?.prompt || '');
}

export function isMediaPlannerPrompt(payload) {
  return isMediaPlannerPromptText(payload?.prompt || '');
}

export const INTERACTION_PROFILE_RE = /(?:交流画像|Interaction Profile)/u;
export const RELATION_MEMORY_RE = /(?:关系槽位记忆|Relation memory slots)/u;
export const RESTRAINED_STYLE_RE = /(?:用户当前选择克制风格|User selected restrained style)/u;
export const RESERVED_BOUNDARY_RE = /(?:不要主动调情|Do not flirt proactively)/u;
export const SEXUAL_CONTENT_BOUNDARY_RE = /(?:不要输出色情、裸露、性暗示|Do not output pornographic, nude, sexually suggestive)/u;
export const TAIL_ONLY_RULE_RE = /(?:不要重写、重复、解释或微调首拍|Do not rewrite, repeat, explain, or fine-tune the first beat)/u;
export const FAST_DIRECTIVE_BOUNDARY_RE = /(?:不要越过当前边界|do not cross current boundaries)/iu;
export const FAST_DIRECTIVE_MEDIA_FOLLOWUP_RE = /(?:媒体相关内容留到后续补充|save media content for follow-up)/iu;
export const VISUAL_ANCHOR_RE = /(?:角色视觉锚点|Character visual anchor):/u;
export const RECENT_CONVERSATION_SUMMARY_RE = /(?:最近对话摘要|Recent conversation summary):/u;
export const CONTINUITY_REFERENCE_RE = /(?:连续性参考|Continuity reference):/u;
export const RECENT_MEDIA_RE = /(?:最近媒体|Recent media history|固定外观|穿搭延续)/u;

export function buildUserSaidRe(text) {
  return new RegExp(`(?:用户这次说：|User said: )${escapeRegExp(text)}`, 'u');
}

export function buildSealedFirstBeatRe(text) {
  return new RegExp(`(?:已经封口的首拍：|Sealed first beat: )${escapeRegExp(text)}`, 'u');
}
