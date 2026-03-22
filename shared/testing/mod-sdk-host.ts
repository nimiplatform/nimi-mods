import {
  clearModSdkHost as clearSdkModHost,
  setModSdkHost as setSdkModHost,
} from '@nimiplatform/sdk/mod';

const MOD_SDK_HOST_KEY = '__NIMI_MOD_SDK_HOST__';

export function setModSdkHost(host: unknown): void {
  (globalThis as Record<string, unknown>)[MOD_SDK_HOST_KEY] = host;
  setSdkModHost(host as Parameters<typeof setSdkModHost>[0]);
}

export function clearModSdkHost(): void {
  delete (globalThis as Record<string, unknown>)[MOD_SDK_HOST_KEY];
  clearSdkModHost();
}
