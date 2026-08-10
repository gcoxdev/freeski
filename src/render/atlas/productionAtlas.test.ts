import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

interface DecodedPng {
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly width: number;
}

function decodeRgbaPng(path: string): DecodedPng {
  const png = readFileSync(path);
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  let offset = 8;
  let width = 0;
  let height = 0;
  const compressed: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      expect([...data.subarray(8, 13)]).toEqual([8, 6, 0, 0, 0]);
    } else if (type === "IDAT") compressed.push(data);
    offset += length + 12;
    if (type === "IEND") break;
  }
  const encoded = inflateSync(Buffer.concat(compressed));
  const stride = width * 4;
  const pixels = new Uint8Array(stride * height);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = encoded[sourceOffset++]!;
    if (filter > 4) throw new Error(`unsupported PNG filter ${filter}`);
    for (let x = 0; x < stride; x += 1) {
      const raw = encoded[sourceOffset++]!;
      const left = x >= 4 ? pixels[y * stride + x - 4]! : 0;
      const above = y > 0 ? pixels[(y - 1) * stride + x]! : 0;
      const upperLeft = y > 0 && x >= 4 ? pixels[(y - 1) * stride + x - 4]! : 0;
      let value = raw;
      if (filter === 1) value += left;
      else if (filter === 2) value += above;
      else if (filter === 3) value += Math.floor((left + above) / 2);
      else if (filter === 4) value += paeth(left, above, upperLeft);
      pixels[y * stride + x] = value & 0xff;
    }
  }
  return { height, pixels, width };
}

function paeth(left: number, above: number, upperLeft: number): number {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance)
    return left;
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

const atlas = JSON.parse(
  readFileSync("public/assets/production/freeski-atlas.json", "utf8"),
) as {
  frames: Record<
    string,
    {
      frame: { h: number; w: number; x: number; y: number };
      sourceSize: { h: number; w: number };
      spriteSourceSize: { h: number; w: number; x: number; y: number };
    }
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
      runtimeSourceSize: { height: number; width: number };
      runtimeTrimBounds: {
        height: number;
        width: number;
        x: number;
        y: number;
      };
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

  it("keeps every packed frame and Phaser trim in one runtime coordinate system", () => {
    for (const [name, packed] of Object.entries(atlas.frames)) {
      const source = packed.sourceSize;
      const trim = packed.spriteSourceSize;
      const frameMetadata = metadata.frames[name]!;
      expect(trim.w, name).toBe(packed.frame.w);
      expect(trim.h, name).toBe(packed.frame.h);
      expect(trim.x, name).toBeGreaterThanOrEqual(0);
      expect(trim.y, name).toBeGreaterThanOrEqual(0);
      expect(trim.x + trim.w, name).toBeLessThanOrEqual(source.w);
      expect(trim.y + trim.h, name).toBeLessThanOrEqual(source.h);
      expect(frameMetadata.runtimeTrimBounds, name).toEqual({
        height: trim.h,
        width: trim.w,
        x: trim.x,
        y: trim.y,
      });
      expect(frameMetadata.runtimeSourceSize, name).toEqual({
        height: source.h,
        width: source.w,
      });
    }
  });

  it("pixel-audits genuine extrusion, padding overlap, and trim geometry", () => {
    const png = decodeRgbaPng("public/assets/production/freeski-atlas.png");
    const padding = metadata.atlas.extrudedPaddingPixels;
    const paddedRectangles: Array<{
      bottom: number;
      left: number;
      name: string;
      right: number;
      top: number;
    }> = [];
    let nonEmptyBands = 0;
    let extrusionMismatchPixels = 0;
    for (const [name, packed] of Object.entries(atlas.frames)) {
      const { h, w, x, y } = packed.frame;
      paddedRectangles.push({
        bottom: y + h + padding,
        left: x - padding,
        name,
        right: x + w + padding,
        top: y - padding,
      });
      const sides = [
        { edge: [x, y, 0, 1], start: [x - padding, y], steps: [0, 1] },
        { edge: [x + w - 1, y, 0, 1], start: [x + w, y], steps: [0, 1] },
        { edge: [x, y, 1, 0], start: [x, y - padding], steps: [1, 0] },
        { edge: [x, y + h - 1, 1, 0], start: [x, y + h], steps: [1, 0] },
      ] as const;
      for (const [sideIndex, side] of sides.entries()) {
        const length = sideIndex < 2 ? h : w;
        let hasContent = false;
        for (let along = 0; along < length; along += 1) {
          const expectedX = side.edge[0] + side.edge[2] * along;
          const expectedY = side.edge[1] + side.edge[3] * along;
          const expectedOffset = (expectedY * png.width + expectedX) * 4;
          for (let outward = 0; outward < padding; outward += 1) {
            const actualX =
              side.start[0] +
              side.steps[0] * along +
              (sideIndex < 2 ? outward : 0);
            const actualY =
              side.start[1] +
              side.steps[1] * along +
              (sideIndex >= 2 ? outward : 0);
            const actualOffset = (actualY * png.width + actualX) * 4;
            let matches = true;
            for (let channel = 0; channel < 4; channel += 1)
              if (
                png.pixels[actualOffset + channel] !==
                png.pixels[expectedOffset + channel]
              )
                matches = false;
            if (!matches) extrusionMismatchPixels += 1;
            if (png.pixels[actualOffset + 3]! > 0) hasContent = true;
          }
        }
        if (hasContent) nonEmptyBands += 1;
      }
    }
    expect(nonEmptyBands).toBe(448);
    expect(extrusionMismatchPixels).toBe(0);
    for (let first = 0; first < paddedRectangles.length; first += 1) {
      for (
        let second = first + 1;
        second < paddedRectangles.length;
        second += 1
      ) {
        const a = paddedRectangles[first]!;
        const b = paddedRectangles[second]!;
        const overlaps =
          a.left < b.right &&
          a.right > b.left &&
          a.top < b.bottom &&
          a.bottom > b.top;
        expect(overlaps, `${a.name} overlaps ${b.name}`).toBe(false);
      }
    }
  });
});
