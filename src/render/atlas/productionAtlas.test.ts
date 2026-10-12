import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { chairCableOffset, CHAIR_HANGERS } from "../liftPresentation";
import { MOGUL_FOOTPRINT, MOGUL_PATCH } from "../../world/mogulPatch";
import { touchesFootprint } from "../../simulation/footprintContact";

interface DecodedPng {
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly width: number;
}

function pixelDifferenceRatio(
  png: Readonly<DecodedPng>,
  firstName: string,
  secondName: string,
): number {
  const first = atlas.frames[firstName]!.frame;
  const second = atlas.frames[secondName]!.frame;
  const width = Math.min(first.w, second.w);
  const height = Math.min(first.h, second.h);
  const firstOffsetX = Math.floor((first.w - width) / 2);
  const secondOffsetX = Math.floor((second.w - width) / 2);
  const firstOffsetY = first.h - height;
  const secondOffsetY = second.h - height;
  let changed = 0;
  const total = width * height;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const firstOffset =
        ((first.y + firstOffsetY + y) * png.width +
          first.x +
          firstOffsetX +
          x) *
        4;
      const secondOffset =
        ((second.y + secondOffsetY + y) * png.width +
          second.x +
          secondOffsetX +
          x) *
        4;
      let different = false;
      for (let channel = 0; channel < 4; channel += 1)
        if (
          png.pixels[firstOffset + channel] !==
          png.pixels[secondOffset + channel]
        )
          different = true;
      if (different) changed += 1;
    }
  }
  return changed / total;
}

function horizontalSilhouetteSimilarity(
  png: Readonly<DecodedPng>,
  frameName: string,
): number {
  const frame = atlas.frames[frameName]!.frame;
  let intersection = 0;
  let union = 0;
  for (let y = 0; y < frame.h; y += 1) {
    for (let x = 0; x < frame.w; x += 1) {
      const leftAlpha =
        png.pixels[((frame.y + y) * png.width + frame.x + x) * 4 + 3]!;
      const rightAlpha =
        png.pixels[
          ((frame.y + y) * png.width + frame.x + frame.w - 1 - x) * 4 + 3
        ]!;
      const leftOpaque = leftAlpha > 8;
      const rightOpaque = rightAlpha > 8;
      if (leftOpaque || rightOpaque) union += 1;
      if (leftOpaque && rightOpaque) intersection += 1;
    }
  }
  return union > 0 ? intersection / union : 0;
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
      edgeBleedComponentsRemoved: number;
      footprint: { radiusMeters: number };
      groundPivot: { normalizedY: number };
      normalizationFamily: string;
      normalizationScale: number;
      runtimeSourceSize: { height: number; width: number };
      runtimeTrimBounds: {
        height: number;
        width: number;
        x: number;
        y: number;
      };
      sourceSha256: string;
      trimBounds: { height: number; width: number; x: number; y: number };
    }
  >;
  pipelineVersion: string;
};

describe("production atlas", () => {
  it("attaches every chair pose to its cable in either travel direction", () => {
    const png = decodeRgbaPng("public/assets/production/freeski-atlas.png");
    for (const name of Object.keys(CHAIR_HANGERS)) {
      const frame = atlas.frames[name]!;
      const opaqueX: number[] = [];
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < frame.frame.w; x++) {
          const alpha =
            png.pixels[
              ((frame.frame.y + y) * png.width + frame.frame.x + x) * 4 + 3
            ]!;
          if (alpha > 100) opaqueX.push(x);
        }
      }
      expect(opaqueX.length, name).toBeGreaterThan(0);
      const hangerX =
        frame.spriteSourceSize.x +
        (Math.min(...opaqueX) + Math.max(...opaqueX)) / 2;
      for (const flipX of [false, true]) {
        const renderedOffset =
          (hangerX - frame.sourceSize.w / 2) *
          (58 / frame.sourceSize.h) *
          (flipX ? -1 : 1);
        expect(
          renderedOffset + chairCableOffset(name, flipX, 58),
          name,
        ).toBeCloseTo(0, 2);
      }
    }
  });
  it("preserves complete feet and a shared body scale through the lateral run cycle", () => {
    const frames = ["a", "b", "c", "d"].map(
      (phase) => atlas.frames[`yeti/run-side-${phase}`]!,
    );
    for (const frame of frames) {
      expect(frame.spriteSourceSize.x).toBeGreaterThan(0);
      expect(frame.spriteSourceSize.x + frame.frame.w).toBeLessThan(
        frame.sourceSize.w,
      );
    }
    expect(new Set(frames.map((frame) => frame.sourceSize.h)).size).toBe(1);
    expect(frames[1]!.frame.w).toBeLessThan(frames[0]!.frame.w * 0.8);
    expect(frames[3]!.frame.h).toBeLessThan(frames[2]!.frame.h);
  });
  it("retains every approved frame with extruded padding metadata", () => {
    expect(metadata.approvedSourcesPreserved).toBe(true);
    expect(metadata.pipelineVersion).toBe("freeski-atlas-v3");
    expect(metadata.frameCount).toBe(122);
    expect(Object.keys(atlas.frames)).toHaveLength(122);
    expect(metadata.atlas.extrudedPaddingPixels).toBe(4);
    expect(Object.keys(atlas.frames)).toEqual(
      expect.arrayContaining([
        "player/heading-downhill",
        "snowboarder/jump",
        "yeti/pounce-air",
        "terrain/rainbow-ramp",
        "lift/terminal",
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

  it("covers every visible mogul snow pixel with its gameplay footprint", () => {
    const png = decodeRgbaPng("public/assets/production/freeski-atlas.png");
    const frame = atlas.frames["terrain/mogul-field"]!;
    expect(frame.sourceSize).toEqual({
      w: MOGUL_PATCH.sourceWidth,
      h: MOGUL_PATCH.sourceHeight,
    });
    const misses: number[][] = [];
    for (let y = 0; y < frame.frame.h; y += 1) {
      for (let x = 0; x < frame.frame.w; x += 1) {
        if (
          png.pixels[
            ((frame.frame.y + y) * png.width + frame.frame.x + x) * 4 + 3
          ]! <= 8
        )
          continue;
        const worldX =
          ((x + frame.spriteSourceSize.x - frame.sourceSize.w / 2) *
            MOGUL_PATCH.heightMeters) /
          frame.sourceSize.h;
        const worldY =
          ((y +
            frame.spriteSourceSize.y -
            frame.sourceSize.h * MOGUL_PATCH.originY) *
            MOGUL_PATCH.heightMeters) /
            frame.sourceSize.h +
          MOGUL_PATCH.drawOffsetYMeters;
        if (!touchesFootprint(worldX, worldY, 0, MOGUL_FOOTPRINT))
          misses.push([x, y]);
      }
    }
    expect(misses).toEqual([]);
    expect(metadata.frames["terrain/mogul-field"]!.footprint).toMatchObject({
      shape: "polygon",
    });
    expect(
      metadata.frames["terrain/mogul-field"]!.footprint.radiusMeters,
    ).toBeCloseTo(MOGUL_FOOTPRINT.radius);
  });

  it("keeps corrected heading cells isolated and consistently normalized", () => {
    const leftStop = metadata.frames["player/heading-left-stop"]!;
    const leftThirty = metadata.frames["player/heading-left-30"]!;
    const rightStop = metadata.frames["player/heading-right-stop"]!;
    expect(leftStop.trimBounds).toMatchObject({
      height: 210,
      width: 184,
      y: 23,
    });
    expect(leftStop.trimBounds.y + leftStop.trimBounds.height).toBeLessThan(
      256,
    );
    expect(leftThirty.trimBounds).toMatchObject({ height: 195, width: 220 });
    expect(rightStop.trimBounds.y).toBeGreaterThan(15);
    expect(rightStop.trimBounds.height).toBeGreaterThan(190);
    expect(rightStop.normalizationFamily).toBe("player");
  });

  it("keeps lateral gait phases grounded at one runtime scale", () => {
    const leftA = metadata.frames["yeti/run-left-a"]!;
    const leftB = metadata.frames["yeti/run-left-b"]!;
    const rightA = metadata.frames["yeti/run-right-a"]!;
    const rightB = metadata.frames["yeti/run-right-b"]!;
    // Opposite whole-body contact poses may have slightly different stride
    // widths; they must retain one ground line, height and runtime family.
    expect(
      Math.abs(leftB.trimBounds.width - leftA.trimBounds.width),
    ).toBeLessThanOrEqual(12);
    expect(
      Math.abs(rightB.trimBounds.width - rightA.trimBounds.width),
    ).toBeLessThanOrEqual(12);
    expect(rightB.trimBounds.height).toBe(rightA.trimBounds.height);
    expect(leftB.runtimeSourceSize).toEqual(leftA.runtimeSourceSize);
    expect(rightB.runtimeSourceSize).toEqual(rightA.runtimeSourceSize);
    expect(leftB.normalizationScale).toBe(leftA.normalizationScale);
    expect(rightB.normalizationScale).toBe(rightA.normalizationScale);
    expect(leftA.trimBounds.y + leftA.trimBounds.height).toBe(
      leftB.trimBounds.y + leftB.trimBounds.height,
    );
    expect(rightA.trimBounds.y + rightA.trimBounds.height).toBe(
      rightB.trimBounds.y + rightB.trimBounds.height,
    );

    const treeA = metadata.frames["walking-tree/step-left"]!;
    const treeB = metadata.frames["walking-tree/step-right"]!;
    expect(
      Math.abs(treeB.trimBounds.width - treeA.trimBounds.width),
    ).toBeLessThanOrEqual(12);
    expect(treeB.trimBounds.height).toBe(treeA.trimBounds.height);
    expect(treeB.runtimeSourceSize).toEqual(treeA.runtimeSourceSize);
    expect(treeB.normalizationScale).toBe(treeA.normalizationScale);
    expect(treeA.trimBounds.y + treeA.trimBounds.height).toBe(
      treeB.trimBounds.y + treeB.trimBounds.height,
    );

    const png = decodeRgbaPng("public/assets/production/freeski-atlas.png");
    expect(
      pixelDifferenceRatio(png, "yeti/run-left-a", "yeti/run-left-b"),
    ).toBeGreaterThan(0.1);
    expect(
      pixelDifferenceRatio(png, "yeti/run-right-a", "yeti/run-right-b"),
    ).toBeGreaterThan(0.1);
    expect(
      pixelDifferenceRatio(
        png,
        "walking-tree/step-left",
        "walking-tree/step-right",
      ),
    ).toBeGreaterThan(0.1);
  });

  it("keeps all four walking-tree phases distinct on the same grounded canvas", () => {
    const names = ["a", "b", "c", "d"].map(
      (phase) => `walking-tree/walk-${phase}`,
    );
    const first = metadata.frames[names[0]!]!;
    const png = decodeRgbaPng("public/assets/production/freeski-atlas.png");
    for (const [index, name] of names.entries()) {
      const frame = metadata.frames[name]!;
      expect(frame.runtimeSourceSize).toEqual(first.runtimeSourceSize);
      expect(frame.normalizationScale).toBe(first.normalizationScale);
      expect(frame.trimBounds.y + frame.trimBounds.height).toBe(
        first.trimBounds.y + first.trimBounds.height,
      );
      expect(
        pixelDifferenceRatio(png, name, names[(index + 1) % 4]!),
      ).toBeGreaterThan(0.1);
    }
  });

  it("uses a centered, vertical downhill tuck without neighboring fragments", () => {
    const tuck = metadata.frames["player/tuck"]!;
    expect(tuck.trimBounds.width / tuck.trimBounds.height).toBeLessThan(0.7);
    expect(tuck.trimBounds.x).toBeGreaterThan(60);
    expect(tuck.trimBounds.x + tuck.trimBounds.width).toBeLessThan(196);
    expect(tuck.edgeBleedComponentsRemoved).toBe(0);
    const png = decodeRgbaPng("public/assets/production/freeski-atlas.png");
    expect(horizontalSilhouetteSimilarity(png, "player/tuck")).toBeGreaterThan(
      0.9,
    );
  });

  it("removes neighboring-cell fragments before trimming", () => {
    expect(metadata.frames["player/tuck"]!.edgeBleedComponentsRemoved).toBe(0);
    expect(metadata.frames["terrain/rock"]!.edgeBleedComponentsRemoved).toBe(1);
    expect(
      Object.values(metadata.frames).reduce(
        (total, frame) => total + frame.edgeBleedComponentsRemoved,
        0,
      ),
    ).toBeGreaterThan(60);
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
    expect(nonEmptyBands).toBe(metadata.frameCount * 4);
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
