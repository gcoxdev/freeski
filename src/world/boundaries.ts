export const WORLD_BOUNDARIES_METERS = Object.freeze({
  topYeti: -125,
  bottomYeti: 2_000,
  leftYeti: -1_000,
  rightYeti: 1_000,
});

export type WorldBoundary = "top" | "bottom" | "left" | "right";

export function crossedWorldBoundaries(
  xMeters: number,
  yMeters: number,
): WorldBoundary[] {
  const boundaries: WorldBoundary[] = [];
  if (yMeters < WORLD_BOUNDARIES_METERS.topYeti) boundaries.push("top");
  if (yMeters > WORLD_BOUNDARIES_METERS.bottomYeti) boundaries.push("bottom");
  if (xMeters < WORLD_BOUNDARIES_METERS.leftYeti) boundaries.push("left");
  if (xMeters > WORLD_BOUNDARIES_METERS.rightYeti) boundaries.push("right");
  return boundaries;
}
