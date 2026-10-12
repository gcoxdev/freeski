import geometry from "./mogulPatchGeometry.json" with { type: "json" };
import type { GroundFootprint } from "./types";

/** Shared sprite projection and snow outline; coordinates include atlas padding. */
export const MOGUL_PATCH = Object.freeze(geometry);
const scale = geometry.heightMeters / geometry.sourceHeight;
const points = Object.freeze(
  geometry.outline.map(([x, y]) =>
    Object.freeze({
      x: (x! - geometry.sourceWidth / 2) * scale,
      y:
        (y! - geometry.sourceHeight * geometry.originY) * scale +
        geometry.drawOffsetYMeters,
    }),
  ),
);

export const MOGUL_FOOTPRINT: GroundFootprint = Object.freeze({
  shape: "polygon",
  offsetX: 0,
  offsetY: 0,
  radius: Math.max(...points.map((point) => Math.hypot(point.x, point.y))),
  points,
});
