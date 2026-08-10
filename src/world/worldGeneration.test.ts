/// <reference types="node" />

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CLASSIC_COURSES,
  CLASSIC_LIFT,
  CLASSIC_YETI_TRIGGERS,
  blocksTreeSlalomRoute,
  classicOverlaySignature,
  correctMarkerPassingX,
  treeSlalomRouteCenterX,
  TREE_SLALOM_ROUTE,
  TREE_SLALOM_ROUTE_WIDTH_METERS,
} from "./classicMountain";
import { ChunkDeltaStore } from "./chunkDeltas";
import {
  blocksGuaranteedCorridor,
  CORRIDOR_WIDTH_METERS,
  isBlockingType,
  PLAYER_FOOTPRINT_WIDTH_METERS,
} from "./corridor";
import { WorldGenerator } from "./generator";
import { MountainStream } from "./mountainStream";
import type { SeededRandom } from "./seed";
import { SPAWN_PROFILES, ZONE_SPAWN_CHANCE } from "./spawnProfiles";
import type { GeneratedObject } from "./types";

function collectObjects(
  generator: WorldGenerator,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
): GeneratedObject[] {
  const objects: GeneratedObject[] = [];
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      objects.push(...generator.generateChunk(x, y).objects);
    }
  }
  return objects;
}

describe("classic mountain declarative overlays", () => {
  it("preserves the researched course geometry and counts", () => {
    const slalom = CLASSIC_COURSES[0]!;
    const freeStyle = CLASSIC_COURSES[1]!;
    const treeSlalom = CLASSIC_COURSES[2]!;
    expect(slalom).toMatchObject({
      centerX: -28,
      lengthMeters: 540,
      startGate: { leftX: -36, rightX: -20, y: 40 },
      finishGate: { leftX: -36, rightX: -20, y: 540 },
    });
    expect(slalom.markers).toHaveLength(24);
    expect(slalom.markers[0]).toMatchObject({ x: -31, y: 60 });
    expect(slalom.markers.at(-1)).toMatchObject({ x: -25, y: 520 });

    expect(freeStyle).toMatchObject({
      lengthMeters: 1_040,
      startGate: { leftX: -10, rightX: 10, y: 40 },
      finishGate: { leftX: -10, rightX: 10, y: 1_040 },
    });
    expect(treeSlalom).toMatchObject({
      centerX: 26,
      lengthMeters: 1_040,
      startGate: { leftX: 20, rightX: 32, y: 40 },
      finishGate: { leftX: 20, rightX: 32, y: 1_040 },
    });
    expect(treeSlalom.markers).toHaveLength(39);
    expect(treeSlalom.markers[0]).toMatchObject({ x: 25, y: 65 });
    expect(treeSlalom.markers.at(-1)).toMatchObject({ x: 25, y: 1_015 });

    expect(CLASSIC_LIFT.towers).toHaveLength(13);
    expect(CLASSIC_LIFT.towers[0]).toEqual({ x: -8, y: -64 });
    expect(CLASSIC_LIFT.towers.at(-1)).toEqual({ x: -8, y: 1_472 });
    expect(CLASSIC_LIFT.chairs.map((chair) => chair.laneX)).toEqual([-7, -9]);
    expect(CLASSIC_YETI_TRIGGERS.map((trigger) => trigger.value)).toEqual([
      -125, 2_000, -1_000, 1_000,
    ]);
  });

  it("keeps terrain varied while leaving NPCs to the moving actor system", () => {
    expect(SPAWN_PROFILES.open.map((entry) => entry.weight)).toEqual([
      45, 20, 5, 20, 2,
    ]);
    expect(SPAWN_PROFILES["free-style"].map((entry) => entry.weight)).toEqual([
      18, 30, 10, 20, 20,
    ]);
    expect(SPAWN_PROFILES["tree-slalom"]).toEqual([
      { type: "tree", weight: 1 },
    ]);
    expect(SPAWN_PROFILES.slalom).toEqual([{ type: "mogul", weight: 1 }]);
    expect(ZONE_SPAWN_CHANCE).toEqual({
      "free-style": 0.25,
      "tree-slalom": 0.32,
      open: 0.14,
      slalom: 0.04,
    });
    expect(
      Object.values(SPAWN_PROFILES)
        .flat()
        .some((entry) =>
          ["beginner", "dog", "walking-tree"].includes(entry.type),
        ),
    ).toBe(false);
  });
});

describe("deterministic chunk generation", () => {
  it("reproduces chunks across reload and viewport-sized stream windows", () => {
    const first = new WorldGenerator("snapshot-alpine");
    const reload = new WorldGenerator("snapshot-alpine");
    expect(first.snapshotChunk(0, 7)).toBe(reload.snapshotChunk(0, 7));

    const narrow = new MountainStream(first);
    const wide = new MountainStream(reload);
    narrow.update({
      worldX: 0,
      worldY: 450,
      velocityY: 10,
      viewportWidthMeters: 100,
    });
    wide.update({
      worldX: 0,
      worldY: 450,
      velocityY: 10,
      viewportWidthMeters: 420,
    });
    const narrowChunk = narrow
      .getActiveChunks()
      .find((chunk) => chunk.x === 0 && chunk.y === 7);
    const wideChunk = wide
      .getActiveChunks()
      .find((chunk) => chunk.x === 0 && chunk.y === 7);
    expect(narrowChunk).toEqual(wideChunk);
  });

  it("changes random content with the seed without moving classic overlays", () => {
    const overlayBefore = classicOverlaySignature();
    const alpha = new WorldGenerator("alpha").snapshotChunk(1, 6);
    const beta = new WorldGenerator("beta").snapshotChunk(1, 6);
    expect(alpha).not.toBe(beta);
    expect(classicOverlaySignature()).toBe(overlayBefore);
  });

  it("accepts an injected seeded random factory", () => {
    const requestedSeeds: number[] = [];
    const factory = (seed: number): SeededRandom => {
      requestedSeeds.push(seed);
      let value = seed >>> 0;
      return {
        next: () => {
          value = (Math.imul(value, 1_664_525) + 1_013_904_223) >>> 0;
          return value / 0x1_0000_0000;
        },
        nextInt: (maximum) => Math.floor((value / 0x1_0000_0000) * maximum),
      };
    };
    const generator = new WorldGenerator("injected", factory);
    expect(generator.generateChunk(0, 0).version).toBe("freeski-world-v1");
    expect(requestedSeeds.length).toBeGreaterThan(64);
    expect(new Set(requestedSeeds).size).toBe(requestedSeeds.length);
  });

  it("keeps footprints separate, exclusions clear, and ramp landings open", () => {
    const generator = new WorldGenerator("spacing-proof");
    const objects = collectObjects(generator, -2, 2, -1, 18);
    const footprintViolations: string[] = [];
    for (let index = 0; index < objects.length; index += 1) {
      const object = objects[index]!;
      if (isBlockingType(object.type)) {
        expect(
          blocksGuaranteedCorridor(
            generator.worldSeed,
            object,
            object.footprintRadius,
          ),
        ).toBe(false);
      }
      for (
        let otherIndex = index + 1;
        otherIndex < objects.length;
        otherIndex += 1
      ) {
        const other = objects[otherIndex]!;
        const distance = Math.hypot(object.x - other.x, object.y - other.y);
        if (distance < object.footprintRadius + other.footprintRadius + 0.64) {
          footprintViolations.push(`${object.id}/${other.id}`);
        }
      }
    }
    expect(footprintViolations).toEqual([]);
    for (const ramp of objects.filter((object) => object.type === "ramp")) {
      const landingBlockers = objects.filter(
        (object) =>
          isBlockingType(object.type) &&
          Math.abs(object.x - ramp.x) <= 4 + object.footprintRadius &&
          object.y >= ramp.y + 2 - object.footprintRadius &&
          object.y <= ramp.y + 18 + object.footprintRadius,
      );
      expect(landingBlockers).toEqual([]);
    }
    expect(CORRIDOR_WIDTH_METERS).toBe(PLAYER_FOOTPRINT_WIDTH_METERS * 2.5);
  });

  it("keeps a readable Tree Slalom population around a passable authored route", () => {
    const generator = new WorldGenerator("tree-route-proof");
    const objects = collectObjects(generator, 0, 0, 0, 16).filter(
      (object) => object.zone === "tree-slalom",
    );
    const trees = objects.filter((object) => object.type === "tree");
    expect(trees.length).toBeGreaterThanOrEqual(14);
    expect(trees.length).toBeLessThanOrEqual(30);
    expect(
      objects.filter(
        (object) =>
          isBlockingType(object.type) &&
          blocksTreeSlalomRoute(object, object.footprintRadius),
      ),
    ).toEqual([]);
    expect(TREE_SLALOM_ROUTE).toHaveLength(41);
    expect(TREE_SLALOM_ROUTE_WIDTH_METERS).toBeGreaterThanOrEqual(
      PLAYER_FOOTPRINT_WIDTH_METERS,
    );
    for (const marker of CLASSIC_COURSES[2]!.markers) {
      const center = treeSlalomRouteCenterX(marker.y);
      expect(center).toBe(correctMarkerPassingX(marker));
    }
  });

  it("freezes generated truth while keeping runtime deltas separate", () => {
    const chunk = new WorldGenerator("immutable").generateChunk(2, 3);
    expect(Object.isFrozen(chunk)).toBe(true);
    expect(Object.isFrozen(chunk.objects)).toBe(true);
    expect(chunk.objects.every(Object.isFrozen)).toBe(true);
    const store = new ChunkDeltaStore();
    const object = chunk.objects[0]!;
    expect(object).toBeDefined();
    store.patch(object.id, { destroyed: true });
    const firstDelta = store.get(object.id);
    expect(firstDelta).toEqual({ destroyed: true });
    expect(Object.isFrozen(firstDelta)).toBe(true);
    expect(store.get(object.id)).toBe(firstDelta);
    const revision = store.revision;
    store.patch(object.id, { burning: true });
    expect(store.get(object.id)).toEqual({ burning: true, destroyed: true });
    expect(store.get(object.id)).not.toBe(firstDelta);
    expect(store.revision).toBe(revision + 1);
    expect(new WorldGenerator("immutable").generateChunk(2, 3)).toEqual(chunk);
  });

  it("has no browser, Phaser, or ambient random dependency in pure modules", () => {
    for (const directory of ["simulation", "world"]) {
      const files = readdirSync(join("src", directory)).filter(
        (file) => file.endsWith(".ts") && !file.endsWith(".test.ts"),
      );
      const source = files
        .map((file) => readFileSync(join("src", directory, file), "utf8"))
        .join("\n");
      expect(source).not.toMatch(/from ["']phaser["']/i);
      expect(source).not.toMatch(/\b(window|document)\b/);
      expect(source).not.toContain("Math.random");
    }
  });
});

describe("mountain stream continuity", () => {
  it("reuses its immutable window while the streaming signature is unchanged", () => {
    const stream = new MountainStream(new WorldGenerator("stable-window"));
    const firstSnapshot = stream.update({
      worldX: 1,
      worldY: 8,
      velocityY: 20,
      viewportWidthMeters: 192,
    });
    const firstChunks = stream.getActiveChunks();
    const secondSnapshot = stream.update({
      worldX: 4,
      worldY: 31,
      velocityY: 12,
      viewportWidthMeters: 190,
    });
    expect(secondSnapshot).toBe(firstSnapshot);
    expect(stream.getActiveChunks()).toBe(firstChunks);

    const uphillSnapshot = stream.update({
      worldX: 4,
      worldY: 31,
      velocityY: -1,
      viewportWidthMeters: 190,
    });
    expect(uphillSnapshot).not.toBe(firstSnapshot);
    expect(stream.getActiveChunks()).not.toBe(firstChunks);
  });

  it("streams two rows ahead, retains one behind, and descends 2100m without gaps", () => {
    const generator = new WorldGenerator("long-descent");
    const stream = new MountainStream(generator);
    const visitedRows = new Set<number>();
    for (let y = 0; y <= 2_100; y += 8) {
      const snapshot = stream.update({
        worldX: 0,
        worldY: y,
        velocityY: 20,
        viewportWidthMeters: 192,
      });
      visitedRows.add(snapshot.currentY);
      expect(snapshot.missingRequiredKeys).toEqual([]);
      expect(snapshot.aheadRows).toEqual([
        snapshot.currentY + 1,
        snapshot.currentY + 2,
      ]);
      for (const row of [
        snapshot.currentY - 1,
        snapshot.currentY + 1,
        snapshot.currentY + 2,
      ]) {
        expect(
          snapshot.cachedKeys.some((key) => Number(key.split(",")[1]) === row),
        ).toBe(true);
      }
    }
    expect(visitedRows.size).toBeGreaterThanOrEqual(33);
    const corridorBlockers = collectObjects(generator, -1, 0, 0, 32).filter(
      (object) =>
        isBlockingType(object.type) &&
        blocksGuaranteedCorridor(
          generator.worldSeed,
          object,
          object.footprintRadius,
        ),
    );
    expect(corridorBlockers).toEqual([]);
  });
});
