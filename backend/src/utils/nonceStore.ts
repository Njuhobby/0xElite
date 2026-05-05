import crypto from 'crypto';

interface Entry {
  nonce: string;
  expiresAt: number;
}

const store = new Map<string, Entry>();
const TTL_MS = 10 * 60 * 1000;

export function issueNonce(address: string): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  store.set(address.toLowerCase(), { nonce, expiresAt: Date.now() + TTL_MS });
  return nonce;
}

export function consumeNonce(address: string, nonce: string): boolean {
  const key = address.toLowerCase();
  const entry = store.get(key);
  if (!entry) return false;
  if (entry.expiresAt < Date.now()) {
    store.delete(key);
    return false;
  }
  if (entry.nonce !== nonce) return false;
  store.delete(key);
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of store.entries()) {
    if (v.expiresAt < now) store.delete(k);
  }
}, 60_000).unref();
