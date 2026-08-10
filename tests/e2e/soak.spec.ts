import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import type { EventModeId } from "../../src/simulation/modes";

const REQUIRED_SOAK_MS = 20 * 60 * 1_000;
const SAMPLE_INTERVAL_MS = 30_000;

interface MetricEntry {
  readonly name: string;
  readonly value: number;
}

function metric(metrics: readonly MetricEntry[], name: string): number {
  return metrics.find((entry) => entry.name === name)?.value ?? -1;
}

async function stageCourse(
  page: Page,
  mode: EventModeId,
  target: "finish" | "start",
): Promise<void> {
  expect(
    await page.evaluate(
      ({ selectedMode, selectedTarget }) =>
        window.__FREE_SKI_DEBUG__?.stageCourseCrossing(
          selectedMode,
          selectedTarget,
        ),
      { selectedMode: mode, selectedTarget: target },
    ),
  ).toBe(true);
  await page.waitForFunction(
    ({ selectedMode, selectedTarget }) => {
      const course = window.__FREE_SKI__?.modes.snapshot.courses[selectedMode];
      return selectedTarget === "start"
        ? course?.lifecycle === "active"
        : course?.lifecycle === "finished";
    },
    { selectedMode: mode, selectedTarget: target },
  );
}

test("runs the fixed 20 wall-minute release soak", async ({ page }) => {
  test.skip(
    process.env.FREESKI_RUN_SOAK !== "1",
    "Use npm run test:soak; the release duration cannot be shortened.",
  );
  test.setTimeout(REQUIRED_SOAK_MS + 180_000);

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => failedRequests.push(request.url()));
  await page.addInitScript(() => {
    const scope = window as typeof window & {
      __FREE_SKI_SOAK_AUDIO_CONTEXTS__?: number;
    };
    scope.__FREE_SKI_SOAK_AUDIO_CONTEXTS__ = 0;
    const Original = scope.AudioContext;
    if (!Original) return;
    Object.defineProperty(scope, "AudioContext", {
      configurable: true,
      value: new Proxy(Original, {
        construct(target, argumentsList) {
          scope.__FREE_SKI_SOAK_AUDIO_CONTEXTS__ =
            (scope.__FREE_SKI_SOAK_AUDIO_CONTEXTS__ ?? 0) + 1;
          return Reflect.construct(target, argumentsList);
        },
      }),
      writable: true,
    });
  });

  await page.setViewportSize({ width: 1024, height: 720 });
  await page.goto("/?seed=gate-seven-soak&training=1&courseTest=1");
  await expect(page.locator("#game-shell")).toHaveAttribute(
    "data-game-ready",
    "true",
  );
  await page
    .locator("#game-canvas canvas")
    .click({ position: { x: 30, y: 30 } });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __FREE_SKI_SOAK_AUDIO_CONTEXTS__?: number;
            }
          ).__FREE_SKI_SOAK_AUDIO_CONTEXTS__ ?? 0,
      ),
    )
    .toBe(1);

  const descent = await page.evaluate(() =>
    window.__FREE_SKI_DEBUG__?.runAutomatedDescent(2_100),
  );
  expect(descent).toMatchObject({
    corridorBlockers: 0,
    missingChunks: 0,
    passed: true,
  });
  expect(descent?.endY).toBeGreaterThanOrEqual(2_100);

  for (const mode of ["slalom", "tree-slalom", "free-style"] as const) {
    await stageCourse(page, mode, "start");
    await stageCourse(page, mode, "finish");
  }
  expect(
    await page.evaluate(
      () =>
        window.__FREE_SKI__?.modes.events.filter(
          (event) => event.type === "mode-finished",
        ).length,
    ),
  ).toBe(3);

  expect(
    await page.evaluate(() =>
      window.__FREE_SKI_DEBUG__?.stageLivingScenario("yeti-bottom"),
    ),
  ).toBe(true);
  await page.waitForFunction(
    () =>
      (window.__FREE_SKI__?.player.worldY ?? 0) > 2_000 &&
      window.__FREE_SKI__?.yeti.events.some(
        (event) =>
          event.type === "yeti-activated" && event.boundary === "bottom",
      ),
  );
  const runNumberBeforeReset = await page.evaluate(
    () => window.__FREE_SKI__!.player.runNumber,
  );
  await page.keyboard.press("r");
  await page.waitForFunction((previousRunNumber) => {
    const player = window.__FREE_SKI__?.player;
    return (
      player !== undefined &&
      player.runNumber > previousRunNumber &&
      player.motion === "grounded" &&
      player.simulationSeconds < 2 &&
      player.worldY >= 0 &&
      player.worldY < 10
    );
  }, runNumberBeforeReset);

  const client = await page.context().newCDPSession(page);
  await client.send("Performance.enable");
  const samples: Array<Record<string, unknown>> = [];
  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();
  let cycle = 0;

  while (Date.now() - startedAt < REQUIRED_SOAK_MS) {
    cycle += 1;
    const direction = cycle % 2 === 0 ? "ArrowLeft" : "ArrowRight";
    await page.keyboard.down(direction);
    await page.keyboard.down("ArrowDown");
    await page.waitForTimeout(800);
    await page.keyboard.up(direction);
    await page.keyboard.up("ArrowDown");
    if (cycle % 3 === 0) await page.keyboard.press("Space");
    if (cycle % 4 === 0) await page.keyboard.press("f");

    if (cycle % 5 === 0) {
      await page.setViewportSize(
        cycle % 10 === 0
          ? { height: 600, width: 768 }
          : { height: 720, width: 1024 },
      );
      await page.waitForFunction(
        () => window.__FREE_SKI__?.lifecycle.reasons.length === 0,
      );
    }
    if (cycle % 8 === 0) {
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          value: "hidden",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await page.waitForFunction(() =>
        window.__FREE_SKI__?.lifecycle.reasons.includes("hidden"),
      );
      await page.waitForTimeout(250);
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          value: "visible",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await page.waitForFunction(
        () => window.__FREE_SKI__?.lifecycle.reasons.length === 0,
      );
    }
    if (cycle % 10 === 0) {
      await page.evaluate(() => window.dispatchEvent(new Event("blur")));
      await page.waitForFunction(() =>
        window.__FREE_SKI__?.lifecycle.reasons.includes("blur"),
      );
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await page.waitForFunction(
        () => window.__FREE_SKI__?.lifecycle.reasons.length === 0,
      );
    }
    if (cycle % 12 === 0) {
      expect(
        await page.evaluate(() =>
          window.__FREE_SKI_DEBUG__?.stageLivingScenario("population"),
        ),
      ).toBe(true);
    }

    const remaining = REQUIRED_SOAK_MS - (Date.now() - startedAt);
    if (remaining > 0)
      await page.waitForTimeout(Math.min(SAMPLE_INTERVAL_MS - 800, remaining));
    const browserMetrics = (await client.send("Performance.getMetrics"))
      .metrics as MetricEntry[];
    samples.push(
      await page.evaluate(
        ({ elapsedMs, heapBytes }) => {
          const runtime = window.__FREE_SKI__!;
          return {
            actors: runtime.performance.bounds.actorCount,
            audioContexts:
              (
                window as typeof window & {
                  __FREE_SKI_SOAK_AUDIO_CONTEXTS__?: number;
                }
              ).__FREE_SKI_SOAK_AUDIO_CONTEXTS__ ?? 0,
            cachedChunks: runtime.world.cachedChunks,
            elapsedMs,
            fixedSteps: runtime.telemetry.fixedSteps,
            heapBytes,
            missingChunks: runtime.world.missingRequiredChunks,
            pooledSprites: runtime.performance.bounds.pooledSprites,
            replayCount: runtime.replay.count,
            replayDropped: runtime.replay.droppedFrames,
            vfxEffects: runtime.performance.bounds.vfxEffects,
            vfxTracks: runtime.performance.bounds.vfxTracks,
          };
        },
        {
          elapsedMs: Date.now() - startedAt,
          heapBytes: metric(browserMetrics, "JSHeapUsedSize"),
        },
      ),
    );
  }

  const elapsedMs = Date.now() - startedAt;
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });
  await page.keyboard.press("r");
  await page.waitForFunction(
    () =>
      window.__FREE_SKI__?.player.motion === "grounded" &&
      window.__FREE_SKI__?.lifecycle.reasons.length === 0,
  );
  const beforePostSoakInput = await page.evaluate(
    () => window.__FREE_SKI__!.player.worldX,
  );
  await page.keyboard.down("ArrowRight");
  await page.waitForFunction(
    (before) =>
      window.__FREE_SKI__?.settings.heldActions.includes("steer-right") &&
      (window.__FREE_SKI__?.player.worldX ?? before) > before,
    beforePostSoakInput,
  );
  await page.keyboard.up("ArrowRight");
  await page.waitForFunction(
    () => !window.__FREE_SKI__?.settings.heldActions.includes("steer-right"),
  );

  const runtime = await page.evaluate(() => window.__FREE_SKI__!);
  const heaps = samples.map((sample) => Number(sample.heapBytes));
  const report = {
    browserProfile: {
      claim:
        "Production Chromium wall-clock soak with the disclosed GPU-raster flags; not a physical-GPU certification.",
      launchFlags: [
        "disable-background-timer-throttling",
        "disable-renderer-backgrounding",
        "enable-gpu-rasterization",
        "enable-zero-copy",
        "ignore-gpu-blocklist",
      ],
      viewportSequence: ["1024x720", "768x600"],
    },
    consoleErrors,
    descent,
    elapsedMs,
    finishedAtIso: new Date().toISOString(),
    heapTrend: {
      finalBytes: heaps.at(-1),
      growthBytes: (heaps.at(-1) ?? 0) - (heaps[0] ?? 0),
      initialBytes: heaps[0],
      peakBytes: Math.max(...heaps),
    },
    pageErrors,
    postSoakInput: {
      finalWorldX: runtime.player.worldX,
      initialWorldX: beforePostSoakInput,
      responsive: runtime.player.worldX > beforePostSoakInput,
    },
    requestFailures: failedRequests,
    runtime: {
      art: runtime.art,
      lifecycle: runtime.lifecycle,
      performance: runtime.performance,
      replay: runtime.replay,
      world: runtime.world,
    },
    sampleIntervalMs: SAMPLE_INTERVAL_MS,
    samples,
    startedAtIso,
  };
  const evidencePath = process.env.FREESKI_GATE7_SOAK;
  if (evidencePath)
    writeFileSync(evidencePath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`FREESKI_SOAK_AUDIT ${JSON.stringify(report)}`);

  expect(elapsedMs).toBeGreaterThanOrEqual(REQUIRED_SOAK_MS);
  expect(samples.length).toBeGreaterThanOrEqual(40);
  expect(Math.max(...heaps) - Math.min(...heaps)).toBeLessThan(
    96 * 1024 * 1024,
  );
  expect((heaps.at(-1) ?? 0) - (heaps[0] ?? 0)).toBeLessThan(64 * 1024 * 1024);
  for (const sample of samples) {
    expect(Number(sample.actors)).toBeLessThanOrEqual(
      runtime.performance.bounds.actorCapacity,
    );
    expect(Number(sample.pooledSprites)).toBeLessThanOrEqual(
      runtime.performance.bounds.spriteCapacity,
    );
    expect(Number(sample.vfxEffects)).toBeLessThanOrEqual(
      runtime.performance.bounds.vfxEffectsCapacity,
    );
    expect(Number(sample.vfxTracks)).toBeLessThanOrEqual(
      runtime.performance.bounds.vfxTracksCapacity,
    );
    expect(Number(sample.cachedChunks)).toBeLessThanOrEqual(64);
    expect(sample.missingChunks).toBe(0);
    expect(sample.audioContexts).toBe(1);
    expect(Number(sample.replayCount)).toBeLessThanOrEqual(
      runtime.replay.capacity,
    );
  }
  expect(runtime.art.capacityFallbacks).toBe(0);
  expect(runtime.art.missingFrameFallbacks).toBe(0);
  expect(runtime.world.missingRequiredChunks).toBe(0);
  expect(runtime.settings.heldActions).toEqual([]);
  expect(report.postSoakInput.responsive).toBe(true);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});
