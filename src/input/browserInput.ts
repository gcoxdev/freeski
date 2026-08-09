import { actionForKeyCode, type ActionFrame, type GameAction } from "./actions";

export interface InputTelemetryEvent {
  action: GameAction | "pointer-aim";
  code: string;
  phase: "down" | "move" | "up";
  wallTimeMs: number;
}

interface ScreenPoint {
  x: number;
  y: number;
}

const EDGE_ACTIONS: ReadonlySet<GameAction> = new Set([
  "debug",
  "jump",
  "pause",
  "reset",
  "turbo",
]);

export class BrowserInputAdapter {
  private readonly held = new Set<GameAction>();
  private readonly pressed = new Set<GameAction>();
  private pointerSteer = 0;
  private pointerTuck = false;
  private pointerUphill = false;
  private pointerEnabled = false;

  constructor(
    private readonly target: HTMLElement,
    private readonly getPlayerScreenPoint: () => ScreenPoint,
    private readonly onTelemetry: (event: InputTelemetryEvent) => void,
  ) {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    target.addEventListener("pointermove", this.onPointerMove);
    target.addEventListener("pointerdown", this.onPointerDown);
    target.addEventListener("pointerleave", this.onPointerLeave);
  }

  get isPointerEnabled(): boolean {
    return this.pointerEnabled;
  }

  setPointerEnabled(enabled: boolean): void {
    this.pointerEnabled = enabled;
    if (!enabled) this.resetPointer();
  }

  sample(): ActionFrame {
    const keyboardSteer =
      (this.held.has("steer-right") ? 1 : 0) -
      (this.held.has("steer-left") ? 1 : 0);
    const steer =
      keyboardSteer === 0 && this.pointerEnabled
        ? this.pointerSteer
        : keyboardSteer;
    const frame: ActionFrame = {
      debugPressed: this.consume("debug"),
      pausePressed: this.consume("pause"),
      player: {
        brake: this.held.has("brake"),
        jumpPressed: this.consume("jump"),
        steer,
        tuck:
          this.held.has("tuck") || (this.pointerEnabled && this.pointerTuck),
        uphill:
          this.held.has("uphill") ||
          (this.pointerEnabled && this.pointerUphill),
      },
      resetPressed: this.consume("reset"),
      turboPressed: this.consume("turbo"),
    };
    return frame;
  }

  destroy(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.target.removeEventListener("pointermove", this.onPointerMove);
    this.target.removeEventListener("pointerdown", this.onPointerDown);
    this.target.removeEventListener("pointerleave", this.onPointerLeave);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const action = actionForKeyCode(event.code);
    if (!action) return;
    event.preventDefault();
    if (!event.repeat && EDGE_ACTIONS.has(action)) this.pressed.add(action);
    this.held.add(action);
    this.onTelemetry({
      action,
      code: event.code,
      phase: "down",
      wallTimeMs: performance.now(),
    });
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    const action = actionForKeyCode(event.code);
    if (!action) return;
    event.preventDefault();
    this.held.delete(action);
    this.onTelemetry({
      action,
      code: event.code,
      phase: "up",
      wallTimeMs: performance.now(),
    });
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.pointerEnabled) return;
    const bounds = this.target.getBoundingClientRect();
    const player = this.getPlayerScreenPoint();
    const localX = event.clientX - bounds.left;
    const localY = event.clientY - bounds.top;
    this.pointerSteer = Math.max(
      -1,
      Math.min(1, (localX - player.x) / Math.max(120, bounds.width * 0.24)),
    );
    this.pointerUphill = localY < player.y - 70;
    this.pointerTuck = localY > player.y + 90;
    this.onTelemetry({
      action: "pointer-aim",
      code: "PointerMove",
      phase: "move",
      wallTimeMs: performance.now(),
    });
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.pointerEnabled || event.button !== 0) return;
    event.preventDefault();
    this.pressed.add("jump");
    this.onTelemetry({
      action: "jump",
      code: "PointerPrimary",
      phase: "down",
      wallTimeMs: performance.now(),
    });
  };

  private readonly onPointerLeave = (): void => this.resetPointer();

  private consume(action: GameAction): boolean {
    const pressed = this.pressed.has(action);
    this.pressed.delete(action);
    return pressed;
  }

  private resetPointer(): void {
    this.pointerSteer = 0;
    this.pointerTuck = false;
    this.pointerUphill = false;
  }
}
