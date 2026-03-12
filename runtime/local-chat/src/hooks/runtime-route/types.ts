import { type ModRuntimeClient, type RuntimeRouteBinding, type RuntimeRouteOptionsSnapshot } from "@nimiplatform/sdk/mod";
export type ChatRouteSnapshot = {
    source: string;
    provider: string;
    model: string;
    endpoint: string;
    connectorId: string;
    localModelId?: string;
    goRuntimeLocalModelId?: string;
    goRuntimeStatus?: string;
};
export type UseLocalChatRuntimeRouteInput = {
    runtimeClient: ModRuntimeClient['route'];
    setStatusBanner: (input: {
        kind: 'warning' | 'error' | 'success' | 'info';
        message: string;
    }) => void;
};
export type LocalChatRouteStateSetters = {
    setRouteSnapshot: (value: ChatRouteSnapshot | null) => void;
    setChatRouteOptions: (value: RuntimeRouteOptionsSnapshot | null) => void;
    setHealthStatus: (value: 'idle' | 'checking' | 'healthy' | 'unreachable') => void;
    setCheckingHealth: (value: boolean) => void;
};
