import type { PlayerInputFrame } from "../simulation/player";

export type GameAction =
  | "brake"
  | "debug"
  | "jump"
  | "pause"
  | "reset"
  | "steer-left"
  | "steer-right"
  | "trick-back"
  | "trick-front"
  | "trick-left"
  | "trick-right"
  | "tuck"
  | "turbo";

export interface ActionFrame {
  debugPressed: boolean;
  pausePressed: boolean;
  player: PlayerInputFrame;
  resetPressed: boolean;
  turboPressed: boolean;
}

export type KeyBindings = Readonly<Record<GameAction, readonly string[]>>;

export const KEY_BINDINGS: KeyBindings = Object.freeze({
  brake: ["ShiftLeft", "ShiftRight", "KeyB", "Numpad5"],
  debug: ["KeyG"],
  jump: ["Space", "ArrowUp", "KeyW", "Numpad8"],
  pause: ["Escape", "F3"],
  reset: ["KeyR", "F2"],
  "steer-left": ["ArrowLeft", "KeyA", "Numpad1", "Numpad4"],
  "steer-right": ["ArrowRight", "KeyD", "Numpad3", "Numpad6"],
  "trick-back": ["KeyZ"],
  "trick-front": ["KeyX"],
  "trick-left": ["KeyQ"],
  "trick-right": ["KeyE"],
  tuck: ["ArrowDown", "KeyS", "Numpad2"],
  turbo: ["KeyF"],
});

export interface StandardGamepadBindings {
  readonly buttons: Readonly<Partial<Record<number, GameAction>>>;
  readonly steerAxis: number;
}

/** W3C standard-layout buttons: A/B/X/Y, shoulders, triggers, Back/Start, D-pad. */
export const STANDARD_GAMEPAD_BINDINGS: StandardGamepadBindings = Object.freeze(
  {
    buttons: Object.freeze({
      0: "jump",
      1: "brake",
      2: "turbo",
      3: "reset",
      4: "trick-left",
      5: "trick-right",
      6: "trick-back",
      7: "trick-front",
      8: "debug",
      9: "pause",
      12: "jump",
      13: "tuck",
      14: "steer-left",
      15: "steer-right",
    }),
    steerAxis: 0,
  },
);

export const EDGE_ACTIONS: ReadonlySet<GameAction> = new Set([
  "debug",
  "jump",
  "pause",
  "reset",
  "turbo",
]);

export function actionForKeyCode(
  code: string,
  bindings: KeyBindings = KEY_BINDINGS,
): GameAction | undefined {
  for (const [action, codes] of Object.entries(bindings) as [
    GameAction,
    readonly string[],
  ][]) {
    if (codes.includes(code)) return action;
  }
  return undefined;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

/**
 * Remapping-ready, engine-independent action state shared by every input source.
 * Edge actions fire once when the aggregate action changes from up to down;
 * held actions remain active until every contributing source releases them.
 */
export class ActionController {
  private readonly sourcesByAction = new Map<GameAction, Set<string>>();
  private readonly steerBySource = new Map<string, number>();
  private readonly pressed = new Set<GameAction>();

  setDigital(action: GameAction, source: string, active: boolean): boolean {
    const sources = this.sourcesByAction.get(action) ?? new Set<string>();
    const sourceWasActive = sources.has(source);
    if (sourceWasActive === active) return false;
    const actionWasActive = sources.size > 0;
    if (active) sources.add(source);
    else sources.delete(source);
    if (sources.size > 0) this.sourcesByAction.set(action, sources);
    else this.sourcesByAction.delete(action);
    if (!actionWasActive && active && EDGE_ACTIONS.has(action))
      this.pressed.add(action);
    return true;
  }

  setSteer(source: string, value: number): boolean {
    const next = clampUnit(value);
    const hasPrevious = this.steerBySource.has(source);
    const previous = this.steerBySource.get(source) ?? 0;
    if (hasPrevious && Math.abs(next - previous) < 0.001) return false;
    // A zero value is still an active absolute aim (straight downhill). The
    // source is removed explicitly on pointer leave or gamepad disconnect.
    this.steerBySource.set(source, next);
    return true;
  }

  releaseSource(prefix: string): void {
    for (const [action, sources] of this.sourcesByAction) {
      for (const source of sources)
        if (source.startsWith(prefix)) sources.delete(source);
      if (sources.size === 0) this.sourcesByAction.delete(action);
    }
    for (const source of this.steerBySource.keys())
      if (source.startsWith(prefix)) this.steerBySource.delete(source);
  }

  releaseAll(): void {
    this.sourcesByAction.clear();
    this.steerBySource.clear();
    this.pressed.clear();
  }

  sample(): ActionFrame {
    const digitalSteer =
      (this.isHeld("steer-right") ? 1 : 0) -
      (this.isHeld("steer-left") ? 1 : 0);
    let analogSteer = 0;
    for (const value of this.steerBySource.values())
      if (Math.abs(value) > Math.abs(analogSteer)) analogSteer = value;
    return {
      debugPressed: this.consume("debug"),
      pausePressed: this.consume("pause"),
      player: {
        aiming: this.steerBySource.size > 0,
        brake: this.isHeld("brake"),
        jumpPressed: this.consume("jump"),
        steer: analogSteer,
        trickFlip:
          (this.isHeld("trick-front") ? 1 : 0) -
          (this.isHeld("trick-back") ? 1 : 0),
        trickSpin:
          (this.isHeld("trick-right") ? 1 : 0) -
          (this.isHeld("trick-left") ? 1 : 0),
        tuck: this.isHeld("tuck"),
        turn: digitalSteer,
      },
      resetPressed: this.consume("reset"),
      turboPressed: this.consume("turbo"),
    };
  }

  get heldActions(): readonly GameAction[] {
    return [...this.sourcesByAction.keys()].sort();
  }

  private isHeld(action: GameAction): boolean {
    return (this.sourcesByAction.get(action)?.size ?? 0) > 0;
  }

  private consume(action: GameAction): boolean {
    const active = this.pressed.has(action);
    this.pressed.delete(action);
    return active;
  }
}
