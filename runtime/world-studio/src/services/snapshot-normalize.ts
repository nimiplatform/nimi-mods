import { asRecord } from '@nimiplatform/sdk/mod/utils';
import type { WorldStudioLandingMode } from '../contracts.js';
import type { LandingState } from '../ui/types.js';

export function parseLorebooksArrayInput(raw: string): Array<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(String(raw || '[]'));
    if (!Array.isArray(parsed)) {
      throw new Error('lorebooks must be an array');
    }
    return parsed
      .filter((item) => item && typeof item === 'object')
      .map((item) => item as Record<string, unknown>);
  } catch (error) {
    throw new Error(`lorebooks JSON invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function validateWorldviewPatchInput(worldview: Record<string, unknown>): string[] {
  const requiredModules = ['timeModel', 'spaceTopology', 'causality', 'coreSystem'] as const;
  return requiredModules
    .filter((moduleKey) => {
      const value = worldview[moduleKey];
      return !value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value as Record<string, unknown>).length === 0;
    })
    .map((moduleKey) => `missing_or_empty:${moduleKey}`);
}

export function validateLorebooksInput(lorebooks: Array<Record<string, unknown>>): string[] {
  const errors: string[] = [];
  const seenKeys = new Set<string>();
  lorebooks.forEach((item, index) => {
    const key = String(item.key || '').trim();
    if (!key) {
      errors.push(`row_${index + 1}:missing_key`);
      return;
    }
    if (seenKeys.has(key)) {
      errors.push(`row_${index + 1}:duplicate_key:${key}`);
    } else {
      seenKeys.add(key);
    }
    // value is optional if content is provided
    const hasContent = typeof item.content === 'string' && item.content.trim().length > 0;
    const hasValue = item.value && typeof item.value === 'object' && !Array.isArray(item.value);
    if (!hasContent && !hasValue) {
      errors.push(`row_${index + 1}:missing_content_or_value`);
    }
    if (item.provenance != null && (typeof item.provenance !== 'object' || Array.isArray(item.provenance))) {
      errors.push(`row_${index + 1}:invalid_provenance_object`);
    }
  });
  return errors;
}

export function parseLooseArray(raw: string): Array<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(String(raw || '[]'));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>>;
  } catch {
    return [];
  }
}

export function toUniqueStringArray(items: string[]): string[] {
  return [...new Set(items.map((item) => String(item || '').trim()).filter((item) => Boolean(item)))];
}

export function deriveLandingFromAccess(payload: Record<string, unknown>): LandingState {
  const hasActiveAccess = Boolean(payload.hasActiveAccess);
  const canCreateWorld = Boolean(payload.canCreateWorld);
  const canMaintainWorld = Boolean(payload.canMaintainWorld);
  const records = Array.isArray(payload.records)
    ? payload.records.filter((item) => item && typeof item === 'object')
    : [];

  const scopedWorldId = records
    .map((item) => asRecord(item).scopeWorldId)
    .find((value) => typeof value === 'string' && String(value).trim().length > 0);

  if (!hasActiveAccess) {
    return { target: 'NO_ACCESS', worldId: null, reason: 'NO_ACTIVE_ACCESS' };
  }
  if (canMaintainWorld && typeof scopedWorldId === 'string' && scopedWorldId.trim()) {
    return { target: 'MAINTAIN', worldId: scopedWorldId.trim(), reason: null };
  }
  if (canCreateWorld) {
    return { target: 'CREATE', worldId: null, reason: null };
  }
  return { target: 'NO_ACCESS', worldId: null, reason: 'NO_CREATE_OR_MAINTAIN_SCOPE' };
}

export function normalizeLandingTarget(rawTarget: unknown): WorldStudioLandingMode {
  const normalized = String(rawTarget || '').trim().toUpperCase();
  if (normalized === 'CREATE' || normalized === 'MAINTAIN' || normalized === 'NO_ACCESS') {
    return normalized;
  }
  return 'NO_ACCESS';
}

export function getTimeFlowRatioFromWorldPatch(worldPatch: Record<string, unknown>): string {
  const ratio = worldPatch.timeFlowRatio;
  if (typeof ratio === 'number' && Number.isFinite(ratio)) {
    return String(ratio);
  }
  return '';
}

export function getCurrentTimeNodeFromWorldviewPatch(worldviewPatch: Record<string, unknown>): string {
  const timeModel = asRecord(worldviewPatch.timeModel);
  const currentNode = timeModel.currentNode;
  return typeof currentNode === 'string' ? currentNode : '';
}
