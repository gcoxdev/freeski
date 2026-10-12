/** Extra apron used to activate scenery before it reaches the viewport edge. */
export const POPULATION_RENDER_BUFFER_PIXELS = 160;

/** Safety ceiling only; normal seeded density stays far below this value. */
export const MAX_BUFFERED_POPULATED_OBJECTS = 96;

export function insideBufferedViewport(
  screenX: number,
  screenY: number,
  width: number,
  height: number,
): boolean {
  return (
    screenX >= -POPULATION_RENDER_BUFFER_PIXELS &&
    screenX <= width + POPULATION_RENDER_BUFFER_PIXELS &&
    screenY >= -POPULATION_RENDER_BUFFER_PIXELS &&
    screenY <= height + POPULATION_RENDER_BUFFER_PIXELS
  );
}

export function insideViewport(
  screenX: number,
  screenY: number,
  width: number,
  height: number,
): boolean {
  return screenX >= 0 && screenX <= width && screenY >= 0 && screenY <= height;
}
