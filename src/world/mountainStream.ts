import type { WorldGenerator } from "./generator";
import { CHUNK_SIZE_METERS, chunkKey, type WorldChunk } from "./types";

export interface StreamPosition {
  readonly renderBufferMeters?: number;
  readonly velocityY: number;
  readonly viewportBottomMeters?: number;
  readonly viewportTopMeters?: number;
  readonly viewportWidthMeters: number;
  readonly worldX: number;
  readonly worldY: number;
}

export interface StreamSnapshot {
  readonly activeKeys: readonly string[];
  readonly aheadRows: readonly number[];
  readonly cachedKeys: readonly string[];
  readonly currentX: number;
  readonly currentY: number;
  readonly direction: "downhill" | "uphill";
  readonly missingRequiredKeys: readonly string[];
}

function keySort(a: string, b: string): number {
  const [ax = 0, ay = 0] = a.split(",").map(Number);
  const [bx = 0, by = 0] = b.split(",").map(Number);
  return ay - by || ax - bx;
}

export class MountainStream {
  private readonly cache = new Map<string, WorldChunk>();
  private activeKeys: readonly string[] = Object.freeze([]);
  private activeChunksValue: readonly WorldChunk[] = Object.freeze([]);
  private streamedCurrentX: number | undefined;
  private streamedCurrentY: number | undefined;
  private streamedDirection: "downhill" | "uphill" | undefined;
  private streamedLowerRows: number | undefined;
  private streamedUpperRows: number | undefined;
  private streamedXRadius: number | undefined;
  private snapshotValue: StreamSnapshot = Object.freeze({
    activeKeys: Object.freeze([]),
    aheadRows: Object.freeze([]),
    cachedKeys: Object.freeze([]),
    currentX: 0,
    currentY: 0,
    direction: "downhill",
    missingRequiredKeys: Object.freeze([]),
  });

  constructor(private readonly generator: WorldGenerator) {}

  update(position: StreamPosition): StreamSnapshot {
    const currentX = Math.floor(position.worldX / CHUNK_SIZE_METERS);
    const currentY = Math.floor(position.worldY / CHUNK_SIZE_METERS);
    const direction = position.velocityY < 0 ? "uphill" : "downhill";
    const xRadius = Math.max(
      2,
      Math.ceil(position.viewportWidthMeters / 2 / CHUNK_SIZE_METERS) + 1,
    );
    const renderBufferMeters = position.renderBufferMeters ?? 0;
    const minimumUpperRows = direction === "downhill" ? 1 : 2;
    const minimumLowerRows = direction === "downhill" ? 2 : 1;
    const upperRows = position.viewportTopMeters
      ? Math.max(
          minimumUpperRows,
          Math.ceil(
            (position.viewportTopMeters + renderBufferMeters) /
              CHUNK_SIZE_METERS,
          ) + 1,
        )
      : minimumUpperRows;
    const lowerRows = position.viewportBottomMeters
      ? Math.max(
          minimumLowerRows,
          Math.ceil(
            (position.viewportBottomMeters + renderBufferMeters) /
              CHUNK_SIZE_METERS,
          ) + 1,
        )
      : minimumLowerRows;
    if (
      currentX === this.streamedCurrentX &&
      currentY === this.streamedCurrentY &&
      direction === this.streamedDirection &&
      xRadius === this.streamedXRadius &&
      upperRows === this.streamedUpperRows &&
      lowerRows === this.streamedLowerRows
    ) {
      return this.snapshotValue;
    }
    const firstY = currentY - upperRows;
    const lastY = currentY + lowerRows;
    const required: string[] = [];

    for (let y = firstY; y <= lastY; y += 1) {
      for (let x = currentX - xRadius; x <= currentX + xRadius; x += 1) {
        const key = chunkKey(x, y);
        required.push(key);
        if (!this.cache.has(key))
          this.cache.set(key, this.generator.generateChunk(x, y));
      }
    }
    this.activeKeys = Object.freeze(required.sort(keySort));
    this.activeChunksValue = Object.freeze(
      this.activeKeys
        .map((key) => this.cache.get(key))
        .filter((chunk): chunk is WorldChunk => chunk !== undefined),
    );

    for (const key of this.cache.keys()) {
      const [x = 0, y = 0] = key.split(",").map(Number);
      if (
        Math.abs(x - currentX) > xRadius + 1 ||
        y < firstY - 1 ||
        y > lastY + 1
      ) {
        this.cache.delete(key);
      }
    }
    const aheadRows =
      direction === "downhill"
        ? [currentY + 1, currentY + 2]
        : [currentY - 1, currentY - 2];
    const missingRequiredKeys = required.filter((key) => !this.cache.has(key));
    this.snapshotValue = Object.freeze({
      activeKeys: this.activeKeys,
      aheadRows: Object.freeze(aheadRows),
      cachedKeys: Object.freeze([...this.cache.keys()].sort(keySort)),
      currentX,
      currentY,
      direction,
      missingRequiredKeys: Object.freeze(missingRequiredKeys),
    });
    this.streamedCurrentX = currentX;
    this.streamedCurrentY = currentY;
    this.streamedDirection = direction;
    this.streamedXRadius = xRadius;
    this.streamedUpperRows = upperRows;
    this.streamedLowerRows = lowerRows;
    return this.snapshotValue;
  }

  getActiveChunks(): readonly WorldChunk[] {
    return this.activeChunksValue;
  }

  getSnapshot(): StreamSnapshot {
    return this.snapshotValue;
  }
}
