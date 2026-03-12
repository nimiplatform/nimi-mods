import type { LocalChatTarget } from '../../data/index.js';
import { asRecord } from "@nimiplatform/sdk/mod";
export function toTargets(value: unknown): LocalChatTarget[] {
    const list = Array.isArray(value)
        ? value
        : (asRecord(value).items && Array.isArray(asRecord(value).items)
            ? asRecord(value).items as unknown[]
            : []);
    return list
        .filter((item) => item && typeof item === 'object')
        .map((item) => item as LocalChatTarget);
}
type TargetNameLike = Pick<LocalChatTarget, 'displayName' | 'handle'>;
export function getTargetInitial(target: TargetNameLike): string {
    const name = String(target.displayName || target.handle || '').trim();
    return (name.charAt(0) || 'A').toUpperCase();
}
