import type { HookClient } from '@nimiplatform/sdk/mod/types';
import {
  MINTYOU_DATA_API_AGENTS_CREATE,
  MINTYOU_REASON,
} from '../contracts.js';
import { emitMintYouLog } from '../logging.js';
import { extractCreateAgentId } from '../realm-contract.js';
import type {
  BasicInfo,
  TraitExtractionResult,
  DnaSynthesisOutput,
  MintYouResult,
} from '../types.js';
import type {
  DnaPrimaryType,
  DnaSecondaryTrait,
  RelationshipMode,
  FormalityValue,
  SentimentValue,
  MbtiValue,
} from '../contracts.js';
import { assembleCreateAgentDto } from './dto-assemble.js';
import { generateHandle } from '../utils/slug.js';

const MAX_HANDLE_RETRIES = 3;

type AgentCreateInput = {
  hookClient: HookClient;
  basicInfo: BasicInfo;
  traitResult: TraitExtractionResult;
  dnaSynthesis: DnaSynthesisOutput;
  interests: string[];
  worldId: string;
  referenceImageUrl?: string | null;
  selfReportedMbti?: MbtiValue | null;
  traitOverrides?: {
    dnaPrimary?: DnaPrimaryType;
    dnaSecondary?: DnaSecondaryTrait[];
    relationshipMode?: RelationshipMode;
    formality?: FormalityValue;
    sentiment?: SentimentValue;
  } | null;
  existingAgentId?: string | null;
};

type AgentCreateResult = {
  agentId: string;
};

function isHandleConflictError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error || '');
  return /(\b409\b|conflict|already exists|already taken|duplicate key|handle[_\s-]?(taken|exists|unavailable)|mintyou_handle_unavailable)/i.test(msg);
}

function isAgentLimitError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error || '');
  return msg.includes('LIMIT') || msg.includes('limit') || msg.includes('maximum');
}

async function tryCreateAgent(
  hookClient: HookClient,
  dto: Record<string, unknown>,
): Promise<MintYouResult<AgentCreateResult>> {
  try {
    const response = await hookClient.data.query({
      capability: MINTYOU_DATA_API_AGENTS_CREATE,
      query: dto,
    });

    const agentId = extractCreateAgentId(response);
    if (!agentId) {
      return {
        ok: false,
        error: {
          reasonCode: MINTYOU_REASON.AGENT_CREATE_FAILED,
          message: 'Agent creation failed: creator.agents.create returned no agent id.',
          actionHint: 'Check backend response shape and runtime capability wiring.',
        },
      };
    }
    return { ok: true, data: { agentId } };
  } catch (error) {
    if (isHandleConflictError(error)) {
      return {
        ok: false,
        error: {
          reasonCode: MINTYOU_REASON.HANDLE_UNAVAILABLE,
          message: 'Handle is already taken.',
          actionHint: 'Retrying automatically with a new handle.',
        },
      };
    }
    if (isAgentLimitError(error)) {
      return {
        ok: false,
        error: {
          reasonCode: MINTYOU_REASON.AGENT_LIMIT_REACHED,
          message: 'You have reached the maximum number of agents (5).',
          actionHint: 'Remove an existing agent before creating a new one.',
        },
      };
    }
    const msg = error instanceof Error ? error.message : String(error || '');
    return {
      ok: false,
      error: {
        reasonCode: MINTYOU_REASON.AGENT_CREATE_FAILED,
        message: `Agent creation failed: ${msg}`,
        actionHint: 'Check agent creation payload and backend availability.',
      },
    };
  }
}

export async function createAgent(
  input: AgentCreateInput,
): Promise<MintYouResult<AgentCreateResult>> {
  const {
    hookClient,
    basicInfo,
    traitResult,
    dnaSynthesis,
    interests,
    worldId,
    referenceImageUrl,
    selfReportedMbti,
    traitOverrides,
    existingAgentId,
  } = input;

  // Idempotency guard: if already created in this session, return existing
  if (existingAgentId) {
    emitMintYouLog({
      level: 'info',
      message: 'action:agent-create:idempotent-skip',
      source: 'createAgent',
      details: { agentId: existingAgentId },
    });
    return { ok: true, data: { agentId: existingAgentId } };
  }

  // Retry loop: generate handle + create agent, retry on handle conflict
  for (let attempt = 0; attempt < MAX_HANDLE_RETRIES; attempt++) {
    const handle = generateHandle(basicInfo.displayName);

    const dto = assembleCreateAgentDto({
      handle,
      basicInfo,
      traitResult,
      dnaSynthesis,
      interests,
      worldId,
      referenceImageUrl,
      selfReportedMbti,
      traitOverrides,
    });

    const result = await tryCreateAgent(
      hookClient,
      dto as unknown as Record<string, unknown>,
    );

    if (result.ok) {
      emitMintYouLog({
        level: 'info',
        message: 'action:agent-create:done',
        source: 'createAgent',
        details: { agentId: result.data.agentId, handle, attempt },
      });
      return result;
    }

    // Only retry on handle conflict
    if (result.error.reasonCode !== MINTYOU_REASON.HANDLE_UNAVAILABLE) {
      emitMintYouLog({
        level: 'error',
        message: 'action:agent-create:error',
        source: 'createAgent',
        details: { reasonCode: result.error.reasonCode, attempt },
      });
      return result;
    }

    emitMintYouLog({
      level: 'warn',
      message: 'action:agent-create:handle-conflict-retry',
      source: 'createAgent',
      details: { handle, attempt },
    });
  }

  return {
    ok: false,
    error: {
      reasonCode: MINTYOU_REASON.HANDLE_UNAVAILABLE,
      message: `Failed to generate a unique handle after ${MAX_HANDLE_RETRIES} attempts.`,
      actionHint: 'Retry creation. The system will generate a new handle automatically.',
    },
  };
}
