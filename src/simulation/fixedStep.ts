export const SIMULATION_HZ = 60;
export const SIMULATION_STEP_SECONDS = 1 / SIMULATION_HZ;

export interface FixedStepResult {
  alpha: number;
  droppedSeconds: number;
  steps: number;
}

/** Engine-independent fixed-step accumulator for deterministic gameplay updates. */
export class FixedStepClock {
  private accumulatorSeconds = 0;

  constructor(
    private readonly stepSeconds = SIMULATION_STEP_SECONDS,
    private readonly maximumStepsPerFrame = 8,
  ) {
    if (stepSeconds <= 0) throw new RangeError("stepSeconds must be positive");
    if (maximumStepsPerFrame < 1)
      throw new RangeError("maximumStepsPerFrame must be at least 1");
  }

  advance(
    elapsedSeconds: number,
    step: (deltaSeconds: number) => void,
  ): FixedStepResult {
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
      throw new RangeError("elapsedSeconds must be finite and non-negative");
    }

    this.accumulatorSeconds += elapsedSeconds;
    let steps = 0;
    const comparisonTolerance = this.stepSeconds * 1e-9;
    while (
      this.accumulatorSeconds + comparisonTolerance >= this.stepSeconds &&
      steps < this.maximumStepsPerFrame
    ) {
      step(this.stepSeconds);
      this.accumulatorSeconds -= this.stepSeconds;
      if (Math.abs(this.accumulatorSeconds) < comparisonTolerance)
        this.accumulatorSeconds = 0;
      steps += 1;
    }

    let droppedSeconds = 0;
    if (this.accumulatorSeconds + comparisonTolerance >= this.stepSeconds) {
      droppedSeconds =
        this.accumulatorSeconds - (this.accumulatorSeconds % this.stepSeconds);
      this.accumulatorSeconds %= this.stepSeconds;
    }

    return {
      alpha: this.accumulatorSeconds / this.stepSeconds,
      droppedSeconds,
      steps,
    };
  }

  reset(): void {
    this.accumulatorSeconds = 0;
  }
}
