import { type HookDataClient } from "@nimiplatform/sdk/mod";
const MOD_STATE_CAPABILITY = 'data.store.mod-state';
function extractStateValue(response: unknown): string | null {
    if (typeof response === 'string')
        return response;
    if (!response || typeof response !== 'object')
        return null;
    const record = response as Record<string, unknown>;
    if ('ok' in record && record.ok === false)
        return null;
    if (typeof record.value === 'string')
        return record.value;
    return null;
}
function extractStateAck(response: unknown): boolean {
    if (!response || typeof response !== 'object')
        return true;
    const record = response as Record<string, unknown>;
    if (typeof record.ok === 'boolean') {
        return record.ok;
    }
    return true;
}
export async function readModState(dataClient: HookDataClient, key: string): Promise<string | null> {
    try {
        const response = await dataClient.query({
            capability: MOD_STATE_CAPABILITY,
            query: { op: 'get', key },
        });
        return extractStateValue(response);
    }
    catch {
        return null;
    }
}
export async function writeModState(dataClient: HookDataClient, key: string, value: string): Promise<boolean> {
    try {
        const response = await dataClient.query({
            capability: MOD_STATE_CAPABILITY,
            query: { op: 'set', key, value },
        });
        return extractStateAck(response);
    }
    catch {
        return false;
    }
}
export async function removeModState(dataClient: HookDataClient, key: string): Promise<boolean> {
    try {
        const response = await dataClient.query({
            capability: MOD_STATE_CAPABILITY,
            query: { op: 'delete', key },
        });
        return extractStateAck(response);
    }
    catch {
        return false;
    }
}
