const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

let lastTime = 0;
let lastRandom = new Uint8Array(16);

function fillRandom(bytes: Uint8Array): void {
  const cryptoObject = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoObject && typeof cryptoObject.getRandomValues === 'function') {
    cryptoObject.getRandomValues(bytes);
    return;
  }
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
}

function encodeTime(timeMs: number): string {
  let value = Math.max(0, Math.floor(timeMs));
  const chars = new Array<string>(10);
  for (let i = 9; i >= 0; i -= 1) {
    chars[i] = CROCKFORD[value % 32] || '0';
    value = Math.floor(value / 32);
  }
  return chars.join('');
}

function incrementRandom(bytes: Uint8Array): void {
  for (let i = bytes.length - 1; i >= 0; i -= 1) {
    const current = bytes[i] || 0;
    if (current === 255) {
      bytes[i] = 0;
      continue;
    }
    bytes[i] = current + 1;
    return;
  }
}

function encodeRandom(bytes: Uint8Array): string {
  let bits = 0;
  let bitBuffer = 0;
  let output = '';

  for (let i = 0; i < bytes.length; i += 1) {
    bitBuffer = (bitBuffer << 8) | bytes[i]!;
    bits += 8;
    while (bits >= 5 && output.length < 16) {
      bits -= 5;
      const index = (bitBuffer >> bits) & 31;
      output += CROCKFORD[index] || '0';
    }
  }

  while (output.length < 16) {
    output += '0';
  }

  return output.slice(0, 16);
}

export function createUlid(nowMs?: number): string {
  const timeMs = typeof nowMs === 'number' && Number.isFinite(nowMs)
    ? Math.max(0, Math.floor(nowMs))
    : Date.now();

  const random = new Uint8Array(16);
  if (timeMs > lastTime) {
    fillRandom(random);
    lastTime = timeMs;
    lastRandom = random;
  } else {
    random.set(lastRandom);
    incrementRandom(random);
    lastRandom = random;
  }

  return `${encodeTime(timeMs)}${encodeRandom(random)}`;
}
