import { describe, expect, it } from "vitest";
import { LIFT_ROUTE, liftRoutePoint } from "./liftRoute";
import {
  liftCableHeight,
  liftTowerPresentation,
  liftTerminalPresentation,
  LIFT_TERMINAL_ART,
} from "../render/liftPresentation";

describe("continuous lift cable", () => {
  it("joins every straight and curved segment without a position or direction jump", () => {
    const r = LIFT_ROUTE;
    for (const distance of [
      0,
      r.straightLength,
      r.straightLength + r.turnLength,
      2 * r.straightLength + r.turnLength,
      r.length,
    ]) {
      const before = liftRoutePoint(distance - 0.0001);
      const after = liftRoutePoint(distance + 0.0001);
      expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeCloseTo(
        0.0002,
        6,
      );
      expect(after.tangentX).toBeCloseTo(before.tangentX, 4);
      expect(after.tangentY).toBeCloseTo(before.tangentY, 4);
    }
  });

  it("curves half a circle beyond each terminal and meets both tower sheaves", () => {
    const r = LIFT_ROUTE;
    const tower = liftTowerPresentation(7.5);
    for (const [start, y, sign] of [
      [r.straightLength, r.bottomY, 1],
      [2 * r.straightLength + r.turnLength, r.topY, -1],
    ]) {
      const mid = liftRoutePoint(start! + r.turnLength / 2);
      expect(mid.x).toBeCloseTo(r.centerX);
      expect(mid.y).toBeCloseTo(y! + sign! * r.radius);
      for (const fraction of [0, 1]) {
        const end = liftRoutePoint(start! + fraction * r.turnLength);
        expect(end.y).toBeCloseTo(y!);
        expect(liftCableHeight(end.x, 7.5)).toBeCloseTo(
          end.x < r.centerX ? tower.leftCableY : tower.rightCableY,
        );
      }
    }
    expect(liftRoutePoint(r.length)).toEqual(liftRoutePoint(0));
  });

  it("projects chair hangers and cables onto the new terminal rim at both ends", () => {
    const r = LIFT_ROUTE;
    const art = LIFT_TERMINAL_ART;
    const p = liftTerminalPresentation(7.5);
    for (const worldY of [r.topY, r.bottomY]) {
      for (const [point, worldX] of [
        [art.left, r.leftX],
        [art.right, r.rightX],
      ] as const) {
        expect((point.x / art.width - p.originX) * p.displayWidth).toBeCloseTo(
          (worldX - r.centerX) * 7.5,
        );
        expect(
          (point.y / art.height - p.originY) * p.displayHeight,
        ).toBeCloseTo(liftCableHeight(worldX, 7.5, worldY));
      }
    }
    for (const [y, direction] of [
      [r.topY, -1],
      [r.bottomY, 1],
    ] as const) {
      const endY = y + direction * r.radius;
      const projectedDepth =
        (endY - y) * 7.5 +
        liftCableHeight(r.centerX, 7.5, endY) -
        liftCableHeight(r.centerX, 7.5, y);
      expect(projectedDepth).toBeCloseTo(direction * p.turnRadiusY);
    }
  });
});
