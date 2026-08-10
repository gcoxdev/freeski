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

export type GeneratedObjectVariant = "dead-tree" | "evergreen";

export interface GroundFootprint {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly radius: number;
  readonly shape: "circle";
}

export interface SpriteBoundsMeters {
  readonly height: number;
  readonly pivotY: number;
  readonly width: number;
}

export interface InteractionMetadata {
  readonly blocksGroundedPlayer: boolean;
  readonly clearanceHeight: number;
  readonly footprint: GroundFootprint;
  readonly spriteBounds: SpriteBoundsMeters;
}

export interface GeneratedObject extends WorldPoint {
  readonly footprintRadius: number;
  readonly id: string;
  readonly interaction: InteractionMetadata;
  readonly priority: number;
  readonly type: GeneratedObjectType;
  readonly variant?: GeneratedObjectVariant;
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
