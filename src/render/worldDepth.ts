/** Ground shadows/terrain stay below 10; effects stay above 40.
 * Sort by ground position rather than sprite top, so tall trees occlude naturally.
 * Elevation moves airborne skiers ahead of obstacles they can clear.
 */
export function worldDepth(groundScreenY: number, airHeightMeters = 0): number {
  return (
    20 +
    (20 / Math.PI) * Math.atan((groundScreenY + airHeightMeters * 19) / 1000)
  );
}
