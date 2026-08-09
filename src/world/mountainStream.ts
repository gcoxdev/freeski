import type { WorldGenerator } from "./generator";
import { CHUNK_SIZE_METERS, chunkKey, type WorldChunk } from "./types";

export interface StreamPosition {
  readonly velocityY: number;
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
    const firstY = direction === "downhill" ? currentY - 1 : currentY - 2;
    const lastY = direction === "downhill" ? currentY + 2 : currentY + 1;
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

    for (const key of this.cache.keys()) {
      const [x = 0, y = 0] = key.split(",").map(Number);
      if (Math.abs(x - currentX) > xRadius + 1 || Math.abs(y - currentY) > 3) {
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
    return this.snapshotValue;
  }

  getActiveChunks(): readonly WorldChunk[] {
    return Object.freeze(
      this.activeKeys
        .map((key) => this.cache.get(key))
        .filter((chunk): chunk is WorldChunk => chunk !== undefined),
    );
  }

  getSnapshot(): StreamSnapshot {
    return this.snapshotValue;
  }
}
