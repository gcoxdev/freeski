import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PLAYER_FRAME_CONTENT_HEIGHTS,
  PLAYER_MIN_RENDERED_CONTENT_HEIGHT,
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
    const contractedFrames = Object.keys(PLAYER_FRAME_CONTENT_HEIGHTS).sort();

    expect(contractedFrames).toEqual(atlasFrames);
    expect(contractedFrames).toHaveLength(24);
    for (const frameName of contractedFrames) {
      expect(
        PLAYER_FRAME_CONTENT_HEIGHTS[
          frameName as keyof typeof PLAYER_FRAME_CONTENT_HEIGHTS
        ],
        frameName,
      ).toBeGreaterThanOrEqual(PLAYER_MIN_RENDERED_CONTENT_HEIGHT);
    }
  });

  it("scales trimmed content uniformly without conspicuous state pumping", () => {
    const renderedHeights: number[] = [];
    for (const [frameName, targetContentHeight] of Object.entries(
      PLAYER_FRAME_CONTENT_HEIGHTS,
    )) {
      const packed = atlas.frames[frameName]!.frame;
      const presentation = playerPresentationScale(frameName, packed.h);
      const renderedHeight = packed.h * presentation.uniformScale;
      const renderedWidth = packed.w * presentation.uniformScale;

      expect(presentation.knownFrame, frameName).toBe(true);
      expect(presentation.targetContentHeight, frameName).toBe(
        targetContentHeight,
      );
      expect(renderedHeight, frameName).toBeCloseTo(targetContentHeight, 8);
      expect(renderedWidth / renderedHeight, frameName).toBeCloseTo(
        packed.w / packed.h,
        8,
      );
      renderedHeights.push(renderedHeight);
    }

    expect(Math.min(...renderedHeights)).toBeGreaterThanOrEqual(
      PLAYER_MIN_RENDERED_CONTENT_HEIGHT,
    );
    expect(
      Math.max(...renderedHeights) / Math.min(...renderedHeights),
    ).toBeCloseTo(44 / 42, 8);
  });

  it("keeps unknown future frames readable", () => {
    expect(playerPresentationScale("player/future-pose", 80)).toEqual({
      knownFrame: false,
      targetContentHeight: 42,
      uniformScale: 0.525,
    });
  });

  it("uses visually audited poses for movement and airborne phases", () => {
    const pose = (
      overrides: Partial<Parameters<typeof playerAtlasFrame>[0]> = {},
    ) =>
      playerAtlasFrame({
        airPitch: 0,
        heading: "downhill",
        motion: "grounded",
        velocityX: 0,
        ...overrides,
      });

    expect(pose({ heading: "tuck" })).toBe("player/uphill-right");
    expect(pose({ heading: "carve-left-1" })).toBe("player/carve-left-2");
    expect(pose({ heading: "carve-right-3" })).toBe("player/carve-right-2");
    expect(pose({ motion: "airborne" })).toBe("player/tuck");
    expect(pose({ airPitch: Math.PI / 2, motion: "airborne" })).toBe(
      "player/front-flip-2",
    );
    expect(pose({ airPitch: Math.PI, motion: "airborne" })).toBe(
      "player/front-flip-1",
    );
    expect(pose({ motion: "crashed" })).toBe("player/wipeout");
  });
});
