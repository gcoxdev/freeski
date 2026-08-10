import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

test.use({ screenshot: "off", trace: "off" });

interface MetricEntry {
  readonly name: string;
  readonly value: number;
}

function metric(metrics: readonly MetricEntry[], name: string): number {
  return metrics.find((entry) => entry.name === name)?.value ?? -1;
}

async function emptyRafCeiling(page: Page) {
  await page.goto("data:text/html,<title>FreeSki rAF ceiling</title>");
  return page.evaluate(
    () =>
      new Promise<{
        averageFps: number;
        longFrameRatio: number;
        p95FrameMs: number;
        p99FrameMs: number;
      }>((resolve) => {
        const samples: number[] = [];
        let previous = performance.now();
        const sample = (now: number) => {
          if (samples.length > 0) samples.push(now - previous);
          else samples.push(0);
          previous = now;
          if (samples.length < 300) {
            requestAnimationFrame(sample);
            return;
          }
          const measured = samples.slice(1);
          const sorted = [...measured].sort((left, right) => left - right);
          const averageMs =
            measured.reduce((sum, value) => sum + value, 0) / measured.length;
          resolve({
            averageFps: Math.round((1_000 / averageMs) * 100) / 100,
            longFrameRatio:
              Math.round(
                (measured.filter((value) => value > 20).length /
                  measured.length) *
                  10_000,
              ) / 10_000,
            p95FrameMs:
              Math.round(sorted[Math.ceil(sorted.length * 0.95) - 1]! * 100) /
              100,
            p99FrameMs:
              Math.round(sorted[Math.ceil(sorted.length * 0.99) - 1]! * 100) /
              100,
          });
        };
        requestAnimationFrame(sample);
      }),
  );
}

test("holds the 60 fps target in a disclosed constrained Chromium proxy", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "production-chromium",
    "The claim requires playwright.production.config.ts launch flags.",
  );
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 768, height: 600 });
  const client = await page.context().newCDPSession(page);
  await client.send("Performance.enable");
  await client.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  const rafCeiling = await emptyRafCeiling(page);

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/?seed=gate-seven-performance&training=1");
  await expect(page.locator("#game-shell")).toHaveAttribute(
    "data-game-ready",
    "true",
  );
  const initialMetrics = (await client.send("Performance.getMetrics"))
    .metrics as MetricEntry[];
  await page.locator("#game-canvas canvas").focus();
  await page.keyboard.down("ArrowDown");
  // A wall-clock wait avoids injecting a requestAnimationFrame poll into the
  // page under measurement. Thirteen seconds fills the 600-frame window while
  // leaving headroom for startup jitter.
  await page.waitForTimeout(13_000);
  await page.keyboard.up("ArrowDown");
  const finalMetrics = (await client.send("Performance.getMetrics"))
    .metrics as MetricEntry[];

  const audit = await page.evaluate(() => {
    const runtime = window.__FREE_SKI__!;
    const canvas = document.querySelector<HTMLCanvasElement>(
      "#game-canvas canvas",
    );
    return {
      art: runtime.art,
      bounds: runtime.performance.bounds,
      droppedSeconds: runtime.telemetry.droppedSeconds,
      engine: runtime.engine,
      frame: runtime.performance.frame,
      livingSlope: {
        actorCount: runtime.livingSlope.snapshot.actorCount,
        bounded: runtime.livingSlope.snapshot.bounded,
        workUnitsLastStep: runtime.livingSlope.snapshot.workUnitsLastStep,
      },
      renderer: canvas?.getContext("webgl2")
        ? "webgl2"
        : canvas?.getContext("webgl")
          ? "webgl"
          : canvas?.getContext("2d")
            ? "canvas-2d"
            : "unknown",
      replay: runtime.replay,
      viewport: { height: innerHeight, width: innerWidth },
      world: runtime.world,
    };
  });
  const report = {
    ...audit,
    browserProfile: {
      claim:
        "Repeatable WebGL/Canvas browser stress proxy for integrated-GPU-class play; not a physical-GPU certification.",
      cpuThrottlingRate: 1,
      productionLaunchFlags: [
        "disable-background-timer-throttling",
        "disable-renderer-backgrounding",
        "enable-gpu-rasterization",
        "enable-zero-copy",
        "ignore-gpu-blocklist",
      ],
      renderer: audit.renderer,
      viewport: audit.viewport,
    },
    consoleErrors,
    emptyRafCeiling: rafCeiling,
    heap: {
      finalBytes: metric(finalMetrics, "JSHeapUsedSize"),
      growthBytes:
        metric(finalMetrics, "JSHeapUsedSize") -
        metric(initialMetrics, "JSHeapUsedSize"),
      initialBytes: metric(initialMetrics, "JSHeapUsedSize"),
    },
    pageErrors,
  };
  const evidencePath = process.env.FREESKI_GATE7_PERFORMANCE;
  if (evidencePath)
    writeFileSync(evidencePath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`FREESKI_PERFORMANCE_AUDIT ${JSON.stringify(report)}`);

  expect(report.browserProfile).toMatchObject({
    cpuThrottlingRate: 1,
    renderer: expect.stringMatching(/^webgl|canvas-2d$/),
    viewport: { height: 600, width: 768 },
  });
  expect(report.frame.targetFps).toBe(60);
  expect(report.emptyRafCeiling.averageFps).toBeGreaterThanOrEqual(58);
  expect(report.frame.sampleCount).toBe(report.frame.sampleCapacity);
  expect(report.frame.averageFps).toBeGreaterThanOrEqual(55);
  expect(report.frame.averageFps).toBeGreaterThanOrEqual(
    report.emptyRafCeiling.averageFps * 0.92,
  );
  // Headless Canvas scheduling may miss one vsync without accumulating fixed-
  // step debt. The proxy allows 1.5 frame budgets at p95 and two at p99 while
  // requiring the rolling average to remain within 5 fps of the 60 fps target.
  expect(report.frame.p95FrameMs).toBeLessThanOrEqual(25);
  expect(report.frame.p99FrameMs).toBeLessThanOrEqual(34);
  expect(report.frame.rollingLongFrameRatio).toBeLessThan(0.08);
  expect(report.bounds.actorCount).toBeLessThanOrEqual(
    report.bounds.actorCapacity,
  );
  expect(report.bounds.pooledSprites).toBeLessThanOrEqual(
    report.bounds.spriteCapacity,
  );
  expect(report.bounds.vfxEffects).toBeLessThanOrEqual(
    report.bounds.vfxEffectsCapacity,
  );
  expect(report.bounds.vfxTracks).toBeLessThanOrEqual(
    report.bounds.vfxTracksCapacity,
  );
  expect(report.livingSlope).toMatchObject({
    bounded: true,
    workUnitsLastStep: report.livingSlope.actorCount,
  });
  expect(report.art.capacityFallbacks).toBe(0);
  expect(report.art.missingFrameFallbacks).toBe(0);
  expect(report.world.missingRequiredChunks).toBe(0);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
