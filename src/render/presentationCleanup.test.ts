import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LIFT_TOWER_ART, liftTowerPresentation } from "./liftPresentation";
import { yetiPresentation } from "./yetiPresentation";
import { snowTrailPosition } from "./vfx/AlpineVfx";
import type { YetiControllerSnapshot } from "../simulation/yeti";

const yeti: YetiControllerSnapshot = {
  active: true,
  boundary: "left",
  id: "test",
  protectionSeconds: 0,
  state: "chasing",
  stateSeconds: 0,
  velocityX: -12,
  velocityY: 0,
  worldX: 0,
  worldY: 0,
};

describe("presentation alignment", () => {
  it("places both tower sheaves on their cable lanes with the atlas padding included", () => {
    const atlas = JSON.parse(
      readFileSync("public/assets/production/freeski-atlas.json", "utf8"),
    );
    const source = atlas.frames["lift/tower"].sourceSize;
    expect(source).toEqual({
      w: LIFT_TOWER_ART.width,
      h: LIFT_TOWER_ART.height,
    });
    const p = liftTowerPresentation(7.5);
    for (const [point, cableX, cableY] of [
      [LIFT_TOWER_ART.left, p.leftCableX, p.leftCableY],
      [LIFT_TOWER_ART.right, p.rightCableX, p.rightCableY],
    ] as const) {
      expect((point.x / source.w - p.originX) * p.displayWidth).toBeCloseTo(
        cableX,
      );
      expect((point.y / source.h - p.originY) * p.displayHeight).toBeCloseTo(
        cableY,
      );
    }
    expect(p.leftCableY).not.toBe(p.rightCableY);
  });

  it("plays four distinct lateral phases and mirrors the same cycle for rightward travel", () => {
    const left = [0, 0.11, 0.21, 0.31].map((stateSeconds) =>
      yetiPresentation({ ...yeti, stateSeconds }),
    );
    const right = [0, 0.11, 0.21, 0.31].map((stateSeconds) =>
      yetiPresentation({ ...yeti, stateSeconds, velocityX: 12 }),
    );
    expect(new Set(left.map((p) => p.frame)).size).toBe(4);
    expect(right.map((p) => p.frame)).toEqual(left.map((p) => p.frame));
    expect(left.every((p) => !p.flipX)).toBe(true);
    expect(right.every((p) => p.flipX)).toBe(true);
    expect(
      new Set(left.map((p) => `${p.displayHeight}/${p.originY}`)).size,
    ).toBe(1);
    expect(yetiPresentation({ ...yeti, state: "grab" }).frame).toBe(
      "yeti/grab",
    );
    expect(yetiPresentation({ ...yeti, velocityX: 0 }).frame).toBe(
      "yeti/idle-recovery",
    );
  });

  it.each([
    [0, 12],
    [-8, 8],
    [8, 8],
    [12, 0],
    [0, -8],
  ])(
    "emits snow behind the ski contact for velocity (%s, %s)",
    (velocityX, velocityY) => {
      const [x, y] = snowTrailPosition({
        worldX: 10,
        worldY: 20,
        velocityX,
        velocityY,
      });
      expect((x - 10) * velocityX + (y - 20) * velocityY).toBeLessThan(0);
      expect(Math.hypot(x - 10, y - 20)).toBeCloseTo(0.65);
    },
  );
});
