import { describe, expect, it } from "vitest";
import { createSeededRandom, hashChunkSeed } from "./seed";

describe("deterministic seed utilities", () => {
  it("repeats a chunk seed and random sequence exactly", () => {
    const seed = hashChunkSeed("classic-1991", -2, 17);
    const first = createSeededRandom(seed);
    const second = createSeededRandom(seed);

    expect(Array.from({ length: 8 }, () => first.next())).toEqual(
      Array.from({ length: 8 }, () => second.next()),
    );
  });

  it("changes the sequence when world coordinates change", () => {
    expect(hashChunkSeed("classic-1991", 3, 4)).not.toBe(
      hashChunkSeed("classic-1991", 3, 5),
    );
  });

  it("rejects invalid chunk coordinates", () => {
    expect(() => hashChunkSeed("seed", 0.5, 1)).toThrow(TypeError);
  });
});
