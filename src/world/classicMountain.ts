import { WORLD_BOUNDARIES_METERS } from "./boundaries";
import { interactionFor } from "./interactionCatalog";
import type { WorldBounds, WorldPoint, WorldZone } from "./types";

export interface CourseMarker extends WorldPoint {
  readonly color: "blue" | "red";
  readonly index: number;
}

export interface CourseGate {
  readonly leftX: number;
  readonly rightX: number;
  readonly y: number;
}

export interface ClassicCourse {
  readonly centerX: number;
  readonly finishGate: CourseGate;
  readonly halfWidth: number;
  readonly id: WorldZone;
  readonly lengthMeters: number;
  readonly markers: readonly CourseMarker[];
  readonly name: string;
  readonly startGate: CourseGate;
}

function alternatingMarkers(
  count: number,
  firstY: number,
  spacing: number,
  leftX: number,
  rightX: number,
): readonly CourseMarker[] {
  return Object.freeze(
    Array.from({ length: count }, (_, index) =>
      Object.freeze({
        color: index % 2 === 0 ? ("red" as const) : ("blue" as const),
        index: index + 1,
        x: index % 2 === 0 ? leftX : rightX,
        y: firstY + index * spacing,
      }),
    ),
  );
}

export const CLASSIC_COURSES: readonly ClassicCourse[] = Object.freeze([
  Object.freeze({
    centerX: -28,
    finishGate: Object.freeze({ leftX: -36, rightX: -20, y: 540 }),
    halfWidth: 8,
    id: "slalom" as const,
    lengthMeters: 540,
    markers: alternatingMarkers(24, 60, 20, -31, -25),
    name: "SLALOM",
    startGate: Object.freeze({ leftX: -36, rightX: -20, y: 40 }),
  }),
  Object.freeze({
    centerX: 0,
    finishGate: Object.freeze({ leftX: -10, rightX: 10, y: 1_040 }),
    halfWidth: 10,
    id: "free-style" as const,
    lengthMeters: 1_040,
    markers: Object.freeze([]),
    name: "FREE STYLE",
    startGate: Object.freeze({ leftX: -10, rightX: 10, y: 40 }),
  }),
  Object.freeze({
    centerX: 26,
    finishGate: Object.freeze({ leftX: 20, rightX: 32, y: 1_040 }),
    halfWidth: 6,
    id: "tree-slalom" as const,
    lengthMeters: 1_040,
    markers: alternatingMarkers(39, 65, 25, 25, 27),
    name: "TREE SLALOM",
    startGate: Object.freeze({ leftX: 20, rightX: 32, y: 40 }),
  }),
]);

const TREE_SLALOM = CLASSIC_COURSES.find(
  (course) => course.id === "tree-slalom",
)!;

export const TREE_SLALOM_ROUTE_WIDTH_METERS = 3.2;

/** Authored weaving centerline: always takes the researched correct marker side. */
export const TREE_SLALOM_ROUTE = Object.freeze([
  Object.freeze({ x: TREE_SLALOM.centerX, y: TREE_SLALOM.startGate.y }),
  ...TREE_SLALOM.markers.map((marker) =>
    Object.freeze({
      x: marker.x + (marker.color === "red" ? 1.25 : -1.25),
      y: marker.y,
    }),
  ),
  Object.freeze({ x: TREE_SLALOM.centerX, y: TREE_SLALOM.finishGate.y }),
]);

export function treeSlalomRouteCenterX(y: number): number {
  if (y <= TREE_SLALOM_ROUTE[0]!.y) return TREE_SLALOM_ROUTE[0]!.x;
  const last = TREE_SLALOM_ROUTE.at(-1)!;
  if (y >= last.y) return last.x;
  for (let index = 1; index < TREE_SLALOM_ROUTE.length; index += 1) {
    const right = TREE_SLALOM_ROUTE[index]!;
    if (y > right.y) continue;
    const left = TREE_SLALOM_ROUTE[index - 1]!;
    const ratio = (y - left.y) / (right.y - left.y);
    return left.x + (right.x - left.x) * ratio;
  }
  return last.x;
}

export function blocksTreeSlalomRoute(
  point: WorldPoint,
  footprintRadius: number,
): boolean {
  if (point.y < TREE_SLALOM.startGate.y || point.y > TREE_SLALOM.finishGate.y)
    return false;
  return (
    Math.abs(point.x - treeSlalomRouteCenterX(point.y)) <
    TREE_SLALOM_ROUTE_WIDTH_METERS / 2 + footprintRadius
  );
}

export const CLASSIC_LIFT = Object.freeze({
  chairs: Object.freeze([
    Object.freeze({ direction: "uphill" as const, laneX: -7, phaseY: 0 }),
    Object.freeze({ direction: "downhill" as const, laneX: -9, phaseY: 64 }),
  ]),
  loopLengthMeters: 1_536,
  chairInteraction: interactionFor("chairlift"),
  towerInteraction: interactionFor("lift-tower"),
  towerX: -8,
  towers: Object.freeze(
    Array.from({ length: 13 }, (_, index) =>
      Object.freeze({ x: -8, y: -64 + index * 128 }),
    ),
  ),
});

export const CLASSIC_YETI_TRIGGERS = Object.freeze([
  Object.freeze({ axis: "y" as const, edge: "top" as const, value: -125 }),
  Object.freeze({ axis: "y" as const, edge: "bottom" as const, value: 2_000 }),
  Object.freeze({ axis: "x" as const, edge: "left" as const, value: -1_000 }),
  Object.freeze({ axis: "x" as const, edge: "right" as const, value: 1_000 }),
]);

export const CLASSIC_EXCLUSIONS: readonly WorldBounds[] = Object.freeze([
  ...CLASSIC_COURSES.flatMap((course) => [
    Object.freeze({
      minX: course.startGate.leftX - 3,
      maxX: course.startGate.rightX + 3,
      minY: course.startGate.y - 5,
      maxY: course.startGate.y + 5,
    }),
    Object.freeze({
      minX: course.finishGate.leftX - 3,
      maxX: course.finishGate.rightX + 3,
      minY: course.finishGate.y - 5,
      maxY: course.finishGate.y + 5,
    }),
  ]),
  ...CLASSIC_COURSES.flatMap((course) =>
    course.markers.map((marker) =>
      Object.freeze({
        minX: marker.x - 2,
        maxX: marker.x + 2,
        minY: marker.y - 2,
        maxY: marker.y + 2,
      }),
    ),
  ),
  ...CLASSIC_LIFT.towers.map((tower) =>
    Object.freeze({
      minX: tower.x - 3,
      maxX: tower.x + 3,
      minY: tower.y - 4,
      maxY: tower.y + 4,
    }),
  ),
]);

export function classicOverlaySignature(): string {
  return JSON.stringify({
    boundaries: WORLD_BOUNDARIES_METERS,
    courses: CLASSIC_COURSES,
    lift: CLASSIC_LIFT,
    yeti: CLASSIC_YETI_TRIGGERS,
  });
}

export function pointInsideBounds(
  point: WorldPoint,
  bounds: WorldBounds,
  padding = 0,
): boolean {
  return (
    point.x >= bounds.minX - padding &&
    point.x <= bounds.maxX + padding &&
    point.y >= bounds.minY - padding &&
    point.y <= bounds.maxY + padding
  );
}
