import { describe, expect, it } from "vitest";
import {
  ActionController,
  actionForKeyCode,
  KEY_BINDINGS,
  STANDARD_GAMEPAD_BINDINGS,
} from "./actions";

describe("central action layer", () => {
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

  it("keeps keyboard and standard gamepad mappings explicit and remappable", () => {
    expect(KEY_BINDINGS.pause).toEqual(["Escape", "F3"]);
    expect(KEY_BINDINGS.reset).toEqual(["KeyR", "F2"]);
    expect(KEY_BINDINGS.brake).toEqual([
      "ShiftLeft",
      "ShiftRight",
      "KeyB",
      "Numpad5",
    ]);
    expect(KEY_BINDINGS["steer-left"]).toContain("Numpad4");
    expect(KEY_BINDINGS["steer-right"]).toContain("Numpad6");
    expect(KEY_BINDINGS.uphill).toContain("Numpad8");
    expect(KEY_BINDINGS.tuck).toContain("Numpad2");
    expect(STANDARD_GAMEPAD_BINDINGS.buttons).toMatchObject({
      0: "jump",
      1: "brake",
      2: "turbo",
      9: "pause",
      12: "uphill",
      13: "tuck",
      14: "steer-left",
      15: "steer-right",
    });
    expect(actionForKeyCode("KeyJ", { ...KEY_BINDINGS, jump: ["KeyJ"] })).toBe(
      "jump",
    );
  });

  it("preserves held and edge semantics across simultaneous sources", () => {
    const actions = new ActionController();
    actions.setDigital("steer-left", "keyboard:KeyA", true);
    actions.setDigital("steer-left", "touch:7", true);
    actions.setDigital("jump", "keyboard:Space", true);

    expect(actions.sample()).toMatchObject({
      player: { jumpPressed: true, steer: -1 },
    });
    expect(actions.sample()).toMatchObject({
      player: { jumpPressed: false, steer: -1 },
    });
    actions.setDigital("steer-left", "keyboard:KeyA", false);
    expect(actions.sample().player.steer).toBe(-1);
    actions.setDigital("steer-left", "touch:7", false);
    expect(actions.sample().player.steer).toBe(0);
  });

  it("prioritizes digital steering and selects the strongest analog source", () => {
    const actions = new ActionController();
    actions.setSteer("gamepad:0:axis", 0.45);
    actions.setSteer("pointer", -0.8);
    expect(actions.sample().player.steer).toBe(-0.8);
    actions.setDigital("steer-right", "touch:3", true);
    expect(actions.sample().player.steer).toBe(1);
    actions.releaseSource("touch:");
    expect(actions.sample().player.steer).toBe(-0.8);
    actions.releaseAll();
    expect(actions.sample().player.steer).toBe(0);
  });
});
