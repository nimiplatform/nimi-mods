import { createModKvStore, type HookStorageClient } from "@nimiplatform/sdk/mod";
const STORAGE_STATE_NAMESPACE = 'mint-you.session';
function getStore(storage: HookStorageClient) {
    return createModKvStore({
        storage,
        namespace: STORAGE_STATE_NAMESPACE,
    });
}
export async function readStoredState(storage: HookStorageClient, key: string): Promise<string | null> {
    try {
        return await getStore(storage).get(key);
    }
    catch {
        return null;
    }
}
export async function writeStoredState(storage: HookStorageClient, key: string, value: string): Promise<boolean> {
    try {
        await getStore(storage).set(key, value);
        return true;
    }
    catch {
        return false;
    }
}
export async function removeStoredState(storage: HookStorageClient, key: string): Promise<boolean> {
    try {
        await getStore(storage).delete(key);
        return true;
    }
    catch {
        return false;
    }
}
