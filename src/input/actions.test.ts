import { describe, expect, it } from "vitest";
import { actionForKeyCode, KEY_BINDINGS } from "./actions";

describe("keyboard action map", () => {
  it("maps arrows and WASD to the same movement actions", () => {
    expect(actionForKeyCode("ArrowLeft")).toBe("steer-left");
    expect(actionForKeyCode("KeyA")).toBe("steer-left");
    expect(actionForKeyCode("ArrowRight")).toBe("steer-right");
    expect(actionForKeyCode("KeyD")).toBe("steer-right");
    expect(actionForKeyCode("ArrowUp")).toBe("uphill");
    expect(actionForKeyCode("KeyW")).toBe("uphill");
    expect(actionForKeyCode("ArrowDown")).toBe("tuck");
    expect(actionForKeyCode("KeyS")).toBe("tuck");
  });

  it("keeps every required action and alias explicit", () => {
    expect(KEY_BINDINGS.jump).toContain("Space");
    expect(KEY_BINDINGS.turbo).toContain("KeyF");
    expect(KEY_BINDINGS.pause).toEqual(["Escape", "F3"]);
    expect(KEY_BINDINGS.reset).toEqual(["KeyR", "F2"]);
    expect(KEY_BINDINGS.brake).toEqual(["ShiftLeft", "ShiftRight", "KeyB"]);
  });
});
