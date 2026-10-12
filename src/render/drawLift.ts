import type Phaser from "phaser";
import { CLASSIC_LIFT } from "../world/classicMountain";
import { LIFT_ROUTE, liftRoutePoint } from "../world/liftRoute";
import {
  liftCableHeight,
  liftTowerPresentation,
  liftTerminalPresentation,
  LIFT_TERMINAL_APPROACH_METERS,
} from "./liftPresentation";
import type { AtlasSpritePool } from "./atlas/AtlasSpritePool";
import { insideBufferedViewport } from "./populationCulling";
import { COLORS, PIXELS_PER_METER } from "./presentationConstants";
import { worldDepth } from "./worldDepth";

export function drawLift(
  background: Phaser.GameObjects.Graphics,
  spritePool: AtlasSpritePool,
  toScreen: (x: number, y: number) => [number, number],
  width: number,
  height: number,
): void {
  if (!background) return;
  const topTower = CLASSIC_LIFT.towers[0]!;
  const bottomTower = CLASSIC_LIFT.towers.at(-1)!;
  const towerPresentation = liftTowerPresentation(PIXELS_PER_METER);
  for (const chair of CLASSIC_LIFT.chairs) {
    background.lineStyle(1, COLORS.ink, 0.35);
    background.beginPath();
    for (const [index, worldY] of [
      topTower.y,
      topTower.y + LIFT_TERMINAL_APPROACH_METERS,
      bottomTower.y - LIFT_TERMINAL_APPROACH_METERS,
      bottomTower.y,
    ].entries()) {
      const [x, y] = toScreen(chair.laneX, worldY);
      const cableY = y + liftCableHeight(chair.laneX, PIXELS_PER_METER, worldY);
      if (index === 0) background.moveTo(x, cableY);
      else background.lineTo(x, cableY);
    }
    background.strokePath();
  }
  // Both cable ends turn continuously onto the opposite lane. The same route
  // samples drive chair motion, with the same sheave-height projection.
  for (const start of [
    LIFT_ROUTE.straightLength,
    2 * LIFT_ROUTE.straightLength + LIFT_ROUTE.turnLength,
  ]) {
    const terminal = liftRoutePoint(start);
    const [centerX, groundY] = toScreen(LIFT_ROUTE.centerX, terminal.y);
    if (!insideBufferedViewport(centerX, groundY, width, height)) continue;
    spritePool.draw("lift/terminal", centerX, groundY, {
      ...liftTerminalPresentation(PIXELS_PER_METER),
      depth: worldDepth(groundY),
    });
    background.lineStyle(1, COLORS.ink, 0.35);
    background.beginPath();
    for (let step = 0; step <= 32; step += 1) {
      const point = liftRoutePoint(start + (LIFT_ROUTE.turnLength * step) / 32);
      const [x, y] = toScreen(point.x, point.y);
      const cableY = y + liftCableHeight(point.x, PIXELS_PER_METER, point.y);
      if (step === 0) background.moveTo(x, cableY);
      else background.lineTo(x, cableY);
    }
    background.strokePath();
  }
  for (const tower of CLASSIC_LIFT.towers) {
    if (tower === topTower || tower === bottomTower) continue;
    const [x, y] = toScreen(tower.x, tower.y);
    if (!insideBufferedViewport(x, y, width, height)) continue;
    if (
      spritePool.draw("lift/tower", x, y, {
        depth: worldDepth(y),
        displayHeight: towerPresentation.displayHeight,
        displayWidth: towerPresentation.displayWidth,
        originX: towerPresentation.originX,
        originY: towerPresentation.originY,
      })
    )
      continue;
    background.lineStyle(3, COLORS.ink, 0.62);
    const leftX = x + towerPresentation.leftCableX;
    const rightX = x + towerPresentation.rightCableX;
    const leftY = y + towerPresentation.leftCableY;
    const rightY = y + towerPresentation.rightCableY;
    background.lineBetween(x, (leftY + rightY) / 2, x, y);
    background.lineBetween(leftX, leftY, rightX, rightY);
    background.lineStyle(2, COLORS.signal, 0.75);
    background.lineBetween(x - 9, y + 14, x + 9, y + 14);
  }
}
