import { useCallback, useEffect } from 'react';
import { getMyWorldAccess, resolveWorldLanding } from '../data.js';
import { deriveLandingFromAccess, normalizeLandingTarget, } from '../services/snapshot-normalize.js';
import { emitWorldStudioLog } from '../logging.js';
import type { LandingState } from '../ui/types.js';
import { type createHookClient, type createModRuntimeClient, asRecord, type RuntimeRouteBinding, type RuntimeRouteOptionsSnapshot } from "@nimiplatform/sdk/mod";
type UseWorldStudioBootstrapInput = {
    bootstrapReady: boolean;
    flowId: string;
    hookClient: ReturnType<typeof createHookClient>;
    runtimeClient: ReturnType<typeof createModRuntimeClient>;
    runtimeDefaultRouteBinding: RuntimeRouteBinding | null;
    setRouteOptions: (value: RuntimeRouteOptionsSnapshot | null) => void;
    setLanding: (value: LandingState) => void;
    setLandingLoading: (value: boolean) => void;
    setError: (value: string | null) => void;
};
export function useWorldStudioBootstrap(input: UseWorldStudioBootstrapInput) {
    const loadRuntimeRouteOptions = useCallback(async () => {
        try {
            const options = await input.runtimeClient.route.listOptions({
                capability: 'text.generate',
            });
            input.setRouteOptions(options);
        }
        catch {
            input.setRouteOptions(null);
        }
    }, [input.runtimeClient.route, input.setRouteOptions]);
    const resolveRuntimeDefaultRouteBinding = useCallback(async () => {
        if (input.runtimeDefaultRouteBinding) {
            return input.runtimeDefaultRouteBinding;
        }
        try {
            const options = await input.runtimeClient.route.listOptions({
                capability: 'text.generate',
            });
            input.setRouteOptions(options);
            return options.resolvedDefault || options.selected;
        }
        catch {
            // no-op
        }
        return null;
    }, [input.runtimeClient.route, input.runtimeDefaultRouteBinding, input.setRouteOptions]);
    const loadLanding = useCallback(async () => {
        input.setLandingLoading(true);
        input.setError(null);
        try {
            const payload = asRecord(await resolveWorldLanding(input.hookClient));
            const target = normalizeLandingTarget(payload.target);
            const worldId = String(payload.worldId || '').trim() || null;
            const reason = String(payload.reason || '').trim() || null;
            if (target === 'NO_ACCESS' && !reason) {
                const accessPayload = asRecord(await getMyWorldAccess(input.hookClient));
                input.setLanding(deriveLandingFromAccess(accessPayload));
            }
            else {
                input.setLanding({ target, worldId, reason });
            }
            emitWorldStudioLog({
                level: 'info',
                message: 'world:landing-resolve:done',
                flowId: input.flowId,
                source: 'WorldStudioPage.loadLanding',
                details: { target, worldId },
            });
        }
        catch (loadError) {
            const message = loadError instanceof Error ? loadError.message : String(loadError);
            input.setError(message);
            try {
                const accessPayload = asRecord(await getMyWorldAccess(input.hookClient));
                input.setLanding(deriveLandingFromAccess(accessPayload));
            }
            catch {
                input.setLanding({
                    target: 'NO_ACCESS',
                    worldId: null,
                    reason: 'LANDING_QUERY_FAILED',
                });
            }
            emitWorldStudioLog({
                level: 'warn',
                message: 'world:landing-resolve:failed',
                flowId: input.flowId,
                source: 'WorldStudioPage.loadLanding',
                details: { error: message },
            });
        }
        finally {
            input.setLandingLoading(false);
        }
    }, [input.flowId, input.hookClient, input.setError, input.setLanding, input.setLandingLoading]);
    useEffect(() => {
        if (!input.bootstrapReady)
            return;
        void loadRuntimeRouteOptions();
    }, [input.bootstrapReady, loadRuntimeRouteOptions]);
    useEffect(() => {
        if (!input.bootstrapReady)
            return;
        void loadLanding();
    }, [input.bootstrapReady, loadLanding]);
    return {
        loadLanding,
        loadRuntimeRouteOptions,
        resolveRuntimeDefaultRouteBinding,
    };
}
