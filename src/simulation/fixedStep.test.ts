import { describe, expect, it, vi } from "vitest";
import { FixedStepClock } from "./fixedStep";

describe("FixedStepClock", () => {
  it("produces the same simulation steps from equivalent elapsed time", () => {
    const clock = new FixedStepClock(0.01, 20);
    const step = vi.fn();

    clock.advance(0.03, step);
    clock.advance(0.02, step);

    expect(step).toHaveBeenCalledTimes(5);
    expect(step).toHaveBeenLastCalledWith(0.01);
  });

  it("bounds catch-up work and reports discarded time", () => {
    const clock = new FixedStepClock(0.01, 3);
    const result = clock.advance(0.1, () => undefined);

    expect(result.steps).toBe(3);
    expect(result.droppedSeconds).toBeCloseTo(0.07);
    expect(result.alpha).toBeCloseTo(0);
  });
});
