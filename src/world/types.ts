export const CHUNK_SIZE_METERS = 64;

export interface WorldPoint {
  readonly x: number;
  readonly y: number;
}

export interface WorldBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export type WorldZone = "free-style" | "open" | "slalom" | "tree-slalom";

export type GeneratedObjectType =
  | "beginner"
  | "bump-large"
  | "bump-small"
  | "dog"
  | "mogul"
  | "ramp"
  | "rock"
  | "stump"
  | "tree"
  | "walking-tree";

export interface GeneratedObject extends WorldPoint {
  readonly footprintRadius: number;
  readonly id: string;
  readonly priority: number;
  readonly type: GeneratedObjectType;
  readonly zone: WorldZone;
}

export interface WorldChunk {
  readonly bounds: WorldBounds;
  readonly chunkSeed: number;
  readonly objects: readonly GeneratedObject[];
  readonly version: string;
  readonly x: number;
  readonly y: number;
}

export function chunkKey(x: number, y: number): string {
  return `${x},${y}`;
}
