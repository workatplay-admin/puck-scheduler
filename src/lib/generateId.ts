/**
 * Returns a RFC 4122 v4 UUID string.
 *
 * Prefers `crypto.randomUUID()` when available (secure contexts only). Falls
 * back to a manual v4 construction backed by `crypto.getRandomValues` so the
 * helper still works under Vite dev served over a LAN IP, where the secure
 * context guarantee is absent and `crypto.randomUUID` is undefined.
 *
 * Throws if neither path is available — this should not happen in any browser
 * or modern Node we target.
 */
export const generateId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0'));
    return (
      hex.slice(0, 4).join('') +
      '-' + hex.slice(4, 6).join('') +
      '-' + hex.slice(6, 8).join('') +
      '-' + hex.slice(8, 10).join('') +
      '-' + hex.slice(10, 16).join('')
    );
  }

  throw new Error('generateId: no crypto API available');
};
