import { useCallback, useReducer, useState } from 'react';
import type { SupportedEncoding } from '../engine/encoding.js';
import type { Phase1Result, Phase2Result } from '../generation/pipeline.js';
import type { RetryScope } from '../services/event-graph-map.js';
import type { LandingState } from '../ui/types.js';
import { type RuntimeRouteOptionsSnapshot } from "@nimiplatform/sdk/mod";

type SourceState = {
  mode: 'TEXT' | 'FILE';
  encoding: SupportedEncoding;
  filePreviewText: string;
};

type RetryState = {
  withFineRoute: boolean;
  scope: RetryScope;
  concurrency: number;
  errorCode: string | null;
};

type NoticeState = {
  landing: LandingState;
  landingLoading: boolean;
  error: string | null;
  notice: string | null;
  conflictReloadSummary: string | null;
};

type SourceAction =
  | { type: 'SET_MODE'; mode: SourceState['mode'] }
  | { type: 'SET_ENCODING'; encoding: SupportedEncoding }
  | { type: 'SET_FILE_PREVIEW_TEXT'; value: string };

type RetryAction =
  | { type: 'SET_WITH_FINE_ROUTE'; value: boolean }
  | { type: 'SET_SCOPE'; value: RetryScope }
  | { type: 'SET_CONCURRENCY'; value: number }
  | { type: 'SET_ERROR_CODE'; value: string | null };

type NoticeAction =
  | { type: 'SET_LANDING'; value: LandingState }
  | { type: 'SET_LANDING_LOADING'; value: boolean }
  | { type: 'SET_ERROR'; value: string | null }
  | { type: 'SET_NOTICE'; value: string | null }
  | { type: 'SET_CONFLICT_RELOAD_SUMMARY'; value: string | null };

const INITIAL_SOURCE_STATE: SourceState = {
  mode: 'TEXT',
  encoding: 'utf-8',
  filePreviewText: '',
};

const INITIAL_RETRY_STATE: RetryState = {
  withFineRoute: true,
  scope: 'all',
  concurrency: 2,
  errorCode: null,
};

const INITIAL_NOTICE_STATE: NoticeState = {
  landing: {
    target: 'NO_ACCESS',
    worldId: null,
    reason: null,
  },
  landingLoading: true,
  error: null,
  notice: null,
  conflictReloadSummary: null,
};

function sourceReducer(state: SourceState, action: SourceAction): SourceState {
  if (action.type === 'SET_MODE') {
    return {
      ...state,
      mode: action.mode,
    };
  }
  if (action.type === 'SET_ENCODING') {
    return {
      ...state,
      encoding: action.encoding,
    };
  }
  return {
    ...state,
    filePreviewText: action.value,
  };
}

function retryReducer(state: RetryState, action: RetryAction): RetryState {
  if (action.type === 'SET_WITH_FINE_ROUTE') {
    return {
      ...state,
      withFineRoute: action.value,
    };
  }
  if (action.type === 'SET_SCOPE') {
    return {
      ...state,
      scope: action.value,
    };
  }
  if (action.type === 'SET_CONCURRENCY') {
    return {
      ...state,
      concurrency: action.value,
    };
  }
  return {
    ...state,
    errorCode: action.value,
  };
}

function noticeReducer(state: NoticeState, action: NoticeAction): NoticeState {
  if (action.type === 'SET_LANDING') {
    return {
      ...state,
      landing: action.value,
    };
  }
  if (action.type === 'SET_LANDING_LOADING') {
    return {
      ...state,
      landingLoading: action.value,
    };
  }
  if (action.type === 'SET_ERROR') {
    return {
      ...state,
      error: action.value,
    };
  }
  if (action.type === 'SET_NOTICE') {
    return {
      ...state,
      notice: action.value,
    };
  }
  return {
    ...state,
    conflictReloadSummary: action.value,
  };
}

export function useWorldStudioPageUiState() {
  const [noticeState, dispatchNotice] = useReducer(noticeReducer, INITIAL_NOTICE_STATE);
  const [sourceState, dispatchSource] = useReducer(sourceReducer, INITIAL_SOURCE_STATE);
  const [retryState, dispatchRetry] = useReducer(retryReducer, INITIAL_RETRY_STATE);
  const [phase1, setPhase1] = useState<Phase1Result | null>(null);
  const [phase2, setPhase2] = useState<Phase2Result | null>(null);
  const [routeOptions, setRouteOptions] = useState<RuntimeRouteOptionsSnapshot | null>(null);
  const [eventSyncMode, setEventSyncMode] = useState<'merge' | 'replace'>('merge');

  const setLanding = useCallback((value: LandingState) => {
    dispatchNotice({ type: 'SET_LANDING', value });
  }, []);

  const setLandingLoading = useCallback((value: boolean) => {
    dispatchNotice({ type: 'SET_LANDING_LOADING', value });
  }, []);

  const setError = useCallback((value: string | null) => {
    dispatchNotice({ type: 'SET_ERROR', value });
  }, []);

  const setNotice = useCallback((value: string | null) => {
    dispatchNotice({ type: 'SET_NOTICE', value });
  }, []);

  const setConflictReloadSummary = useCallback((value: string | null) => {
    dispatchNotice({ type: 'SET_CONFLICT_RELOAD_SUMMARY', value });
  }, []);

  const setSourceMode = useCallback((mode: SourceState['mode']) => {
    dispatchSource({ type: 'SET_MODE', mode });
  }, []);

  const setSourceEncoding = useCallback((encoding: SupportedEncoding) => {
    dispatchSource({ type: 'SET_ENCODING', encoding });
  }, []);

  const setFilePreviewText = useCallback((value: string) => {
    dispatchSource({ type: 'SET_FILE_PREVIEW_TEXT', value });
  }, []);

  const setRetryWithFineRoute = useCallback((value: boolean) => {
    dispatchRetry({ type: 'SET_WITH_FINE_ROUTE', value });
  }, []);

  const setRetryScope = useCallback((value: RetryScope) => {
    dispatchRetry({ type: 'SET_SCOPE', value });
  }, []);

  const setRetryConcurrency = useCallback((value: number) => {
    dispatchRetry({ type: 'SET_CONCURRENCY', value });
  }, []);

  const setRetryErrorCode = useCallback((value: string | null) => {
    dispatchRetry({ type: 'SET_ERROR_CODE', value });
  }, []);

  return {
    landing: noticeState.landing,
    setLanding,
    landingLoading: noticeState.landingLoading,
    setLandingLoading,
    error: noticeState.error,
    setError,
    notice: noticeState.notice,
    setNotice,
    conflictReloadSummary: noticeState.conflictReloadSummary,
    setConflictReloadSummary,
    phase1,
    setPhase1,
    phase2,
    setPhase2,
    sourceMode: sourceState.mode,
    setSourceMode,
    sourceEncoding: sourceState.encoding,
    setSourceEncoding,
    filePreviewText: sourceState.filePreviewText,
    setFilePreviewText,
    routeOptions,
    setRouteOptions,
    retryWithFineRoute: retryState.withFineRoute,
    setRetryWithFineRoute,
    retryScope: retryState.scope,
    setRetryScope,
    retryConcurrency: retryState.concurrency,
    setRetryConcurrency,
    retryErrorCode: retryState.errorCode,
    setRetryErrorCode,
    eventSyncMode,
    setEventSyncMode,
  };
}
