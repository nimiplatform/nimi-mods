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

export function runNarrativeStep3Guard(input: {
  coreOutput: NarrativeCoreOutput;
  tensionTarget?: number;
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
