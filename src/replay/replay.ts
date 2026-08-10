import type { ActionFrame } from "../input/actions";

export const REPLAY_FORMAT_VERSION = "freeski-replay-v1";
export const DEFAULT_REPLAY_CAPACITY = 7_200;

export interface ReplayActionFrame {
  readonly debugPressed: boolean;
  readonly fixedStep: number;
  readonly pausePressed: boolean;
  readonly player: Readonly<ActionFrame["player"]>;
  readonly resetPressed: boolean;
  readonly turboPressed: boolean;
}

export interface ReplayExport {
  readonly capacity: number;
  readonly droppedFrames: number;
  readonly format: typeof REPLAY_FORMAT_VERSION;
  readonly frames: readonly ReplayActionFrame[];
  readonly generatorVersion: string;
  readonly seed: string;
}

export interface ReplaySnapshot {
  readonly capacity: number;
  readonly count: number;
  readonly digest: string;
  readonly droppedFrames: number;
  readonly firstFixedStep: number | null;
  readonly format: typeof REPLAY_FORMAT_VERSION;
  readonly generatorVersion: string;
  readonly lastFixedStep: number | null;
  readonly seed: string;
}

function finiteAction(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(-1, Math.min(1, value)) * 10_000) / 10_000;
}

export function replayFrame(
  fixedStep: number,
  actions: Readonly<ActionFrame>,
): ReplayActionFrame {
  return Object.freeze({
    debugPressed: actions.debugPressed,
    fixedStep: Math.max(0, Math.floor(fixedStep)),
    pausePressed: actions.pausePressed,
    player: Object.freeze({
      brake: actions.player.brake,
      jumpPressed: actions.player.jumpPressed,
      steer: finiteAction(actions.player.steer),
      trickFlip: finiteAction(actions.player.trickFlip),
      trickSpin: finiteAction(actions.player.trickSpin),
      tuck: actions.player.tuck,
      uphill: actions.player.uphill,
    }),
    resetPressed: actions.resetPressed,
    turboPressed: actions.turboPressed,
  });
}

function hashText(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export class ReplayRecorder {
  private readonly frames: ReplayActionFrame[] = [];
  private droppedFrames = 0;
  readonly capacity: number;

  constructor(
    readonly seed: string,
    readonly generatorVersion: string,
    capacity = DEFAULT_REPLAY_CAPACITY,
  ) {
    this.capacity = Math.max(60, Math.min(36_000, Math.floor(capacity)));
  }

  record(fixedStep: number, actions: Readonly<ActionFrame>): void {
    if (this.frames.length >= this.capacity) {
      this.frames.shift();
      this.droppedFrames += 1;
    }
    this.frames.push(replayFrame(fixedStep, actions));
  }

  getSnapshot(): ReplaySnapshot {
    return Object.freeze({
      capacity: this.capacity,
      count: this.frames.length,
      digest: this.digest(),
      droppedFrames: this.droppedFrames,
      firstFixedStep: this.frames[0]?.fixedStep ?? null,
      format: REPLAY_FORMAT_VERSION,
      generatorVersion: this.generatorVersion,
      lastFixedStep: this.frames.at(-1)?.fixedStep ?? null,
      seed: this.seed,
    });
  }

  export(): ReplayExport {
    return Object.freeze({
      capacity: this.capacity,
      droppedFrames: this.droppedFrames,
      format: REPLAY_FORMAT_VERSION,
      frames: Object.freeze([...this.frames]),
      generatorVersion: this.generatorVersion,
      seed: this.seed,
    });
  }

  private digest(): string {
    const rows = this.frames.map((frame) =>
      [
        frame.fixedStep,
        Number(frame.debugPressed),
        Number(frame.pausePressed),
        Number(frame.resetPressed),
        Number(frame.turboPressed),
        Number(frame.player.brake),
        Number(frame.player.jumpPressed),
        frame.player.steer,
        frame.player.trickFlip,
        frame.player.trickSpin,
        Number(frame.player.tuck),
        Number(frame.player.uphill),
      ].join(","),
    );
    return hashText(
      `${REPLAY_FORMAT_VERSION}|${this.seed}|${this.generatorVersion}|${rows.join(";")}`,
    );
  }
}
