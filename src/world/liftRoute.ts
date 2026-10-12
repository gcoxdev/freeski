import { CLASSIC_LIFT } from "./classicMountain";

const leftX = Math.min(...CLASSIC_LIFT.chairs.map((chair) => chair.laneX));
const rightX = Math.max(...CLASSIC_LIFT.chairs.map((chair) => chair.laneX));
const topY = CLASSIC_LIFT.towers[0]!.y;
const bottomY = CLASSIC_LIFT.towers.at(-1)!.y;
const radius = (rightX - leftX) / 2;
const straightLength = bottomY - topY;
const turnLength = Math.PI * radius;

/** One continuous cable: downhill left, bottom turn, uphill right, top turn. */
export const LIFT_ROUTE = Object.freeze({
  leftX,
  rightX,
  centerX: (leftX + rightX) / 2,
  topY,
  bottomY,
  radius,
  straightLength,
  turnLength,
  length: 2 * (straightLength + turnLength),
});

export function wrapLiftDistance(distance: number): number {
  return (
    ((distance % LIFT_ROUTE.length) + LIFT_ROUTE.length) % LIFT_ROUTE.length
  );
}

export function liftDistanceOnLane(worldY: number, direction: number): number {
  const along = Math.max(0, Math.min(straightLength, worldY - topY));
  return direction > 0
    ? along
    : straightLength + turnLength + straightLength - along;
}

export function liftRoutePoint(distance: number) {
  const along = wrapLiftDistance(distance);
  if (along < straightLength)
    return {
      x: leftX,
      y: topY + along,
      tangentX: 0,
      tangentY: 1,
      section: "downhill" as const,
    };
  if (along < straightLength + turnLength) {
    const angle = (along - straightLength) / radius;
    return {
      x: LIFT_ROUTE.centerX - radius * Math.cos(angle),
      y: bottomY + radius * Math.sin(angle),
      tangentX: Math.sin(angle),
      tangentY: Math.cos(angle),
      section: "bottom" as const,
    };
  }
  if (along < 2 * straightLength + turnLength)
    return {
      x: rightX,
      y: bottomY - (along - straightLength - turnLength),
      tangentX: 0,
      tangentY: -1,
      section: "uphill" as const,
    };
  const angle = (along - 2 * straightLength - turnLength) / radius;
  return {
    x: LIFT_ROUTE.centerX + radius * Math.cos(angle),
    y: topY - radius * Math.sin(angle),
    tangentX: -Math.sin(angle),
    tangentY: -Math.cos(angle),
    section: "top" as const,
  };
}
