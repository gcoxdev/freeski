/// <reference types="node" />

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CLASSIC_COURSES,
  CLASSIC_FREESTYLE_RAMPS,
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
      centerX: -46,
      halfWidth: 17,
      lengthMeters: 540,
      startGate: { leftX: -63, rightX: -29, y: 96 },
      finishGate: { leftX: -63, rightX: -29, y: 636 },
    });
    expect(slalom.markers).toHaveLength(24);
    expect(slalom.markers[0]).toMatchObject({ x: -51, y: 120 });
    expect(slalom.markers.at(-1)).toMatchObject({ x: -41, y: 580 });

    expect(freeStyle).toMatchObject({
      halfWidth: 17,
      lengthMeters: 1_040,
      startGate: { leftX: -17, rightX: 17, y: 96 },
      finishGate: { leftX: -17, rightX: 17, y: 1_136 },
    });
    expect(CLASSIC_FREESTYLE_RAMPS).toHaveLength(12);
    expect(
      CLASSIC_FREESTYLE_RAMPS.every(
        (ramp) =>
          ramp.y > freeStyle.startGate.y &&
          ramp.y < freeStyle.finishGate.y &&
          Math.abs(ramp.x - freeStyle.centerX) <= freeStyle.halfWidth - 3,
      ),
    ).toBe(true);
    expect(
      CLASSIC_FREESTYLE_RAMPS.slice(1).map(
        (ramp, index) => ramp.y - CLASSIC_FREESTYLE_RAMPS[index]!.y,
      ),
    ).toEqual(Array(11).fill(80));
    expect(treeSlalom).toMatchObject({
      centerX: 46,
      halfWidth: 17,
      lengthMeters: 1_040,
      startGate: { leftX: 29, rightX: 63, y: 96 },
      finishGate: { leftX: 29, rightX: 63, y: 1_136 },
    });
    expect(treeSlalom.markers).toHaveLength(39);
    expect(treeSlalom.markers[0]).toMatchObject({ x: 41, y: 121 });
    expect(treeSlalom.markers.at(-1)).toMatchObject({ x: 41, y: 1_071 });

    expect(slalom.startGate.rightX).toBeLessThan(freeStyle.startGate.leftX);
    expect(freeStyle.startGate.rightX).toBeLessThan(treeSlalom.startGate.leftX);
    expect(
      Math.min(...CLASSIC_COURSES.map((course) => course.startGate.y)),
    ).toBeGreaterThanOrEqual(90);

    expect(CLASSIC_LIFT.towers).toHaveLength(13);
    expect(CLASSIC_LIFT.towers[0]).toEqual({ x: -75.5, y: -64 });
    expect(CLASSIC_LIFT.towers.at(-1)).toEqual({ x: -75.5, y: 1_472 });
    expect(CLASSIC_LIFT.chairs.map((chair) => chair.laneX)).toEqual([
      -70.75, -81.25,
    ]);
    expect(
      CLASSIC_LIFT.chairs.every((chair) =>
        CLASSIC_COURSES.every(
          (course) =>
            chair.laneX < course.centerX - course.halfWidth ||
            chair.laneX > course.centerX + course.halfWidth,
        ),
      ),
    ).toBe(true);
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
      "free-style": 0.05,
      "tree-slalom": 0.04,
      open: 0.035,
      slalom: 0.012,
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
    expect(generator.generateChunk(0, 0).version).toBe("freeski-world-v5");
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
    const allRamps = [
      ...objects.filter((object) => object.type === "ramp"),
      ...CLASSIC_FREESTYLE_RAMPS.map((ramp) => ({
        footprintRadius: 3,
        id: ramp.id,
        x: ramp.x,
        y: ramp.y,
      })),
    ];
    for (let index = 0; index < allRamps.length; index += 1) {
      for (
        let otherIndex = index + 1;
        otherIndex < allRamps.length;
        otherIndex += 1
      ) {
        const ramp = allRamps[index]!;
        const other = allRamps[otherIndex]!;
        expect(
          Math.hypot(ramp.x - other.x, ramp.y - other.y),
          `${ramp.id}/${other.id}`,
        ).toBeGreaterThanOrEqual(
          ramp.footprintRadius + other.footprintRadius + 1,
        );
      }
    }
    expect(CORRIDOR_WIDTH_METERS).toBe(PLAYER_FOOTPRINT_WIDTH_METERS * 2.5);
  });

  it("keeps a readable Tree Slalom population around a passable authored route", () => {
    const generator = new WorldGenerator("tree-route-proof");
    const objects = collectObjects(generator, 0, 0, 0, 16).filter(
      (object) => object.zone === "tree-slalom",
    );
    const trees = objects.filter((object) => object.type === "tree");
    expect(trees.length).toBeGreaterThanOrEqual(5);
    expect(trees.length).toBeLessThanOrEqual(18);
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

  it("deterministically populates all three evergreen sizes", () => {
    const trees = collectObjects(
      new WorldGenerator("tree-size-proof"),
      -4,
      4,
      -2,
      24,
    ).filter((object) => object.type === "tree");
    const variants = new Set(trees.map((tree) => tree.variant));
    expect(variants).toEqual(
      new Set([
        "dead-tree",
        "evergreen-large",
        "evergreen-medium",
        "evergreen-small",
      ]),
    );
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
  it("preloads tall viewport rows before scenery can enter on-screen", () => {
    const stream = new MountainStream(new WorldGenerator("tall-viewport"));
    const snapshot = stream.update({
      renderBufferMeters: 22,
      velocityY: 20,
      viewportBottomMeters: 180,
      viewportTopMeters: 95,
      viewportWidthMeters: 192,
      worldX: 0,
      worldY: 0,
    });
    for (const row of [-2, -1, 0, 1, 2, 3, 4])
      expect(snapshot.activeKeys.some((key) => key.endsWith(`,${row}`))).toBe(
        true,
      );
  });

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
