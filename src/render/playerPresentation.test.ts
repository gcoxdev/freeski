import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PLAYER_FRAME_TARGET_EXTENTS,
  PLAYER_MIN_RENDERED_CONTENT_HEIGHT,
  PLAYER_TARGET_RENDERED_EXTENT,
  playerAtlasFrame,
  playerGroundAnchorOffset,
  playerPresentationScale,
} from "./playerPresentation";

const atlas = JSON.parse(
  readFileSync("public/assets/production/freeski-atlas.json", "utf8"),
) as {
  frames: Record<
    string,
    {
      frame: { h: number; w: number };
      sourceSize: { h: number; w: number };
      spriteSourceSize: { h: number; w: number; x: number; y: number };
    }
  >;
};

describe("production player presentation", () => {
  it("compensates for transparent room below grounded cells", () => {
    expect(playerGroundAnchorOffset(145, 23, 97, 48 / 97)).toBeCloseTo(
      ((145 * 0.94 - 120) * 48) / 97,
      6,
    );
    expect(playerGroundAnchorOffset(134, 37, 97, 48 / 97)).toBeCloseTo(
      ((134 * 0.94 - 134) * 48) / 97,
      6,
    );
    expect(playerGroundAnchorOffset(0, 0, 0, 0)).toBe(0);
  });

  it("keeps downhill and tuck visible ski lines at the same anchor", () => {
    const offsets = ["player/heading-downhill", "player/tuck"].map(
      (frameName) => {
        const packed = atlas.frames[frameName]!;
        const presentation = playerPresentationScale(
          frameName,
          packed.frame.w,
          packed.frame.h,
        );
        const compensation = playerGroundAnchorOffset(
          packed.sourceSize.h,
          packed.spriteSourceSize.y,
          packed.spriteSourceSize.h,
          presentation.uniformScale,
        );
        return (
          compensation +
          (packed.spriteSourceSize.y +
            packed.spriteSourceSize.h -
            packed.sourceSize.h * 0.94) *
            presentation.uniformScale
        );
      },
    );
    expect(offsets[1]).toBeCloseTo(offsets[0]!, 6);
  });

  it("defines a readable contract for all 24 player frames", () => {
    const atlasFrames = Object.keys(atlas.frames)
      .filter((frameName) => frameName.startsWith("player/"))
      .sort();
    const contractedFrames = Object.keys(PLAYER_FRAME_TARGET_EXTENTS).sort();

    expect(contractedFrames).toEqual(atlasFrames);
    expect(contractedFrames).toHaveLength(24);
    expect(contractedFrames).toEqual(
      expect.arrayContaining([
        "player/heading-left-stop",
        "player/heading-downhill",
        "player/heading-right-stop",
        "player/crash-laying",
        "player/runover-laying",
        "player/rotation-180",
      ]),
    );
  });

  it("scales every pose uniformly without state pumping", () => {
    const renderedExtents: number[] = [];
    for (const frameName of Object.keys(PLAYER_FRAME_TARGET_EXTENTS)) {
      const packed = atlas.frames[frameName]!.frame;
      const presentation = playerPresentationScale(
        frameName,
        packed.w,
        packed.h,
      );
      const renderedHeight = packed.h * presentation.uniformScale;
      const renderedWidth = packed.w * presentation.uniformScale;
      const renderedExtent = Math.max(renderedWidth, renderedHeight);

      expect(presentation.knownFrame, frameName).toBe(true);
      expect(renderedExtent, frameName).toBeCloseTo(
        PLAYER_TARGET_RENDERED_EXTENT,
        8,
      );
      expect(renderedWidth / renderedHeight, frameName).toBeCloseTo(
        packed.w / packed.h,
        8,
      );
      renderedExtents.push(renderedExtent);
    }
    expect(Math.min(...renderedExtents)).toBe(PLAYER_TARGET_RENDERED_EXTENT);
    expect(Math.max(...renderedExtents)).toBe(PLAYER_TARGET_RENDERED_EXTENT);
    expect(PLAYER_MIN_RENDERED_CONTENT_HEIGHT).toBeGreaterThanOrEqual(16);
  });

  it("keeps unknown future frames readable", () => {
    expect(playerPresentationScale("player/future-pose", 60, 80)).toEqual({
      knownFrame: false,
      targetContentExtent: 48,
      targetContentHeight: 48,
      uniformScale: 0.6,
    });
  });

  it("maps seven headings directly to seven source cells", () => {
    const pose = (
      overrides: Partial<Parameters<typeof playerAtlasFrame>[0]> = {},
    ) =>
      playerAtlasFrame({
        airHeight: 0,
        airPitch: 0,
        crashKind: "impact",
        heading: "downhill",
        motion: "grounded",
        trickPose: "none",
        tucking: false,
        ...overrides,
      });

    for (const heading of [
      "left-stop",
      "left-60",
      "left-30",
      "downhill",
      "right-30",
      "right-60",
      "right-stop",
    ] as const)
      expect(pose({ heading })).toBe(`player/heading-${heading}`);
    expect(pose({ tucking: true })).toBe("player/tuck");
  });

  it("uses every rotation, trick and distinct crash pose", () => {
    const pose = (
      overrides: Partial<Parameters<typeof playerAtlasFrame>[0]> = {},
    ) =>
      playerAtlasFrame({
        airHeight: 1,
        airPitch: 0,
        crashKind: "impact",
        heading: "downhill",
        motion: "airborne",
        trickPose: "none",
        tucking: false,
        ...overrides,
      });

    expect(pose()).toBe("player/air-neutral");
    for (let step = 1; step <= 7; step += 1)
      expect(pose({ airPitch: (step * Math.PI) / 4 })).toBe(
        `player/rotation-${String(step * 45).padStart(3, "0")}`,
      );
    expect(pose({ airPitch: Math.PI * 2 })).toBe("player/air-neutral");
    expect(pose({ airPitch: Math.PI * 2 + Math.PI / 4 })).toBe(
      "player/rotation-045",
    );
    expect(pose({ airPitch: Math.PI * 4 + Math.PI / 2 })).toBe(
      "player/rotation-090",
    );
    for (const trickPose of [
      "spread",
      "daffy",
      "twist-left",
      "twist-right",
    ] as const)
      expect(pose({ trickPose })).toBe(`player/trick-${trickPose}`);
    expect(pose({ motion: "crashed" })).toBe("player/crash-laying");
    expect(pose({ crashKind: "runover", motion: "crashed" })).toBe(
      "player/runover-laying",
    );
  });
});
