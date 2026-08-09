import { CLASSIC_COURSES } from "./classicMountain";
import type { GeneratedObjectType, WorldZone } from "./types";

type WeightedObject = Readonly<{
  type:
    | "beginner"
    | "bump"
    | "dog"
    | "mogul"
    | "ramp"
    | "rock-stump"
    | "tree"
    | "walking-tree";
  weight: number;
}>;

export const SPAWN_PROFILES: Readonly<
  Record<WorldZone, readonly WeightedObject[]>
> = Object.freeze({
  open: Object.freeze([
    Object.freeze({ type: "walking-tree" as const, weight: 5 }),
    Object.freeze({ type: "tree" as const, weight: 45 }),
    Object.freeze({ type: "bump" as const, weight: 20 }),
    Object.freeze({ type: "mogul" as const, weight: 5 }),
    Object.freeze({ type: "rock-stump" as const, weight: 20 }),
    Object.freeze({ type: "ramp" as const, weight: 2 }),
    Object.freeze({ type: "beginner" as const, weight: 2 }),
    Object.freeze({ type: "dog" as const, weight: 1 }),
  ]),
  "free-style": Object.freeze([
    Object.freeze({ type: "walking-tree" as const, weight: 2 }),
    Object.freeze({ type: "tree" as const, weight: 18 }),
    Object.freeze({ type: "bump" as const, weight: 30 }),
    Object.freeze({ type: "mogul" as const, weight: 10 }),
    Object.freeze({ type: "rock-stump" as const, weight: 20 }),
    Object.freeze({ type: "ramp" as const, weight: 20 }),
  ]),
  "tree-slalom": Object.freeze([
    Object.freeze({ type: "tree" as const, weight: 63 }),
    Object.freeze({ type: "dog" as const, weight: 1 }),
  ]),
  slalom: Object.freeze([Object.freeze({ type: "mogul" as const, weight: 1 })]),
});

export const ZONE_SPAWN_CHANCE: Readonly<Record<WorldZone, number>> =
  Object.freeze({
    open: 0.54,
    "free-style": 0.64,
    "tree-slalom": 0.78,
    slalom: 0.1,
  });

export function zoneAt(x: number, y: number): WorldZone {
  for (const course of CLASSIC_COURSES) {
    if (
      x >= course.centerX - course.halfWidth &&
      x <= course.centerX + course.halfWidth &&
      y >= course.startGate.y - 16 &&
      y <= course.finishGate.y + 16
    ) {
      return course.id;
    }
  }
  return "open";
}

export function chooseObjectType(
  zone: WorldZone,
  unitValue: number,
  variantValue: number,
): GeneratedObjectType {
  const profile = SPAWN_PROFILES[zone];
  const total = profile.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = unitValue * total;
  let selected = profile[profile.length - 1]!.type;
  for (const entry of profile) {
    cursor -= entry.weight;
    if (cursor < 0) {
      selected = entry.type;
      break;
    }
  }
  if (selected === "bump")
    return variantValue < 2 / 3 ? "bump-small" : "bump-large";
  if (selected === "rock-stump") return variantValue < 3 / 4 ? "rock" : "stump";
  return selected;
}
