import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const atlas = JSON.parse(
  readFileSync("public/assets/production/freeski-atlas.json", "utf8"),
) as {
  frames: Record<
    string,
    { frame: { h: number; w: number; x: number; y: number } }
  >;
};
const metadata = JSON.parse(
  readFileSync("public/assets/production/freeski-atlas.meta.json", "utf8"),
) as {
  approvedSourcesPreserved: boolean;
  atlas: { extrudedPaddingPixels: number };
  frameCount: number;
  frames: Record<
    string,
    {
      clearanceHeightMeters: number;
      footprint: { radiusMeters: number };
      groundPivot: { normalizedY: number };
      normalizationScale: number;
      sourceSha256: string;
      trimBounds: { height: number; width: number };
    }
  >;
};

describe("production atlas", () => {
  it("retains every approved frame with extruded padding metadata", () => {
    expect(metadata.approvedSourcesPreserved).toBe(true);
    expect(metadata.frameCount).toBe(112);
    expect(Object.keys(atlas.frames)).toHaveLength(112);
    expect(metadata.atlas.extrudedPaddingPixels).toBe(4);
    expect(Object.keys(atlas.frames)).toEqual(
      expect.arrayContaining([
        "player/downhill",
        "snowboarder/jump",
        "yeti/pounce-air",
        "terrain/rainbow-ramp",
        "course/blank-wood-sign",
        "vfx/crash-decal",
      ]),
    );
  });

  it("records trim, normalization, pivot and gameplay geometry per frame", () => {
    for (const [name, frame] of Object.entries(metadata.frames)) {
      expect(frame.sourceSha256, name).toMatch(/^[0-9a-f]{64}$/);
      expect(frame.trimBounds.width, name).toBeGreaterThan(0);
      expect(frame.trimBounds.height, name).toBeGreaterThan(0);
      expect(frame.normalizationScale, name).toBeGreaterThan(0);
      expect(frame.groundPivot.normalizedY, name).toBeGreaterThanOrEqual(0.5);
      expect(frame.groundPivot.normalizedY, name).toBeLessThanOrEqual(0.95);
      expect(frame.footprint.radiusMeters, name).toBeGreaterThanOrEqual(0);
      expect(frame.clearanceHeightMeters, name).toBeGreaterThanOrEqual(0);
    }
  });
});
