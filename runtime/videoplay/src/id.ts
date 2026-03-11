const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function toByte(value: number): number {
  return value & 0xff;
}

function toHex(bytes: Uint8Array): string {
  let output = '';
  for (const value of bytes) {
    output += value.toString(16).padStart(2, '0');
  }
  return output;
}

function fromHexByte(hex: string): number {
  return Number.parseInt(hex, 16) & 0xff;
}

function encodeUlidFromBytes(bytes: Uint8Array): string {
  let hi = 0n;
  let lo = 0n;

  for (let i = 0; i < 8; i += 1) {
    hi = (hi << 8n) | BigInt(bytes[i] || 0);
  }
  for (let i = 8; i < 16; i += 1) {
    lo = (lo << 8n) | BigInt(bytes[i] || 0);
  }

  const value = (hi << 64n) | lo;
  let cursor = value;
  const chars: string[] = [];
  for (let i = 0; i < 26; i += 1) {
    const index = Number(cursor & 31n);
    chars.push(CROCKFORD[index] || '0');
    cursor >>= 5n;
  }
  return chars.reverse().join('');
}

function randomBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    cryptoApi.getRandomValues(bytes);
    return bytes;
  }
  for (let i = 0; i < size; i += 1) {
    bytes[i] = toByte(Math.floor(Math.random() * 256));
  }
  return bytes;
}

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function expandSeed(seed: string, size: number): Uint8Array {
  const chunks: number[] = [];
  let cursor = seed;
  while (chunks.length < size) {
    cursor = `${cursor}:${fnv1aHex(cursor)}`;
    const digest = fnv1aHex(cursor);
    for (let i = 0; i < digest.length && chunks.length < size; i += 2) {
      chunks.push(fromHexByte(digest.slice(i, i + 2)));
    }
  }
  return Uint8Array.from(chunks);
}

export function createUlid(): string {
  const bytes = new Uint8Array(16);
  const now = Date.now();
  for (let i = 5; i >= 0; i -= 1) {
    bytes[i] = toByte(now >> ((5 - i) * 8));
  }
  bytes.set(randomBytes(10), 6);
  return encodeUlidFromBytes(bytes);
}

export function createDeterministicUlid(seed: string): string {
  const normalized = String(seed || '').trim() || 'videoplay';
  const expanded = expandSeed(normalized, 16);
  const timestampSeed = expandSeed(`ts:${normalized}`, 6);
  expanded.set(timestampSeed, 0);
  return encodeUlidFromBytes(expanded);
}

export function createHash(input: string): string {
  const normalized = String(input || '');
  const bytes = expandSeed(normalized, 16);
  return toHex(bytes);
}
