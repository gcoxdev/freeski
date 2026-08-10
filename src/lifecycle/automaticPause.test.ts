import { describe, expect, it, vi } from "vitest";
import { AutomaticPauseController } from "./automaticPause";

describe("automatic pause controller", () => {
  it("auto-pauses once for overlapping reasons and resumes when all clear", () => {
    let paused = false;
    const setPaused = vi.fn((value: boolean) => {
      paused = value;
    });
    const reset = vi.fn();
    const controller = new AutomaticPauseController(
      () => paused,
      setPaused,
      reset,
    );
    controller.setReason("blur", true);
    controller.setReason("hidden", true);
    controller.setReason("blur", false);
    expect(paused).toBe(true);
    controller.setReason("hidden", false);
    expect(paused).toBe(false);
    expect(setPaused.mock.calls).toEqual([[true], [false]]);
    expect(reset).toHaveBeenCalledTimes(4);
  });

  it("does not resume a run that the player had already paused", () => {
    let paused = true;
    const setPaused = vi.fn((value: boolean) => {
      paused = value;
    });
    const controller = new AutomaticPauseController(
      () => paused,
      setPaused,
      () => undefined,
    );
    controller.setReason("settings", true);
    controller.setReason("settings", false);
    expect(paused).toBe(true);
    expect(setPaused).not.toHaveBeenCalled();
  });
});
