export const FRAME_RATE_TARGET = 60;
export const FRAME_SAMPLE_CAPACITY = 600;

export interface FramePerformanceSnapshot {
  readonly averageFps: number;
  readonly ignoredLifecycleGaps: number;
  readonly lastFrameMs: number;
  readonly longFrameCount: number;
  readonly maximumFrameMs: number;
  readonly p95FrameMs: number;
  readonly p99FrameMs: number;
  readonly rollingLongFrameCount: number;
  readonly rollingLongFrameRatio: number;
  readonly sampleCapacity: number;
  readonly sampleCount: number;
  readonly targetFps: number;
  readonly totalFrames: number;
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundedRatio(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1),
  );
  return sorted[index]!;
}

/** Rolling render-frame audit; lifecycle gaps are reported but excluded. */
export class FramePerformanceMonitor {
  private readonly samples: number[] = [];
  private ignoredLifecycleGaps = 0;
  private longFrameCount = 0;
  private totalFrames = 0;
  private cached?: FramePerformanceSnapshot;

  record(deltaMilliseconds: number): void {
    if (
      !Number.isFinite(deltaMilliseconds) ||
      deltaMilliseconds <= 0 ||
      deltaMilliseconds > 250
    ) {
      this.ignoredLifecycleGaps += 1;
      this.cached = undefined;
      return;
    }
    this.totalFrames += 1;
    if (deltaMilliseconds > 20) this.longFrameCount += 1;
    this.samples.push(deltaMilliseconds);
    if (this.samples.length > FRAME_SAMPLE_CAPACITY) this.samples.shift();
    if (this.totalFrames % 30 === 0 || this.samples.length < 60)
      this.cached = undefined;
  }

  getSnapshot(): FramePerformanceSnapshot {
    if (this.cached) return this.cached;
    const sorted = [...this.samples].sort((left, right) => left - right);
    const total = this.samples.reduce((sum, value) => sum + value, 0);
    const averageFrameMs = this.samples.length
      ? total / this.samples.length
      : 0;
    const rollingLongFrameCount = this.samples.filter(
      (value) => value > 20,
    ).length;
    this.cached = Object.freeze({
      averageFps: averageFrameMs > 0 ? rounded(1_000 / averageFrameMs) : 0,
      ignoredLifecycleGaps: this.ignoredLifecycleGaps,
      lastFrameMs: rounded(this.samples.at(-1) ?? 0),
      longFrameCount: this.longFrameCount,
      maximumFrameMs: rounded(sorted.at(-1) ?? 0),
      p95FrameMs: rounded(percentile(sorted, 0.95)),
      p99FrameMs: rounded(percentile(sorted, 0.99)),
      rollingLongFrameCount,
      rollingLongFrameRatio: this.samples.length
        ? roundedRatio(rollingLongFrameCount / this.samples.length)
        : 0,
      sampleCapacity: FRAME_SAMPLE_CAPACITY,
      sampleCount: this.samples.length,
      targetFps: FRAME_RATE_TARGET,
      totalFrames: this.totalFrames,
    });
    return this.cached;
  }
}
