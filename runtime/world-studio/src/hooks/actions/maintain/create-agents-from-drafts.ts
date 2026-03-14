import { resolveWorldOwnedAgentHandle } from '../../../services/agent-handle.js';
import { findLinkedCreatorAgent } from '../../../services/creator-agent-link.js';
import { worldStudioMessage } from '../../../i18n/messages.js';
import type { WorldStudioMaintainActionContext } from './types.js';
import { asRecord } from "@nimiplatform/sdk/mod";

function toNullableTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

export async function createAgentsFromDrafts(
  context: WorldStudioMaintainActionContext,
  characterNames?: string[],
) {
  if (!context.selectedWorldId) {
    return;
  }
  const requestedNames = (characterNames && characterNames.length > 0
    ? characterNames
    : (context.snapshot.agentSync.selectedCharacterIds.length > 0
      ? context.snapshot.agentSync.selectedCharacterIds
      : context.snapshot.selectedCharacters))
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  const remoteAgents = Array.isArray(context.queries.creatorAgentsQuery.data)
    ? (context.queries.creatorAgentsQuery.data as Array<Record<string, unknown>>)
    : [];
  const usedHandleBases = new Set(
    remoteAgents
      .map((item) => String(item.handle || '').trim().replace(/^[@~]/, '').toLowerCase())
      .filter(Boolean),
  );
  const draftsByCharacter = context.snapshot.agentSync.draftsByCharacter || {};
  const pendingCharacters = requestedNames.filter((characterName) => (
    !findLinkedCreatorAgent({
      creatorAgents: remoteAgents,
      draft: draftsByCharacter[characterName],
      characterName,
      worldId: context.selectedWorldId,
    })
  ));
  const items = pendingCharacters
    .map((characterName, index) => {
      const draft = asRecord(draftsByCharacter[characterName]);
      const requestedHandle = String(draft.handle || '').trim();
      const handle = resolveWorldOwnedAgentHandle({
        requestedHandle,
        worldId: context.selectedWorldId,
        index,
        usedHandleBases,
      });
      const rulesRecord = asRecord(draft.rules);
      return {
        handle,
        concept: String(draft.concept || characterName || 'World character'),
        displayName: String(draft.characterName || characterName),
        ownershipType: 'WORLD_OWNED',
        worldId: context.selectedWorldId,
        ...(toNullableTrimmedString(draft.description) ? { description: toNullableTrimmedString(draft.description) } : {}),
        ...(toNullableTrimmedString(draft.scenario) ? { scenario: toNullableTrimmedString(draft.scenario) } : {}),
        ...(toNullableTrimmedString(draft.greeting) ? { greeting: toNullableTrimmedString(draft.greeting) } : {}),
        ...(toNullableTrimmedString(draft.exampleDialogue) ? { exampleDialogue: toNullableTrimmedString(draft.exampleDialogue) } : {}),
        ...(toNullableTrimmedString(draft.systemPromptBase) ? { systemPromptBase: toNullableTrimmedString(draft.systemPromptBase) } : {}),
        ...(Array.isArray(rulesRecord.lines) ? {
          rules: {
            format: 'rule-lines-v1',
            lines: normalizeStringArray(rulesRecord.lines),
            text: String(rulesRecord.text || normalizeStringArray(rulesRecord.lines).join('\n')),
          },
        } : {}),
        ...(toNullableTrimmedString(draft.postHistoryInstructions)
          ? { postHistoryInstructions: toNullableTrimmedString(draft.postHistoryInstructions) }
          : {}),
        ...(Array.isArray(draft.alternateGreetings) ? { alternateGreetings: normalizeStringArray(draft.alternateGreetings) } : {}),
        ...(Array.isArray(draft.agentLorebooks) ? { agentLorebooks: draft.agentLorebooks } : {}),
        ...(toNullableTrimmedString(draft.referenceImageUrl) ? { referenceImageUrl: toNullableTrimmedString(draft.referenceImageUrl) } : {}),
        ...(typeof draft.wakeStrategy === 'string' ? { wakeStrategy: draft.wakeStrategy } : {}),
        ...(typeof draft.dnaPrimary === 'string' && draft.dnaPrimary.trim() ? { dnaPrimary: draft.dnaPrimary } : {}),
        ...(Array.isArray(draft.dnaSecondary) ? { dnaSecondary: normalizeStringArray(draft.dnaSecondary) } : {}),
        ...(draft.dna && typeof draft.dna === 'object' && !Array.isArray(draft.dna) ? { dna: draft.dna } : {}),
      };
    });

  if (items.length === 0) {
    context.setNotice(worldStudioMessage('notice.agentCreateSkipped', 'No new draft agents need to be created.'));
    return;
  }

  context.setError(null);
  context.setNotice(null);
  const result = asRecord(await context.mutations.batchCreateCreatorAgentsMutation.mutateAsync({
    items,
    continueOnError: true,
  }));
  const createdCount = Array.isArray(result.created) ? result.created.length : 0;
  const failedCount = Array.isArray(result.failed) ? result.failed.length : 0;
  const createdItems = Array.isArray(result.created)
    ? result.created.map((item) => asRecord(item))
    : [];
  const firstCreatedAgentId = createdItems
    .map((item) => String(item.agentId || '').trim())
    .find(Boolean)
    || '';
  context.patchSnapshot({
    panel: {
      ...context.snapshot.panel,
      selectedAgentId: context.snapshot.panel.selectedAgentId || firstCreatedAgentId,
    },
    unsavedChangesByPanel: {
      ...context.snapshot.unsavedChangesByPanel,
      agentRegistry: false,
    },
  });
  await Promise.all([
    context.queries.creatorAgentsQuery.refetch(),
    context.queries.selectedAgentQuery.refetch(),
  ]);
  context.setStatusBanner({
    kind: failedCount > 0 ? 'warning' : 'success',
    message: worldStudioMessage('banner.agentCreateBatch', 'Agent batch create: {{created}} created, {{failed}} failed', {
      created: createdCount,
      failed: failedCount,
    }),
  });
  context.setNotice(worldStudioMessage('notice.agentCreateBatch', 'Created {{created}} agents for this world.', {
    created: createdCount,
  }));
}
