import { useState } from 'react';
import type { SupportedEncoding } from '../engine/encoding.js';
import type { Phase1Result, Phase2Result } from '../generation/pipeline.js';
import type { RetryScope } from '../services/event-graph-map.js';
import type { LandingState } from '../ui/types.js';
import { type RuntimeRouteOptionsSnapshot } from "@nimiplatform/sdk/mod";
export function useWorldStudioPageUiState() {
    const [landing, setLanding] = useState<LandingState>({
        target: 'NO_ACCESS',
        worldId: null,
        reason: null,
    });
    const [landingLoading, setLandingLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [conflictReloadSummary, setConflictReloadSummary] = useState<string | null>(null);
    const [phase1, setPhase1] = useState<Phase1Result | null>(null);
    const [phase2, setPhase2] = useState<Phase2Result | null>(null);
    const [sourceMode, setSourceMode] = useState<'TEXT' | 'FILE'>('TEXT');
    const [sourceEncoding, setSourceEncoding] = useState<SupportedEncoding>('utf-8');
    const [filePreviewText, setFilePreviewText] = useState('');
    const [routeOptions, setRouteOptions] = useState<RuntimeRouteOptionsSnapshot | null>(null);
    const [retryWithFineRoute, setRetryWithFineRoute] = useState(true);
    const [retryScope, setRetryScope] = useState<RetryScope>('all');
    const [retryConcurrency, setRetryConcurrency] = useState(2);
    const [retryErrorCode, setRetryErrorCode] = useState<string | null>(null);
    const [eventSyncMode, setEventSyncMode] = useState<'merge' | 'replace'>('merge');
    return {
        landing,
        setLanding,
        landingLoading,
        setLandingLoading,
        error,
        setError,
        notice,
        setNotice,
        conflictReloadSummary,
        setConflictReloadSummary,
        phase1,
        setPhase1,
        phase2,
        setPhase2,
        sourceMode,
        setSourceMode,
        sourceEncoding,
        setSourceEncoding,
        filePreviewText,
        setFilePreviewText,
        routeOptions,
        setRouteOptions,
        retryWithFineRoute,
        setRetryWithFineRoute,
        retryScope,
        setRetryScope,
        retryConcurrency,
        setRetryConcurrency,
        retryErrorCode,
        setRetryErrorCode,
        eventSyncMode,
        setEventSyncMode,
    };
}
