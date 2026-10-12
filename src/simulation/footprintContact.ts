import type { GroundFootprint } from "../world/types";

/** Circle-to-footprint contact, using coordinates relative to its offset center. */
export function touchesFootprint(
  x: number,
  y: number,
  radius: number,
  footprint: GroundFootprint,
): boolean {
  if (Math.hypot(x, y) > radius + footprint.radius) return false;
  if (footprint.shape === "circle") return true;
  let inside = false;
  for (
    let i = 0, j = footprint.points.length - 1;
    i < footprint.points.length;
    j = i++
  ) {
    const a = footprint.points[j]!;
    const b = footprint.points[i]!;
    if (
      a.y > y !== b.y > y &&
      x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const t =
      lengthSquared > 0
        ? Math.max(
            0,
            Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lengthSquared),
          )
        : 0;
    if (Math.hypot(x - a.x - t * dx, y - a.y - t * dy) <= radius + 1e-9)
      return true;
  }
  return inside;
}
