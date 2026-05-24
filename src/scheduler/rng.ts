/**
 * Generates a non-degenerate 32-bit unsigned seed via `(random * 2^32) >>> 0`,
 * which avoids the zero-seed degenerate case from `Math.floor(...)`.
 */
export const generateSeed = (): number => (Math.random() * 2 ** 32) >>> 0;

/**
 * mulberry32 PRNG — fast 32-bit generator suitable for scheduling workloads.
 *
 * @param seed - 32-bit unsigned integer seed.
 * @returns A stateful function that returns floats in [0, 1).
 */
export const mulberry32 = (seed: number): () => number => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
