import {
  NARRATIVE_GUARD_DEFAULTS,
  NARRATIVE_REASON_CODES,
  NARRATIVE_SPINE_EVENT_TYPES,
  NARRATIVE_VISIBILITY_VALUES,
} from '../contracts.js';
import type {
  NarrativeCoreOutput,
  NarrativeGuardResult,
  NarrativeSpineEvent,
} from '../types.js';

function hasOnlyCoreOutputWhitelistFields(coreOutput: NarrativeCoreOutput): boolean {
  const allowed = new Set(['spineEvents', 'stateChanges', 'metrics']);
  const keys = Object.keys(coreOutput);
  if (keys.length !== allowed.size) {
    return false;
  }
  return keys.every((key) => allowed.has(key));
}

function isValidMetricValue(value: unknown): boolean {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return false;
  }
  return value >= NARRATIVE_GUARD_DEFAULTS.minMetric && value <= NARRATIVE_GUARD_DEFAULTS.maxMetric;
}

function isValidVisibility(value: unknown): value is NarrativeSpineEvent['visibility'] {
  return NARRATIVE_VISIBILITY_VALUES.includes(String(value || '') as NarrativeSpineEvent['visibility']);
}

function isValidEventType(value: unknown): value is NarrativeSpineEvent['type'] {
  return NARRATIVE_SPINE_EVENT_TYPES.includes(String(value || '') as NarrativeSpineEvent['type']);
}

function isNonEmptyPayload(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  return Object.keys(value as Record<string, unknown>).length > 0;
}

function cloneCoreOutput(coreOutput: NarrativeCoreOutput): NarrativeCoreOutput {
  return {
    spineEvents: coreOutput.spineEvents.map((event) => ({
      ...event,
      payload: { ...event.payload },
      ...(Array.isArray(event.sourceEventIds) ? { sourceEventIds: [...event.sourceEventIds] } : {}),
    })),
    stateChanges: { ...coreOutput.stateChanges },
    metrics: { ...coreOutput.metrics },
  };
}

const STRONG_RETCON_MARKERS = [
  '其实',
  '原来',
  '并不存在',
  '从未发生',
  '都是幻觉',
  '记忆是假的',
  'never happened',
  'false memory',
] as const;

const NEGATION_MARKERS = [
  '并非',
  '并不',
  '并没有',
  '从未',
  '不是',
  '不存在',
  'never',
  'did not',
  'is not',
  'was not',
  'no longer',
] as const;

function extractEventNarrativeText(event: NarrativeSpineEvent): string {
  const payload = event.payload || {};
  const fragments = [
    payload.description,
    payload.summary,
    payload.content,
    payload.text,
    payload.action,
    payload.outcome,
    payload.discovery,
    payload.choice,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return fragments.join(' ').toLowerCase();
}

function containsAny(text: string, markers: readonly string[]): boolean {
  const normalized = String(text || '').toLowerCase();
  if (!normalized) {
    return false;
  }
  return markers.some((marker) => normalized.includes(marker.toLowerCase()));
}

function tokenize(text: string): string[] {
  const normalized = String(text || '').toLowerCase();
  const matches = normalized.match(/[a-z0-9\u4e00-\u9fff]{2,}/gu) || [];
  return [...new Set(matches)];
}

function hasTokenOverlap(left: string, right: string): boolean {
  const leftTokens = tokenize(left);
  const rightTokens = new Set(tokenize(right));
  let overlapCount = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlapCount += 1;
      if (overlapCount >= 2) {
        return true;
      }
    }
  }
  return false;
}

function allowRetcon(event: NarrativeSpineEvent): boolean {
  const payload = event.payload || {};
  return payload.allowRetcon === true || payload.retconApproved === true;
}

function detectSemanticContradiction(input: {
  generated: NarrativeSpineEvent[];
  recent: NarrativeSpineEvent[];
}): string | null {
  const recentTexts = input.recent
    .map(extractEventNarrativeText)
    .filter((text) => text.length > 0)
    .slice(-24);
  if (recentTexts.length === 0) {
    return null;
  }

  for (const event of input.generated) {
    if (allowRetcon(event)) {
      continue;
    }
    const text = extractEventNarrativeText(event);
    if (!text) {
      continue;
    }
    if (containsAny(text, STRONG_RETCON_MARKERS)) {
      return 'retcon marker detected in generated event';
    }
    const newHasNegation = containsAny(text, NEGATION_MARKERS);
    for (const oldText of recentTexts) {
      if (!hasTokenOverlap(text, oldText)) {
        continue;
      }
      const oldHasNegation = containsAny(oldText, NEGATION_MARKERS);
      if (newHasNegation !== oldHasNegation) {
        return 'semantic polarity reversal against recent spine facts';
      }
    }
  }

  return null;
}

export function runNarrativeStep3Guard(input: {
  coreOutput: NarrativeCoreOutput;
  tensionTarget?: number;
  recentSpineEvents?: NarrativeSpineEvent[];
}): NarrativeGuardResult {
  const coreOutput = cloneCoreOutput(input.coreOutput);

  if (!hasOnlyCoreOutputWhitelistFields(coreOutput)) {
    return {
      status: 'REJECTED',
      reasonCode: NARRATIVE_REASON_CODES.NARRATIVE_GENERATION_SCHEMA_INVALID,
      actionHint: 'Repair CoreOutput schema contract and retry.',
      output: null,
      adjustmentReason: null,
    };
  }

  const eventCount = coreOutput.spineEvents.length;
  if (eventCount < NARRATIVE_GUARD_DEFAULTS.minEvents) {
    return {
      status: 'REJECTED',
      reasonCode: NARRATIVE_REASON_CODES.NARRATIVE_EVENT_COUNT_UNDERFLOW,
      actionHint: 'Raise minimum event output and retry.',
      output: null,
      adjustmentReason: null,
    };
  }

  for (const [metricKey, metricValue] of Object.entries(coreOutput.metrics)) {
    if (!isValidMetricValue(metricValue)) {
      return {
        status: 'REJECTED',
        reasonCode: NARRATIVE_REASON_CODES.NARRATIVE_GENERATION_SCHEMA_INVALID,
        actionHint: `Metric ${metricKey} is out of range [0..1].`,
        output: null,
        adjustmentReason: null,
      };
    }
  }

  for (const event of coreOutput.spineEvents) {
    if (!isValidVisibility(event.visibility)) {
      return {
        status: 'REJECTED',
        reasonCode: NARRATIVE_REASON_CODES.NARRATIVE_VISIBILITY_INVALID,
        actionHint: 'Enforce visibility enum and retry.',
        output: null,
        adjustmentReason: null,
      };
    }
    if (!isValidEventType(event.type)) {
      return {
        status: 'REJECTED',
        reasonCode: NARRATIVE_REASON_CODES.NARRATIVE_GENERATION_SCHEMA_INVALID,
        actionHint: 'Unsupported spine event type detected.',
        output: null,
        adjustmentReason: null,
      };
    }
    if (!isNonEmptyPayload(event.payload)) {
      return {
        status: 'REJECTED',
        reasonCode: NARRATIVE_REASON_CODES.NARRATIVE_GENERATION_SCHEMA_INVALID,
        actionHint: 'Spine event payload must be non-empty.',
        output: null,
        adjustmentReason: null,
      };
    }
  }

  const contradictionReason = detectSemanticContradiction({
    generated: coreOutput.spineEvents,
    recent: Array.isArray(input.recentSpineEvents) ? input.recentSpineEvents : [],
  });
  if (contradictionReason) {
    return {
      status: 'REJECTED',
      reasonCode: NARRATIVE_REASON_CODES.NARRATIVE_SEMANTIC_CONTRADICTION,
      actionHint: `Semantic contradiction detected: ${contradictionReason}`,
      output: null,
      adjustmentReason: null,
    };
  }

  if (eventCount > NARRATIVE_GUARD_DEFAULTS.maxEvents) {
    const adjusted = cloneCoreOutput(coreOutput);
    adjusted.spineEvents = adjusted.spineEvents.slice(0, NARRATIVE_GUARD_DEFAULTS.maxEvents);
    return {
      status: 'ADJUSTED',
      reasonCode: NARRATIVE_REASON_CODES.NARRATIVE_EVENT_COUNT_OVERFLOW_ADJUSTED,
      actionHint: 'Output is truncated and adjusted before commit.',
      output: adjusted,
      adjustmentReason: `spineEvents truncated to ${NARRATIVE_GUARD_DEFAULTS.maxEvents}`,
    };
  }

  const target = typeof input.tensionTarget === 'number'
    ? Math.max(0, Math.min(1, input.tensionTarget))
    : null;
  const observed = coreOutput.metrics.tension;
  if (target != null && typeof observed === 'number' && Number.isFinite(observed)) {
    const delta = Math.abs(observed - target);
    if (delta > NARRATIVE_GUARD_DEFAULTS.maxTensionDelta) {
      const adjusted = cloneCoreOutput(coreOutput);
      const direction = observed > target ? 1 : -1;
      const corrected = target + direction * NARRATIVE_GUARD_DEFAULTS.maxTensionDelta;
      adjusted.metrics.tension = Math.max(0, Math.min(1, corrected));
      return {
        status: 'ADJUSTED',
        reasonCode: NARRATIVE_REASON_CODES.NARRATIVE_TENSION_JUMP_ADJUSTED,
        actionHint: 'Tension delta exceeded threshold and was adjusted.',
        output: adjusted,
        adjustmentReason: `tension adjusted from ${observed.toFixed(3)} to ${adjusted.metrics.tension.toFixed(3)} against target ${target.toFixed(3)}`,
      };
    }
  }

  return {
    status: 'APPROVED',
    reasonCode: null,
    actionHint: 'guard-passed',
    output: coreOutput,
    adjustmentReason: null,
  };
}
