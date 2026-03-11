import type { EventNodeDraft } from '../../../contracts.js';

export function detectDependencyDiagnostics(graph: {
  primary: EventNodeDraft[];
  secondary: EventNodeDraft[];
}) {
  const allEvents = [...graph.primary, ...graph.secondary];
  const idSet = new Set(allEvents.map((item) => String(item.id || '').trim()).filter(Boolean));
  const selfReferenceIds: string[] = [];
  const missingDependencyRefs: Array<{ eventId: string; dependencyId: string }> = [];
  const edges = new Map<string, string[]>();

  allEvents.forEach((event) => {
    const eventId = String(event.id || '').trim();
    if (!eventId) return;
    const deps = [...new Set(
      (Array.isArray(event.dependsOnEventIds) ? event.dependsOnEventIds : [])
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    )];
    edges.set(eventId, deps);
    deps.forEach((depId) => {
      if (depId === eventId) {
        selfReferenceIds.push(eventId);
      }
      if (!idSet.has(depId)) {
        missingDependencyRefs.push({ eventId, dependencyId: depId });
      }
    });
  });

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const cycleNodes = new Set<string>();

  const walk = (nodeId: string) => {
    if (visiting.has(nodeId)) {
      cycleNodes.add(nodeId);
      return;
    }
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    visiting.add(nodeId);
    const deps = edges.get(nodeId) || [];
    deps.forEach((depId) => {
      if (!idSet.has(depId)) return;
      if (visiting.has(depId)) {
        cycleNodes.add(nodeId);
        cycleNodes.add(depId);
        return;
      }
      walk(depId);
    });
    visiting.delete(nodeId);
  };

  Array.from(idSet.values()).forEach((id) => walk(id));
  const primaryIdSet = new Set(graph.primary.map((item) => String(item.id || '').trim()).filter(Boolean));
  const orphanSecondaryIds = graph.secondary
    .filter((item) => !item.parentEventId || !primaryIdSet.has(String(item.parentEventId || '').trim()))
    .map((item) => String(item.id || '').trim())
    .filter(Boolean);

  return {
    missingDependencyRefs,
    selfReferenceIds: [...new Set(selfReferenceIds)],
    cycleNodeIds: [...cycleNodes],
    orphanSecondaryIds,
  };
}

export function buildDiagnosticsSummary(input: {
  missingDependencyCount: number;
  selfReferenceCount: number;
  cycleNodeCount: number;
  orphanSecondaryCount: number;
  missingEvidencePrimaryCount: number;
}) {
  const issues = [
    input.missingDependencyCount > 0 ? `Missing deps: ${input.missingDependencyCount}` : null,
    input.selfReferenceCount > 0 ? `Self refs: ${input.selfReferenceCount}` : null,
    input.cycleNodeCount > 0 ? `Cycle nodes: ${input.cycleNodeCount}` : null,
    input.orphanSecondaryCount > 0 ? `Orphan secondary events: ${input.orphanSecondaryCount}` : null,
    input.missingEvidencePrimaryCount > 0 ? `Primary missing evidence: ${input.missingEvidencePrimaryCount}` : null,
  ].filter((item): item is string => Boolean(item));
  return {
    hasIssues: issues.length > 0,
    issueLines: issues,
  };
}
