import {
  ActionController,
  actionForKeyCode,
  KEY_BINDINGS,
  STANDARD_GAMEPAD_BINDINGS,
  type ActionFrame,
  type GameAction,
  type KeyBindings,
  type StandardGamepadBindings,
} from "./actions";

export type InputSource = "gamepad" | "keyboard" | "pointer" | "touch";

export interface InputTelemetryEvent {
  action: GameAction | "pointer-aim";
  code: string;
  phase: "down" | "move" | "up";
  source: InputSource;
  wallTimeMs: number;
}

interface ScreenPoint {
  x: number;
  y: number;
}

export interface BrowserInputOptions {
  readonly gamepadBindings?: StandardGamepadBindings;
  readonly getGamepads?: () => readonly (Gamepad | null)[];
  readonly keyBindings?: KeyBindings;
  readonly touchRoot?: HTMLElement | null;
}

interface ActiveTouch {
  readonly action: GameAction;
  readonly source: string;
}

const GAMEPAD_DEAD_ZONE = 0.2;

function normalizedAxis(value: number): number {
  if (!Number.isFinite(value) || Math.abs(value) <= GAMEPAD_DEAD_ZONE) return 0;
  return (
    Math.sign(value) *
    ((Math.min(1, Math.abs(value)) - GAMEPAD_DEAD_ZONE) /
      (1 - GAMEPAD_DEAD_ZONE))
  );
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest("input, select, textarea, [contenteditable]"))
  );
}

function isButtonActivation(target: EventTarget | null, code: string): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest("button")) &&
    (code === "Space" || code === "Enter")
  );
}

export class BrowserInputAdapter {
  private readonly actions = new ActionController();
  private readonly activeGamepads = new Set<number>();
  private readonly activeTouches = new Map<number, ActiveTouch>();
  private readonly gamepadBindings: StandardGamepadBindings;
  private readonly getGamepads: () => readonly (Gamepad | null)[];
  private readonly keyBindings: KeyBindings;
  private readonly touchButtons: HTMLButtonElement[];
  private readonly touchRoot: HTMLElement | null;
  private readonly pulseSources = new Set<string>();
  private pointerEnabled = false;
  private touchEnabled = false;
  private lastTouchPointerAt = -Infinity;
  private previousGamepadSteer = new Map<number, number>();

  constructor(
    private readonly target: HTMLElement,
    private readonly getPlayerScreenPoint: () => ScreenPoint,
    private readonly onTelemetry: (event: InputTelemetryEvent) => void,
    options: BrowserInputOptions = {},
  ) {
    this.gamepadBindings = options.gamepadBindings ?? STANDARD_GAMEPAD_BINDINGS;
    this.getGamepads =
      options.getGamepads ??
      (() =>
        typeof navigator.getGamepads === "function"
          ? [...navigator.getGamepads()]
          : []);
    this.keyBindings = options.keyBindings ?? KEY_BINDINGS;
    this.touchRoot =
      options.touchRoot ??
      document.querySelector<HTMLElement>("#touch-controls");
    this.touchButtons = this.touchRoot
      ? [
          ...this.touchRoot.querySelectorAll<HTMLButtonElement>(
            "button[data-action]",
          ),
        ]
      : [];
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    target.addEventListener("pointermove", this.onPointerMove);
    target.addEventListener("pointerdown", this.onPointerDown);
    target.addEventListener("pointerup", this.onPointerUp);
    target.addEventListener("pointercancel", this.onPointerUp);
    target.addEventListener("pointerleave", this.onPointerLeave);
    target.addEventListener("contextmenu", this.onContextMenu);
    for (const button of this.touchButtons) {
      button.addEventListener("pointerdown", this.onTouchDown);
      button.addEventListener("pointerup", this.onTouchEnd);
      button.addEventListener("pointercancel", this.onTouchEnd);
      button.addEventListener("lostpointercapture", this.onTouchEnd);
      button.addEventListener("click", this.onTouchClick);
    }
  }

  get isPointerEnabled(): boolean {
    return this.pointerEnabled;
  }

  get isTouchEnabled(): boolean {
    return this.touchEnabled;
  }

  get connectedGamepads(): number {
    return this.activeGamepads.size;
  }

  get heldActions(): readonly GameAction[] {
    return this.actions.heldActions;
  }

  setPointerEnabled(enabled: boolean): void {
    this.pointerEnabled = enabled;
    if (!enabled) this.resetPointer();
  }

  setTouchEnabled(enabled: boolean): void {
    this.touchEnabled = enabled;
    if (this.touchRoot) {
      this.touchRoot.hidden = !enabled;
      this.touchRoot.setAttribute("aria-hidden", (!enabled).toString());
    }
    if (!enabled) {
      this.actions.releaseSource("touch:");
      this.activeTouches.clear();
    }
  }

  setAirborne(airborne: boolean): void {
    const cluster = this.touchRoot?.querySelector<HTMLElement>(
      ".touch-controls__air",
    );
    if (!cluster || cluster.hidden === !airborne) return;
    cluster.hidden = !airborne;
    for (const button of this.touchButtons) {
      if (!button.dataset.action?.startsWith("trick-")) continue;
      button.disabled = !airborne;
      if (!airborne) delete button.dataset.active;
    }
    if (!airborne) {
      for (const [pointerId, touch] of this.activeTouches) {
        if (!touch.action.startsWith("trick-")) continue;
        this.actions.releaseSource(touch.source);
        this.activeTouches.delete(pointerId);
      }
    }
  }

  sample(): ActionFrame {
    this.pollGamepads();
    const frame = this.actions.sample();
    for (const source of this.pulseSources) this.actions.releaseSource(source);
    this.pulseSources.clear();
    return frame;
  }

  releaseAll(): void {
    this.actions.releaseAll();
    this.activeTouches.clear();
    this.activeGamepads.clear();
    this.previousGamepadSteer = new Map();
    this.pulseSources.clear();
  }

  destroy(): void {
    this.releaseAll();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.target.removeEventListener("pointermove", this.onPointerMove);
    this.target.removeEventListener("pointerdown", this.onPointerDown);
    this.target.removeEventListener("pointerup", this.onPointerUp);
    this.target.removeEventListener("pointercancel", this.onPointerUp);
    this.target.removeEventListener("pointerleave", this.onPointerLeave);
    this.target.removeEventListener("contextmenu", this.onContextMenu);
    for (const button of this.touchButtons) {
      button.removeEventListener("pointerdown", this.onTouchDown);
      button.removeEventListener("pointerup", this.onTouchEnd);
      button.removeEventListener("pointercancel", this.onTouchEnd);
      button.removeEventListener("lostpointercapture", this.onTouchEnd);
      button.removeEventListener("click", this.onTouchClick);
    }
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (
      isTextEntryTarget(event.target) ||
      isButtonActivation(event.target, event.code)
    )
      return;
    const action = actionForKeyCode(event.code, this.keyBindings);
    if (!action) return;
    event.preventDefault();
    const changed = this.actions.setDigital(
      action,
      `keyboard:${event.code}`,
      true,
    );
    if (!changed) return;
    this.emit(action, event.code, "down", "keyboard");
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (
      isTextEntryTarget(event.target) ||
      isButtonActivation(event.target, event.code)
    )
      return;
    const action = actionForKeyCode(event.code, this.keyBindings);
    if (!action) return;
    event.preventDefault();
    const changed = this.actions.setDigital(
      action,
      `keyboard:${event.code}`,
      false,
    );
    if (!changed) return;
    this.emit(action, event.code, "up", "keyboard");
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.pointerEnabled) return;
    const bounds = this.target.getBoundingClientRect();
    const player = this.getPlayerScreenPoint();
    const localX = event.clientX - bounds.left;
    const localY = event.clientY - bounds.top;
    const deltaX = localX - player.x;
    const downhillDistance = Math.max(0, localY - player.y);
    const steer = Math.max(
      -1,
      Math.min(1, Math.atan2(deltaX, downhillDistance) / (Math.PI / 2)),
    );
    this.actions.setSteer("pointer:aim", steer);
    this.emit("pointer-aim", "PointerMove", "move", "pointer");
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.pointerEnabled || (event.button !== 0 && event.button !== 2))
      return;
    event.preventDefault();
    if (event.button === 2) {
      this.actions.setDigital("tuck", "pointer:secondary", true);
      this.emit("tuck", "PointerSecondary", "down", "pointer");
      return;
    }
    this.actions.setDigital("jump", "pointer:primary", true);
    this.actions.setDigital("jump", "pointer:primary", false);
    this.emit("jump", "PointerPrimary", "down", "pointer");
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.button !== 2) return;
    const changed = this.actions.setDigital("tuck", "pointer:secondary", false);
    if (changed) this.emit("tuck", "PointerSecondary", "up", "pointer");
  };

  private readonly onContextMenu = (event: MouseEvent): void => {
    if (this.pointerEnabled) event.preventDefault();
  };

  private readonly onPointerLeave = (): void => this.resetPointer();

  private readonly onTouchDown = (event: PointerEvent): void => {
    if (!this.touchEnabled) return;
    const button = event.currentTarget as HTMLButtonElement;
    const action = button.dataset.action as GameAction | undefined;
    if (!action || button.disabled) return;
    event.preventDefault();
    this.lastTouchPointerAt = performance.now();
    const source = `touch:${event.pointerId}:${action}`;
    this.activeTouches.set(event.pointerId, { action, source });
    this.actions.setDigital(action, source, true);
    button.dataset.active = "true";
    try {
      button.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic test events and older touch browsers may not support capture.
    }
    this.emit(action, button.id, "down", "touch");
  };

  private readonly onTouchEnd = (event: PointerEvent): void => {
    const active = this.activeTouches.get(event.pointerId);
    if (!active) return;
    event.preventDefault();
    this.actions.setDigital(active.action, active.source, false);
    this.activeTouches.delete(event.pointerId);
    const button = event.currentTarget as HTMLButtonElement;
    delete button.dataset.active;
    this.emit(active.action, button.id, "up", "touch");
  };

  private readonly onTouchClick = (event: MouseEvent): void => {
    if (!this.touchEnabled || performance.now() - this.lastTouchPointerAt < 500)
      return;
    const button = event.currentTarget as HTMLButtonElement;
    const action = button.dataset.action as GameAction | undefined;
    if (!action) return;
    const source = `touch:keyboard:${action}`;
    this.actions.setDigital(action, source, true);
    this.pulseSources.add(source);
    this.emit(action, button.id, "down", "touch");
  };

  private pollGamepads(): void {
    let gamepads: readonly (Gamepad | null)[] = [];
    try {
      gamepads = this.getGamepads();
    } catch {
      gamepads = [];
    }
    const seen = new Set<number>();
    for (const gamepad of gamepads) {
      if (!gamepad || gamepad.mapping !== "standard") continue;
      seen.add(gamepad.index);
      for (const [buttonIndexText, action] of Object.entries(
        this.gamepadBindings.buttons,
      )) {
        if (!action) continue;
        const buttonIndex = Number(buttonIndexText);
        const active =
          gamepad.buttons[buttonIndex]?.pressed === true ||
          (gamepad.buttons[buttonIndex]?.value ?? 0) >= 0.5;
        const source = `gamepad:${gamepad.index}:button:${buttonIndex}`;
        const changed = this.actions.setDigital(action, source, active);
        if (changed)
          this.emit(
            action,
            `Gamepad${gamepad.index}.Button${buttonIndex}`,
            active ? "down" : "up",
            "gamepad",
          );
      }
      const steer = normalizedAxis(
        gamepad.axes[this.gamepadBindings.steerAxis] ?? 0,
      );
      this.actions.setSteer(`gamepad:${gamepad.index}:axis`, steer);
      const previousSteer = this.previousGamepadSteer.get(gamepad.index) ?? 0;
      if (Math.abs(steer - previousSteer) >= 0.08) {
        this.previousGamepadSteer.set(gamepad.index, steer);
        this.emit(
          steer < 0
            ? "steer-left"
            : steer > 0
              ? "steer-right"
              : previousSteer < 0
                ? "steer-left"
                : "steer-right",
          `Gamepad${gamepad.index}.Axis${this.gamepadBindings.steerAxis}`,
          "move",
          "gamepad",
        );
      }
    }
    for (const index of this.activeGamepads) {
      if (seen.has(index)) continue;
      this.actions.releaseSource(`gamepad:${index}:`);
      this.previousGamepadSteer.delete(index);
    }
    this.activeGamepads.clear();
    for (const index of seen) this.activeGamepads.add(index);
  }

  private resetPointer(): void {
    this.actions.releaseSource("pointer:");
  }

  private emit(
    action: InputTelemetryEvent["action"],
    code: string,
    phase: InputTelemetryEvent["phase"],
    source: InputSource,
  ): void {
    this.onTelemetry({
      action,
      code,
      phase,
      source,
      wallTimeMs: performance.now(),
    });
  }
}
