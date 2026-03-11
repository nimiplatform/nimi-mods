function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function parseRuntimeRouteOptions(payload: unknown): {
  selected: {
    source: string;
    connectorId: string;
    model: string;
  };
  resolvedDefault: Record<string, unknown>;
  local: Record<string, unknown>;
  connectors: unknown[];
} | null {
  const record = asRecord(payload);
  const selected = asRecord(record.selected);
  const source = String(selected.source || '').trim();
  const connectorId = String(selected.connectorId || '').trim();
  const model = String(selected.model || '').trim();
  if (!source || !connectorId || !model) {
    return null;
  }
  return {
    selected: {
      source,
      connectorId,
      model,
    },
    resolvedDefault: asRecord(record.resolvedDefault),
    local: asRecord(record.local),
    connectors: Array.isArray(record.connectors) ? record.connectors : [],
  };
}
