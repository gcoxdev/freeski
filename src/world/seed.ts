import { GENERATOR_VERSION } from "./generatorVersion";

const UINT32_MAX_PLUS_ONE = 0x1_0000_0000;

/** Stable FNV-1a hash. It intentionally avoids runtime or platform hash functions. */
export function hashSeed(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function hashChunkSeed(
  worldSeed: string,
  chunkX: number,
  chunkY: number,
): number {
  if (!Number.isInteger(chunkX) || !Number.isInteger(chunkY)) {
    throw new TypeError("Chunk coordinates must be integers");
  }
  return hashSeed(`${GENERATOR_VERSION}:${worldSeed}:${chunkX}:${chunkY}`);
}

export interface SeededRandom {
  next(): number;
  nextInt(maxExclusive: number): number;
}

export function createSeededRandom(seed: number): SeededRandom {
  let state = seed >>> 0;
  return {
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / UINT32_MAX_PLUS_ONE;
    },
    nextInt(maxExclusive: number): number {
      if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
        throw new RangeError("maxExclusive must be a positive safe integer");
      }
      return Math.floor(this.next() * maxExclusive);
    },
  };
}
