import { describe, expect, it } from "vitest";
import { FRAME_SAMPLE_CAPACITY, FramePerformanceMonitor } from "./frameMonitor";

describe("frame performance monitor", () => {
  it("reports a bounded rolling 60fps-target window", () => {
    const monitor = new FramePerformanceMonitor();
    for (let frame = 0; frame < FRAME_SAMPLE_CAPACITY + 50; frame += 1)
      monitor.record(1_000 / 60);
    expect(monitor.getSnapshot()).toMatchObject({
      averageFps: 60,
      p95FrameMs: 16.67,
      rollingLongFrameCount: 0,
      rollingLongFrameRatio: 0,
      sampleCapacity: 600,
      sampleCount: 600,
      targetFps: 60,
      totalFrames: 650,
    });
  });

  it("reports but excludes lifecycle gaps from frame statistics", () => {
    const monitor = new FramePerformanceMonitor();
    monitor.record(16);
    monitor.record(1_200);
    monitor.record(Number.NaN);
    monitor.record(20);
    monitor.record(21);
    expect(monitor.getSnapshot()).toMatchObject({
      averageFps: 52.63,
      ignoredLifecycleGaps: 2,
      maximumFrameMs: 21,
      rollingLongFrameCount: 1,
      rollingLongFrameRatio: 0.3333,
      sampleCount: 3,
      totalFrames: 3,
    });
  });
});
