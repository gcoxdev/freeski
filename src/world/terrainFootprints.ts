import geometry from "./terrainFootprints.json" with { type: "json" };
import type { GroundFootprint } from "./types";

/** Contact surfaces, not tall artwork bounds. Ramp contact follows its downhill lip. */
export function terrainFootprint(kind: keyof typeof geometry): GroundFootprint {
  const shape = geometry[kind];
  return Object.freeze({
    ...shape,
    shape: "polygon" as const,
    // Also enclose the offset for deterministic world placement clearance.
    radius:
      Math.max(...shape.points.map((p) => Math.hypot(p.x, p.y))) +
      Math.hypot(shape.offsetX, shape.offsetY),
    points: Object.freeze(
      shape.points.map((point) => Object.freeze({ ...point })),
    ),
  });
}
