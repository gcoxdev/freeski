import { CLASSIC_EXCLUSIONS, pointInsideBounds } from "./classicMountain";
import { blocksGuaranteedCorridor, isBlockingType } from "./corridor";
import { GENERATOR_VERSION } from "./generatorVersion";
import { chooseObjectType, ZONE_SPAWN_CHANCE, zoneAt } from "./spawnProfiles";
import {
  createSeededRandom,
  hashChunkSeed,
  hashSeed,
  type SeededRandom,
} from "./seed";
import {
  CHUNK_SIZE_METERS,
  type GeneratedObject,
  type GeneratedObjectType,
  type WorldBounds,
  type WorldChunk,
} from "./types";

const CELL_SIZE_METERS = 8;
const CANDIDATE_MARGIN_METERS = 24;

const FOOTPRINT_RADIUS: Readonly<Record<GeneratedObjectType, number>> =
  Object.freeze({
    beginner: 1.25,
    "bump-large": 1.5,
    "bump-small": 0.8,
    dog: 0.75,
    mogul: 1.1,
    ramp: 2,
    rock: 1.35,
    stump: 1,
    tree: 2.2,
    "walking-tree": 2.2,
  });

interface Candidate extends GeneratedObject {
  readonly cellX: number;
  readonly cellY: number;
  readonly spawned: boolean;
}

export type RandomFactory = (seed: number) => SeededRandom;

function difficultyMultiplier(y: number): number {
  if (y <= 0) return 0.72;
  if (y < 200) return 0.72 + (y / 200) * 0.28;
  if (y <= 1_040) return 1;
  return 1.15;
}

function intersects(a: Candidate, b: Candidate): boolean {
  const minimum = a.footprintRadius + b.footprintRadius + 0.65;
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 < minimum ** 2;
}

function objectSort(a: GeneratedObject, b: GeneratedObject): number {
  return a.y - b.y || a.x - b.x || a.id.localeCompare(b.id);
}

export class WorldGenerator {
  private readonly candidateCache = new Map<string, Candidate>();

  constructor(
    readonly worldSeed: string,
    private readonly randomFactory: RandomFactory = createSeededRandom,
  ) {}

  generateChunk(chunkX: number, chunkY: number): WorldChunk {
    if (!Number.isInteger(chunkX) || !Number.isInteger(chunkY)) {
      throw new TypeError("Chunk coordinates must be integers");
    }
    const bounds: WorldBounds = Object.freeze({
      minX: chunkX * CHUNK_SIZE_METERS,
      maxX: (chunkX + 1) * CHUNK_SIZE_METERS,
      minY: chunkY * CHUNK_SIZE_METERS,
      maxY: (chunkY + 1) * CHUNK_SIZE_METERS,
    });
    const candidates = this.candidatesInBounds(
      bounds,
      CANDIDATE_MARGIN_METERS,
    ).filter((candidate) => this.isAccepted(candidate));
    const ramps = candidates.filter((candidate) => candidate.type === "ramp");
    const objects = candidates
      .filter(
        (candidate) =>
          candidate.x >= bounds.minX &&
          candidate.x < bounds.maxX &&
          candidate.y >= bounds.minY &&
          candidate.y < bounds.maxY,
      )
      .filter(
        (candidate) =>
          !isBlockingType(candidate.type) ||
          !ramps.some(
            (ramp) =>
              Math.abs(candidate.x - ramp.x) <= 4 + candidate.footprintRadius &&
              candidate.y >= ramp.y + 2 - candidate.footprintRadius &&
              candidate.y <= ramp.y + 18 + candidate.footprintRadius,
          ),
      )
      .map((candidate) =>
        Object.freeze({
          footprintRadius: candidate.footprintRadius,
          id: candidate.id,
          priority: candidate.priority,
          type: candidate.type,
          x: candidate.x,
          y: candidate.y,
          zone: candidate.zone,
        }),
      )
      .sort(objectSort);

    return Object.freeze({
      bounds,
      chunkSeed: hashChunkSeed(this.worldSeed, chunkX, chunkY),
      objects: Object.freeze(objects),
      version: GENERATOR_VERSION,
      x: chunkX,
      y: chunkY,
    });
  }

  snapshotChunk(chunkX: number, chunkY: number): string {
    const chunk = this.generateChunk(chunkX, chunkY);
    return JSON.stringify(
      chunk.objects.map(({ id, type, x, y, zone }) => ({
        id,
        type,
        x,
        y,
        zone,
      })),
    );
  }

  private candidatesInBounds(
    bounds: WorldBounds,
    padding: number,
  ): Candidate[] {
    const minCellX = Math.floor((bounds.minX - padding) / CELL_SIZE_METERS);
    const maxCellX = Math.floor((bounds.maxX + padding) / CELL_SIZE_METERS);
    const minCellY = Math.floor((bounds.minY - padding) / CELL_SIZE_METERS);
    const maxCellY = Math.floor((bounds.maxY + padding) / CELL_SIZE_METERS);
    const candidates: Candidate[] = [];
    for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        candidates.push(this.candidateAt(cellX, cellY));
      }
    }
    return candidates;
  }

  private candidateAt(cellX: number, cellY: number): Candidate {
    const key = `${cellX},${cellY}`;
    const cached = this.candidateCache.get(key);
    if (cached) return cached;

    const ownerChunkX = Math.floor(
      (cellX * CELL_SIZE_METERS) / CHUNK_SIZE_METERS,
    );
    const ownerChunkY = Math.floor(
      (cellY * CELL_SIZE_METERS) / CHUNK_SIZE_METERS,
    );
    const ownerSeed = hashChunkSeed(this.worldSeed, ownerChunkX, ownerChunkY);
    const random = this.randomFactory(
      hashSeed(`${GENERATOR_VERSION}:${ownerSeed}:cell:${cellX}:${cellY}`),
    );
    const x = cellX * CELL_SIZE_METERS + 1 + random.next() * 6;
    const y = cellY * CELL_SIZE_METERS + 1 + random.next() * 6;
    const zone = zoneAt(x, y);
    const type = chooseObjectType(zone, random.next(), random.next());
    const candidate: Candidate = Object.freeze({
      cellX,
      cellY,
      footprintRadius: FOOTPRINT_RADIUS[type],
      id: `${GENERATOR_VERSION}:${cellX}:${cellY}`,
      priority: random.next(),
      spawned:
        random.next() <
        Math.min(0.92, ZONE_SPAWN_CHANCE[zone] * difficultyMultiplier(y)),
      type,
      x,
      y,
      zone,
    });
    this.candidateCache.set(key, candidate);
    return candidate;
  }

  private isAccepted(candidate: Candidate): boolean {
    if (!candidate.spawned) return false;
    if (
      CLASSIC_EXCLUSIONS.some((bounds) =>
        pointInsideBounds(candidate, bounds, candidate.footprintRadius),
      )
    ) {
      return false;
    }
    if (
      isBlockingType(candidate.type) &&
      blocksGuaranteedCorridor(
        this.worldSeed,
        candidate,
        candidate.footprintRadius,
      )
    ) {
      return false;
    }

    for (let y = candidate.cellY - 1; y <= candidate.cellY + 1; y += 1) {
      for (let x = candidate.cellX - 1; x <= candidate.cellX + 1; x += 1) {
        if (x === candidate.cellX && y === candidate.cellY) continue;
        const neighbor = this.candidateAt(x, y);
        if (!neighbor.spawned || !intersects(candidate, neighbor)) continue;
        if (
          neighbor.priority < candidate.priority ||
          (neighbor.priority === candidate.priority &&
            neighbor.id < candidate.id)
        ) {
          return false;
        }
      }
    }
    return true;
  }
}
