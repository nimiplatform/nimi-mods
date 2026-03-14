import { createModKvStore, type HookStorageClient } from "@nimiplatform/sdk/mod";
const MINT_YOU_HOST_STATE_NAMESPACE = 'mint-you.session';

// Mint-You keeps lightweight session/auth state in the host-provided mod storage facade.
function getHostStateStore(storage: HookStorageClient) {
    return createModKvStore({
        storage,
        namespace: MINT_YOU_HOST_STATE_NAMESPACE,
    });
}
export async function readStoredState(storage: HookStorageClient, key: string): Promise<string | null> {
    try {
        return await getHostStateStore(storage).get(key);
    }
    catch {
        return null;
    }
}
export async function writeStoredState(storage: HookStorageClient, key: string, value: string): Promise<boolean> {
    try {
        await getHostStateStore(storage).set(key, value);
        return true;
    }
    catch {
        return false;
    }
}
export async function removeStoredState(storage: HookStorageClient, key: string): Promise<boolean> {
    try {
        await getHostStateStore(storage).delete(key);
        return true;
    }
    catch {
        return false;
    }
}
