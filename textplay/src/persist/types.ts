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
};

export type TextplayPersistGetRunOp = {
  op: 'getRun';
  runId: string;
  afterSeq?: number;
  limit?: number;
};

export type TextplayPersistListByStoryOp = {
  op: 'listByStory';
  storyId: string;
  limit?: number;
};

export type TextplayPersistQuery =
  | TextplayPersistUpsertOp
  | TextplayPersistGetByTurnOp
  | TextplayPersistGetRunOp
  | TextplayPersistListByStoryOp;
