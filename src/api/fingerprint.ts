export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

const STORAGE_KEY = 'device-fingerprint';
const FORMAT = /^[0-9a-f]{32}$/;

/**
 * Stable device id: 32 hex chars (16 random bytes), created once and kept in localStorage.
 * Unlike the session tokens it is not a secret — it identifies the device, it does not authenticate.
 */
export function getOrCreateFingerprint(storage: KeyValueStorage): string {
  const existing = storage.getItem(STORAGE_KEY);
  if (existing && FORMAT.test(existing)) return existing;

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const fingerprint = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  try {
    storage.setItem(STORAGE_KEY, fingerprint);
  } catch {
    // Storage blocked (private mode): the id still works for this page's lifetime.
  }
  return fingerprint;
}
