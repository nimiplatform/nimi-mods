import type { TextplayPersistRecord } from '../types.js';

export type TextplayPersistUpsertOp = {
  op: 'upsert';
  record: Omit<TextplayPersistRecord, 'id' | 'createdAt' | 'updatedAt'> & {
    id?: string;
    createdAt?: string;
    updatedAt?: string;
  };
};

export type TextplayPersistGetByTurnOp = {
  op: 'getByTurn';
  storyId: string;
  turnId: string;
  worldId?: string;
  agentId?: string;
};

export type TextplayPersistGetRunOp = {
  op: 'getRun';
  runId: string;
  storyId?: string;
  worldId?: string;
  agentId?: string;
  playerId?: string;
  afterSeq?: number;
  limit?: number;
};

export type TextplayPersistListByStoryOp = {
  op: 'listByStory';
  storyId: string;
  worldId?: string;
  agentId?: string;
  playerId?: string;
  limit?: number;
};

export type TextplayPersistQuery =
  | TextplayPersistUpsertOp
  | TextplayPersistGetByTurnOp
  | TextplayPersistGetRunOp
  | TextplayPersistListByStoryOp;
