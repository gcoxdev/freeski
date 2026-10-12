import { CLASSIC_LIFT } from "../world/classicMountain";
import { LIFT_ROUTE } from "../world/liftRoute";

// Center of the top hanger in each untrimmed source pose. Riders and drop
// poses have different padding, so a single lane offset cannot align them all.
export const CHAIR_HANGERS = Object.freeze({
  "chairlift/empty": { x: 80, width: 181, height: 151 },
  "chairlift/one-skier": { x: 66, width: 169, height: 141 },
  "chairlift/two-riders": { x: 66.5, width: 168, height: 140 },
  "chairlift/skier-drop": { x: 56.5, width: 166, height: 138 },
  "chairlift/snowboarder-drop": { x: 56.5, width: 180, height: 150 },
});

export function chairCableOffset(
  frame: string,
  flipX: boolean,
  displayHeight: number,
): number {
  const hanger = CHAIR_HANGERS[frame as keyof typeof CHAIR_HANGERS];
  if (!hanger) return 0;
  return (
    (hanger.width / 2 - hanger.x) *
    (displayHeight / hanger.height) *
    (flipX ? -1 : 1)
  );
}

// Cable contact points measured in the tower's untrimmed atlas source.
// Keeping the origin and both endpoints together prevents padding changes
// from separating the cables from their sheave wheels.
export const LIFT_TOWER_ART = Object.freeze({
  width: 169,
  height: 141,
  groundY: 118,
  left: { x: 17, y: 12 },
  right: { x: 116, y: 31 },
});

export function liftTowerPresentation(pixelsPerMeter: number) {
  const art = LIFT_TOWER_ART;
  const lanes = CLASSIC_LIFT.chairs.map((chair) => chair.laneX);
  const leftCableX =
    (Math.min(...lanes) - CLASSIC_LIFT.towerX) * pixelsPerMeter;
  const rightCableX =
    (Math.max(...lanes) - CLASSIC_LIFT.towerX) * pixelsPerMeter;
  const scaleX = (rightCableX - leftCableX) / (art.right.x - art.left.x);
  const displayHeight = 128;
  const scaleY = displayHeight / art.height;
  return {
    displayHeight,
    displayWidth: art.width * scaleX,
    originX: (art.left.x - leftCableX / scaleX) / art.width,
    originY: art.groundY / art.height,
    leftCableX,
    rightCableX,
    leftCableY: (art.left.y - art.groundY) * scaleY,
    rightCableY: (art.right.y - art.groundY) * scaleY,
  };
}

/** Project the cable plane through both tower sheaves, including each turn. */
export function liftCableHeight(
  worldX: number,
  pixelsPerMeter: number,
  worldY = (LIFT_ROUTE.topY + LIFT_ROUTE.bottomY) / 2,
): number {
  const tower = liftTowerPresentation(pixelsPerMeter);
  const across = Math.max(
    0,
    Math.min(
      1,
      (worldX - LIFT_ROUTE.leftX) / (LIFT_ROUTE.rightX - LIFT_ROUTE.leftX),
    ),
  );
  const towerHeight =
    tower.leftCableY + across * (tower.rightCableY - tower.leftCableY);
  const terminal = liftTerminalPresentation(pixelsPerMeter);
  const terminalHeight =
    terminal.leftCableY + across * (terminal.rightCableY - terminal.leftCableY);
  const endDistance = Math.min(
    worldY - LIFT_ROUTE.topY,
    LIFT_ROUTE.bottomY - worldY,
  );
  const blend = Math.max(
    0,
    Math.min(1, 1 - endDistance / LIFT_TERMINAL_APPROACH_METERS),
  );
  const beyondEnd =
    worldY < LIFT_ROUTE.topY
      ? worldY - LIFT_ROUTE.topY
      : worldY > LIFT_ROUTE.bottomY
        ? worldY - LIFT_ROUTE.bottomY
        : 0;
  // Project the circular route onto the exposed wheel's elliptical plane.
  const turnScale = terminal.turnRadiusY / (LIFT_ROUTE.radius * pixelsPerMeter);
  return (
    towerHeight +
    (terminalHeight - towerHeight) * blend +
    beyondEnd * pixelsPerMeter * (turnScale - 1)
  );
}

export const LIFT_TERMINAL_APPROACH_METERS = 32;

/** Rim contact points and footing measured in the generated terminal artwork. */
export const LIFT_TERMINAL_ART = Object.freeze({
  width: 1373,
  height: 1145,
  groundY: 1070,
  left: { x: 277, y: 302 },
  right: { x: 1137, y: 332 },
  radiusY: 190,
});

export function liftTerminalPresentation(pixelsPerMeter: number) {
  const art = LIFT_TERMINAL_ART;
  const displayHeight = 128;
  const scaleY = displayHeight / art.height;
  const scaleX =
    ((LIFT_ROUTE.rightX - LIFT_ROUTE.leftX) * pixelsPerMeter) /
    (art.right.x - art.left.x);
  return {
    displayHeight,
    displayWidth: art.width * scaleX,
    originX: (art.left.x + art.right.x) / 2 / art.width,
    originY: art.groundY / art.height,
    leftCableY: (art.left.y - art.groundY) * scaleY,
    rightCableY: (art.right.y - art.groundY) * scaleY,
    turnRadiusY: art.radiusY * scaleY,
  };
}
