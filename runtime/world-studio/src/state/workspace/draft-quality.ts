import type { Phase2WeakFieldIssue, Phase2WeakFieldReason } from '../../contracts.js';
import { asRecord } from "@nimiplatform/sdk/mod";

export function normalizePhase2WeakFieldReason(value: unknown): Phase2WeakFieldReason {
  const raw = String(value || '').trim();
  return raw === 'empty'
    || raw === 'low_information'
    || raw === 'low_evidence'
    || raw === 'incomplete_reference'
    ? raw
    : 'low_information';
}

export function normalizePhase2WeakFieldIssue(value: unknown): Phase2WeakFieldIssue | null {
  if (!value || typeof value !== 'object') return null;
  const record = asRecord(value);
  const path = String(record.path || '').trim();
  if (!path) return null;
  return {
    path,
    reason: normalizePhase2WeakFieldReason(record.reason),
    detail: String(record.detail || '').trim(),
  };
}

export function normalizePhase2WeakFieldIssues(value: unknown): Phase2WeakFieldIssue[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizePhase2WeakFieldIssue(item))
    .filter((item): item is Phase2WeakFieldIssue => Boolean(item));
}
