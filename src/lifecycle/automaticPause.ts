export type AutomaticPauseReason = "blur" | "hidden" | "settings";

export interface AutomaticPauseSnapshot {
  readonly autoPaused: boolean;
  readonly reasons: readonly AutomaticPauseReason[];
}

/** Keeps lifecycle/settings suspension separate from an intentional user pause. */
export class AutomaticPauseController {
  private readonly reasons = new Set<AutomaticPauseReason>();
  private autoPaused = false;

  constructor(
    private readonly isPaused: () => boolean,
    private readonly setPaused: (paused: boolean) => void,
    private readonly resetTransientState: () => void,
  ) {}

  setReason(reason: AutomaticPauseReason, active: boolean): void {
    const changed = active
      ? !this.reasons.has(reason)
      : this.reasons.has(reason);
    if (!changed) return;
    if (active) this.reasons.add(reason);
    else this.reasons.delete(reason);
    this.resetTransientState();
    if (active && !this.isPaused()) {
      this.setPaused(true);
      this.autoPaused = true;
    }
    if (!active && this.reasons.size === 0 && this.autoPaused) {
      this.setPaused(false);
      this.autoPaused = false;
    }
  }

  getSnapshot(): AutomaticPauseSnapshot {
    return Object.freeze({
      autoPaused: this.autoPaused,
      reasons: Object.freeze([...this.reasons].sort()),
    });
  }
}
