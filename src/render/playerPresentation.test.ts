import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PLAYER_FRAME_TARGET_EXTENTS,
  PLAYER_MIN_RENDERED_CONTENT_HEIGHT,
  PLAYER_TARGET_RENDERED_EXTENT,
  playerAtlasFrame,
  playerPresentationScale,
} from "./playerPresentation";

const atlas = JSON.parse(
  readFileSync("public/assets/production/freeski-atlas.json", "utf8"),
) as {
  frames: Record<string, { frame: { h: number; w: number } }>;
};

describe("production player presentation", () => {
  it("defines a readable contract for every production player frame", () => {
    const atlasFrames = Object.keys(atlas.frames)
      .filter((frameName) => frameName.startsWith("player/"))
      .sort();
    const contractedFrames = Object.keys(PLAYER_FRAME_TARGET_EXTENTS).sort();

    expect(contractedFrames).toEqual(atlasFrames);
    expect(contractedFrames).toHaveLength(24);
    for (const frameName of contractedFrames) {
      expect(
        PLAYER_FRAME_TARGET_EXTENTS[
          frameName as keyof typeof PLAYER_FRAME_TARGET_EXTENTS
        ],
        frameName,
      ).toBe(PLAYER_TARGET_RENDERED_EXTENT);
    }
  });

  it("scales trimmed content uniformly without conspicuous state pumping", () => {
    const renderedExtents: number[] = [];
    for (const [frameName, targetContentExtent] of Object.entries(
      PLAYER_FRAME_TARGET_EXTENTS,
    )) {
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
      expect(presentation.targetContentExtent, frameName).toBe(
        targetContentExtent,
      );
      expect(renderedExtent, frameName).toBeCloseTo(targetContentExtent, 8);
      expect(renderedHeight, frameName).toBeCloseTo(
        presentation.targetContentHeight,
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
    expect(PLAYER_MIN_RENDERED_CONTENT_HEIGHT).toBeGreaterThanOrEqual(24);
  });

  it("keeps unknown future frames readable", () => {
    expect(playerPresentationScale("player/future-pose", 60, 80)).toEqual({
      knownFrame: false,
      targetContentExtent: 48,
      targetContentHeight: 48,
      uniformScale: 0.6,
    });
  });

  it("uses visually audited poses for movement and airborne phases", () => {
    const pose = (
      overrides: Partial<Parameters<typeof playerAtlasFrame>[0]> = {},
    ) =>
      playerAtlasFrame({
        airHeight: 0,
        airPitch: 0,
        airSpin: 0,
        heading: "downhill",
        motion: "grounded",
        velocityX: 0,
        ...overrides,
      });

    expect(pose({ heading: "tuck" })).toBe("player/uphill-right");
    expect(pose({ heading: "carve-left-1" })).toBe("player/carve-left-1");
    expect(pose({ heading: "carve-left-3" })).toBe("player/hockey-stop-left");
    expect(pose({ heading: "carve-right-1" })).toBe("player/carve-left-2");
    expect(pose({ heading: "carve-right-3" })).toBe("player/carve-right-1");
    expect(pose({ motion: "airborne" })).toBe("player/jump-takeoff");
    expect(pose({ airHeight: 1, motion: "airborne" })).toBe("player/tuck");
    expect(pose({ airSpin: -1, motion: "airborne" })).toBe("player/spin-left");
    expect(pose({ airPitch: Math.PI / 2, motion: "airborne" })).toBe(
      "player/front-flip-1",
    );
    expect(pose({ airPitch: Math.PI, motion: "airborne" })).toBe(
      "player/air-neutral",
    );
    expect(pose({ motion: "crashed" })).toBe("player/wipeout");
  });
});
