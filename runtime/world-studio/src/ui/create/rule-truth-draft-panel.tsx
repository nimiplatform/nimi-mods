import React, { useMemo, useState } from 'react';
import type { WorldStudioWorkspaceSnapshot } from '../../contracts.js';
import { useModTranslation } from "@nimiplatform/sdk/mod";

type RuleTruthDraftPanelProps = {
  ruleTruthDraft: WorldStudioWorkspaceSnapshot['ruleTruthDraft'];
  onRuleTruthDraftChange: (value: WorldStudioWorkspaceSnapshot['ruleTruthDraft']) => void;
};

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function parseJsonArray(text: string): Record<string, unknown>[] | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) {
      return null;
    }
    return parsed
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)));
  } catch {
    return null;
  }
}

function parseAgentRuleArray(text: string): WorldStudioWorkspaceSnapshot['ruleTruthDraft']['agentRules'] | null {
  const parsed = parseJsonArray(text);
  if (!parsed) {
    return null;
  }
  return parsed
    .map((item) => ({
      characterName: String(item.characterName || '').trim(),
      payload: item.payload && typeof item.payload === 'object' && !Array.isArray(item.payload)
        ? item.payload as Record<string, unknown>
        : {},
    }))
    .filter((item) => Boolean(item.characterName));
}

export function RuleTruthDraftPanel(props: RuleTruthDraftPanelProps) {
  const { t } = useModTranslation('world-studio');
  const worldRulesText = useMemo(() => formatJson(props.ruleTruthDraft.worldRules || []), [props.ruleTruthDraft.worldRules]);
  const agentRulesText = useMemo(() => formatJson(props.ruleTruthDraft.agentRules || []), [props.ruleTruthDraft.agentRules]);
  const [worldRulesInput, setWorldRulesInput] = useState(worldRulesText);
  const [agentRulesInput, setAgentRulesInput] = useState(agentRulesText);

  React.useEffect(() => {
    setWorldRulesInput(worldRulesText);
  }, [worldRulesText]);

  React.useEffect(() => {
    setAgentRulesInput(agentRulesText);
  }, [agentRulesText]);

  const parsedWorldRules = parseJsonArray(worldRulesInput);
  const parsedAgentRules = parseAgentRuleArray(agentRulesInput);
  const hasWorldRulesError = worldRulesInput.trim().length > 0 && parsedWorldRules == null;
  const hasAgentRulesError = agentRulesInput.trim().length > 0 && parsedAgentRules == null;

  return (
    <section className="ui-sync-card ui-sync-card-inset p-4">
      <h3 className="text-sm font-semibold text-gray-900">
        {t('draftEditor.ruleTruthTitle', 'Rule truth draft')}
      </h3>
      <p className="mt-1 text-xs text-gray-500">
        {t('draftEditor.ruleTruthDescription', 'Worldview and lorebooks are projections. Edit the publishable WorldRule and AgentRule draft directly here.')}
      </p>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <label className="block text-xs text-gray-700">
          <span className="mb-1 block font-medium">
            {t('draftEditor.worldRulesJson', 'World rules (JSON array)')}
          </span>
          <textarea
            className="h-72 w-full rounded-md border border-gray-300 p-2 font-mono text-xs"
            value={worldRulesInput}
            onChange={(event) => {
              const nextValue = event.target.value;
              setWorldRulesInput(nextValue);
              const nextRules = parseJsonArray(nextValue);
              if (!nextRules) return;
              props.onRuleTruthDraftChange({
                ...props.ruleTruthDraft,
                worldRules: nextRules,
              });
            }}
          />
          {hasWorldRulesError ? (
            <span className="mt-1 block text-[11px] text-red-600">
              {t('draftEditor.ruleTruthInvalidWorldRules', 'World rules must be a valid JSON array of objects.')}
            </span>
          ) : null}
        </label>

        <label className="block text-xs text-gray-700">
          <span className="mb-1 block font-medium">
            {t('draftEditor.agentRulesJson', 'Agent rules (JSON array)')}
          </span>
          <textarea
            className="h-72 w-full rounded-md border border-gray-300 p-2 font-mono text-xs"
            value={agentRulesInput}
            onChange={(event) => {
              const nextValue = event.target.value;
              setAgentRulesInput(nextValue);
              const nextRules = parseAgentRuleArray(nextValue);
              if (!nextRules) return;
              props.onRuleTruthDraftChange({
                ...props.ruleTruthDraft,
                agentRules: nextRules,
              });
            }}
          />
          {hasAgentRulesError ? (
            <span className="mt-1 block text-[11px] text-red-600">
              {t('draftEditor.ruleTruthInvalidAgentRules', 'Agent rules must be a valid JSON array with characterName and payload.')}
            </span>
          ) : null}
        </label>
      </div>
    </section>
  );
}
