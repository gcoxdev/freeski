import { describe, expect, it } from "vitest";
import { crossedWorldBoundaries, WORLD_BOUNDARIES_METERS } from "./boundaries";

describe("classic mountain boundary data", () => {
  it("keeps researched thresholds in world meters", () => {
    expect(WORLD_BOUNDARIES_METERS).toEqual({
      topYeti: -125,
      bottomYeti: 2_000,
      leftYeti: -1_000,
      rightYeti: 1_000,
    });
  });

  it("reports only boundaries strictly outside the mountain", () => {
    expect(crossedWorldBoundaries(-1_001, 2_001)).toEqual(["bottom", "left"]);
    expect(crossedWorldBoundaries(0, 2_000)).toEqual([]);
  });
});
