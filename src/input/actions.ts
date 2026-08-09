import type { PlayerInputFrame } from "../simulation/player";

export type GameAction =
  | "brake"
  | "debug"
  | "jump"
  | "pause"
  | "reset"
  | "steer-left"
  | "steer-right"
  | "tuck"
  | "turbo"
  | "uphill";

export interface ActionFrame {
  debugPressed: boolean;
  pausePressed: boolean;
  player: PlayerInputFrame;
  resetPressed: boolean;
  turboPressed: boolean;
}

export const KEY_BINDINGS: Readonly<Record<GameAction, readonly string[]>> =
  Object.freeze({
    brake: ["ShiftLeft", "ShiftRight", "KeyB"],
    debug: ["KeyG"],
    jump: ["Space"],
    pause: ["Escape", "F3"],
    reset: ["KeyR", "F2"],
    "steer-left": ["ArrowLeft", "KeyA"],
    "steer-right": ["ArrowRight", "KeyD"],
    tuck: ["ArrowDown", "KeyS"],
    turbo: ["KeyF"],
    uphill: ["ArrowUp", "KeyW"],
  });

const ACTIONS_BY_CODE = new Map<string, GameAction>();
for (const [action, codes] of Object.entries(KEY_BINDINGS) as [
  GameAction,
  readonly string[],
][]) {
  for (const code of codes) ACTIONS_BY_CODE.set(code, action);
}

export function actionForKeyCode(code: string): GameAction | undefined {
  return ACTIONS_BY_CODE.get(code);
}
