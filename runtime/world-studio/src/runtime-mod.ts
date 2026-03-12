import { type ModRuntimeClient } from "@nimiplatform/sdk/mod";
let _runtimeClient: ModRuntimeClient | null = null;
export function initializeWorldStudioRuntimeClient(runtimeClient: ModRuntimeClient): void {
    _runtimeClient = runtimeClient;
}
export function resetWorldStudioRuntimeClient(): void {
    _runtimeClient = null;
}
export function getWorldStudioRuntimeClient(): ModRuntimeClient {
    if (!_runtimeClient) {
        throw new Error('WORLD_STUDIO_RUNTIME_CLIENT_NOT_INITIALIZED');
    }
    return _runtimeClient;
}
