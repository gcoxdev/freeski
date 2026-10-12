import { describe, expect, it } from "vitest";
import {
  insideBufferedViewport,
  insideViewport,
  POPULATION_RENDER_BUFFER_PIXELS,
} from "./populationCulling";

describe("population render culling", () => {
  it("keeps objects alive through a full off-screen apron", () => {
    const width = 1_280;
    const height = 720;
    expect(insideBufferedViewport(-1, 360, width, height)).toBe(true);
    expect(insideViewport(-1, 360, width, height)).toBe(false);
    expect(
      insideBufferedViewport(
        -POPULATION_RENDER_BUFFER_PIXELS,
        360,
        width,
        height,
      ),
    ).toBe(true);
    expect(
      insideBufferedViewport(
        -POPULATION_RENDER_BUFFER_PIXELS - 1,
        360,
        width,
        height,
      ),
    ).toBe(false);
  });

  it("buffers every viewport edge symmetrically", () => {
    const width = 768;
    const height = 600;
    const buffer = POPULATION_RENDER_BUFFER_PIXELS;
    expect(
      insideBufferedViewport(width + buffer, height / 2, width, height),
    ).toBe(true);
    expect(
      insideBufferedViewport(width + buffer + 1, height / 2, width, height),
    ).toBe(false);
    expect(insideBufferedViewport(width / 2, -buffer, width, height)).toBe(
      true,
    );
    expect(
      insideBufferedViewport(width / 2, height + buffer, width, height),
    ).toBe(true);
  });
});
