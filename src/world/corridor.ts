import { hashSeed } from "./seed";
import type { GeneratedObject, WorldPoint } from "./types";

export const PLAYER_FOOTPRINT_WIDTH_METERS = 1.8;
export const CORRIDOR_WIDTH_METERS = PLAYER_FOOTPRINT_WIDTH_METERS * 2.5;

export function corridorCenterX(worldSeed: string, y: number): number {
  const phase =
    (hashSeed(`corridor:${worldSeed}`) / 0x1_0000_0000) * Math.PI * 2;
  return Math.sin(y / 94 + phase) * 1.3 + Math.sin(y / 217 + phase * 0.7) * 0.6;
}

export function isBlockingType(type: GeneratedObject["type"]): boolean {
  return (
    type === "beginner" ||
    type === "dog" ||
    type === "rock" ||
    type === "stump" ||
    type === "tree" ||
    type === "walking-tree"
  );
}

export function blocksGuaranteedCorridor(
  worldSeed: string,
  point: WorldPoint,
  footprintRadius: number,
): boolean {
  const halfWidth = CORRIDOR_WIDTH_METERS / 2;
  return (
    Math.abs(point.x - corridorCenterX(worldSeed, point.y)) <
    halfWidth + footprintRadius
  );
}
