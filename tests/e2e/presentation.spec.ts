import { expect, test, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

async function screenshot(page: Page, name: string): Promise<void> {
  const directory = process.env.FREESKI_GATE6_EVIDENCE_DIR;
  if (directory)
    await page.screenshot({ path: join(directory, name), fullPage: true });
}

async function instrumentAudioContexts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const scope = window as typeof window & {
      __FREE_SKI_AUDIO_CONTEXT_AUDIT__?: {
        constructed: number;
        initialStates: string[];
      };
      webkitAudioContext?: typeof AudioContext;
    };
    const audit = { constructed: 0, initialStates: [] as string[] };
    scope.__FREE_SKI_AUDIO_CONTEXT_AUDIT__ = audit;
    const wrapped = new Map<typeof AudioContext, typeof AudioContext>();
    const wrap = (Original: typeof AudioContext): typeof AudioContext => {
      const existing = wrapped.get(Original);
      if (existing) return existing;
      const Instrumented = new Proxy(Original, {
        construct(target, argumentsList) {
          const context = Reflect.construct(
            target,
            argumentsList,
          ) as AudioContext;
          audit.constructed += 1;
          audit.initialStates.push(context.state);
          return context;
        },
      });
      wrapped.set(Original, Instrumented);
      return Instrumented;
    };
    if (scope.AudioContext)
      Object.defineProperty(scope, "AudioContext", {
        configurable: true,
        value: wrap(scope.AudioContext),
        writable: true,
      });
    if (scope.webkitAudioContext)
      Object.defineProperty(scope, "webkitAudioContext", {
        configurable: true,
        value: wrap(scope.webkitAudioContext),
        writable: true,
      });
  });
}

async function audioContextCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (
        window as typeof window & {
          __FREE_SKI_AUDIO_CONTEXT_AUDIT__?: { constructed: number };
        }
      ).__FREE_SKI_AUDIO_CONTEXT_AUDIT__?.constructed ?? -1,
  );
}

test("loads production art, bounded VFX, compact HUD, and gesture-gated persistent audio", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const errorResponses: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => failedRequests.push(request.url()));
  page.on("response", (response) => {
    if (response.status() >= 400)
      errorResponses.push(`${response.status()} ${response.url()}`);
  });

  await instrumentAudioContexts(page);
  await page.goto("/?seed=gate-six-presentation&debug=1");
  await expect(page.locator("#game-shell")).toHaveAttribute(
    "data-game-ready",
    "true",
  );
  await page.evaluate(() => window.__FREE_SKI_DEBUG__?.setVisible(false));
  expect(await page.evaluate(() => window.__FREE_SKI__!.art)).toMatchObject({
    atlasFrameCount: 112,
    atlasLoaded: true,
    capacityFallbacks: 0,
    fallbackDraws: 0,
    missingFrameFallbacks: 0,
    spriteCapacity: 512,
  });
  expect(await page.evaluate(() => window.__FREE_SKI__!.audio)).toMatchObject({
    availableCues: 26,
    gestureRequired: true,
    muted: false,
    unlocked: false,
  });
  const initialColdAudioContexts = await audioContextCount(page);
  expect(initialColdAudioContexts).toBe(0);

  await page.evaluate(() =>
    window.__FREE_SKI_DEBUG__?.stageLivingScenario("population"),
  );
  await page.keyboard.down("s");
  await page.waitForFunction(
    () =>
      window.__FREE_SKI__?.audio.unlocked === true &&
      (window.__FREE_SKI__?.player.worldY ?? 0) > 12 &&
      (window.__FREE_SKI__?.vfx.activeTracks ?? 0) > 0 &&
      (window.__FREE_SKI__?.art.pooledSprites ?? 0) > 8,
  );
  await page.keyboard.up("s");
  const initialGestureAudioContexts = await audioContextCount(page);
  expect(initialGestureAudioContexts).toBe(1);
  await screenshot(page, "bright-snow-desktop.png");
  const activePresentation = await page.evaluate(() => ({
    art: window.__FREE_SKI__!.art,
    audio: window.__FREE_SKI__!.audio,
    vfx: window.__FREE_SKI__!.vfx,
  }));
  expect(activePresentation.vfx.activeEffects).toBeLessThanOrEqual(
    activePresentation.vfx.maximumEffects,
  );
  expect(activePresentation.vfx.activeTracks).toBeLessThanOrEqual(
    activePresentation.vfx.maximumTracks,
  );
  expect(activePresentation.art).toMatchObject({
    capacityFallbacks: 0,
    fallbackDraws: 0,
    frameFallbacks: 0,
    missingFrameFallbacks: 0,
    statusLabelDepth: 90,
  });
  expect(activePresentation.art.playerRenderedHeight).toBeGreaterThanOrEqual(
    48,
  );

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => {
    window.__FREE_SKI_DEBUG__?.stageLivingScenario("population");
    window.__FREE_SKI_DEBUG__?.stageLivingScenario("chair-drop");
  });
  await page.waitForFunction(
    () => (window.__FREE_SKI__?.art.pooledSprites ?? 0) > 196,
  );
  const stressPresentation = await page.evaluate(
    () => window.__FREE_SKI__!.art,
  );
  expect(stressPresentation.pooledSprites).toBeLessThanOrEqual(
    stressPresentation.spriteCapacity,
  );
  expect(stressPresentation.peakPooledSprites).toBeLessThanOrEqual(
    stressPresentation.spriteCapacity,
  );
  expect(stressPresentation).toMatchObject({
    capacityFallbacks: 0,
    fallbackDraws: 0,
    frameFallbacks: 0,
    missingFrameFallbacks: 0,
  });
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.locator("#audio-toggle").click();
  await expect(page.locator("#audio-toggle")).toHaveText("SOUND MUTED");
  expect(
    await page.evaluate(() => localStorage.getItem("freeski.audio.muted.v1")),
  ).toBe("true");
  await page.reload();
  await expect(page.locator("#game-shell")).toHaveAttribute(
    "data-game-ready",
    "true",
  );
  expect(await page.evaluate(() => window.__FREE_SKI__!.audio)).toMatchObject({
    gestureRequired: true,
    muted: true,
    unlocked: false,
  });
  const reloadColdAudioContexts = await audioContextCount(page);
  expect(reloadColdAudioContexts).toBe(0);
  await page.locator("#audio-toggle").click();
  await page.waitForFunction(
    () =>
      window.__FREE_SKI__?.audio.unlocked === true &&
      window.__FREE_SKI__?.audio.muted === false,
  );
  const reloadGestureAudioContexts = await audioContextCount(page);
  expect(reloadGestureAudioContexts).toBe(1);

  await page.setViewportSize({ width: 768, height: 600 });
  await page.evaluate(() => {
    window.__FREE_SKI_DEBUG__?.setVisible(false);
    return window.__FREE_SKI_DEBUG__?.stageLivingScenario("population");
  });
  await page.waitForFunction(
    () =>
      (window.__FREE_SKI__?.art.pooledSprites ?? 0) > 8 &&
      window.__FREE_SKI__?.art.fallbackDraws === 0,
  );
  await screenshot(page, "bright-snow-768x600.png");
  await page.evaluate(() => {
    window.__FREE_SKI_DEBUG__?.setVisible(false);
    return window.__FREE_SKI_DEBUG__?.stageLivingScenario("foreshadow");
  });
  await page.waitForFunction(
    () => (window.__FREE_SKI__?.yeti.snapshot.foreshadow.intensity ?? 0) > 0.5,
  );
  const visibleBoxes = await page.evaluate(() => {
    const selectors = [
      ".instrument-strip > .metric",
      "#audio-toggle",
      "#pointer-toggle",
      "#world-debug-toggle",
    ];
    return selectors.flatMap((selector) =>
      [...document.querySelectorAll<HTMLElement>(selector)]
        .filter((element) => getComputedStyle(element).display !== "none")
        .map((element) => {
          const box = element.getBoundingClientRect();
          return {
            bottom: box.bottom,
            left: box.left,
            right: box.right,
            top: box.top,
          };
        }),
    );
  });
  for (let left = 0; left < visibleBoxes.length; left += 1) {
    for (let right = left + 1; right < visibleBoxes.length; right += 1) {
      const a = visibleBoxes[left]!;
      const b = visibleBoxes[right]!;
      const overlaps =
        a.left < b.right &&
        a.right > b.left &&
        a.top < b.bottom &&
        a.bottom > b.top;
      expect(overlaps).toBe(false);
    }
  }
  await expect(page.locator("#time-label")).toBeVisible();
  await expect(page.locator("#speed-label")).toBeVisible();
  await expect(page.locator("#distance-label")).toBeVisible();
  await expect(page.locator("#style-label")).toBeVisible();
  await expect(page.locator("#mode-name")).toBeVisible();
  await expect(page.locator("#turbo-indicator")).toBeVisible();
  await expect(page.locator("#seed-label")).toBeVisible();
  const seedAudit = await page.locator("#seed-label").evaluate((element) => ({
    ariaLabel: element.getAttribute("aria-label"),
    clientHeight: element.clientHeight,
    clientWidth: element.clientWidth,
    scrollHeight: element.scrollHeight,
    scrollWidth: element.scrollWidth,
    text: element.textContent,
    title: element.getAttribute("title"),
  }));
  expect(seedAudit).toMatchObject({
    ariaLabel: "Active world seed: gate-six-presentation",
    text: "gate-six-presentation",
    title: "Active world seed: gate-six-presentation",
  });
  expect(seedAudit.scrollWidth).toBeLessThanOrEqual(seedAudit.clientWidth);
  expect(seedAudit.scrollHeight).toBeLessThanOrEqual(seedAudit.clientHeight);
  const formAudit = await page.locator("#motion-label").evaluate((element) => ({
    clientHeight: element.clientHeight,
    clientWidth: element.clientWidth,
    scrollHeight: element.scrollHeight,
    scrollWidth: element.scrollWidth,
  }));
  expect(formAudit.scrollWidth).toBeLessThanOrEqual(formAudit.clientWidth);
  expect(formAudit.scrollHeight).toBeLessThanOrEqual(formAudit.clientHeight);
  const turboAudit = await page
    .locator("#turbo-indicator")
    .evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      text: element.textContent,
    }));
  expect(turboAudit.text).toBe("TURBO OFF");
  expect(turboAudit.scrollWidth).toBeLessThanOrEqual(turboAudit.clientWidth);
  expect(await page.evaluate(() => window.__FREE_SKI__!.art)).toMatchObject({
    capacityFallbacks: 0,
    fallbackDraws: 0,
    frameFallbacks: 0,
    missingFrameFallbacks: 0,
    statusLabelDepth: 90,
  });
  expect(
    await page.evaluate(() => window.__FREE_SKI__!.art.playerRenderedHeight),
  ).toBeGreaterThanOrEqual(48);
  await screenshot(page, "dark-snow-768x600.png");

  await page.setViewportSize({ width: 1280, height: 720 });
  await screenshot(page, "dark-snow-desktop.png");

  const runtimeTelemetry = await page.evaluate(() => ({
    art: window.__FREE_SKI__!.art,
    audio: window.__FREE_SKI__!.audio,
    audioContextAudit: (
      window as typeof window & {
        __FREE_SKI_AUDIO_CONTEXT_AUDIT__?: {
          constructed: number;
          initialStates: string[];
        };
      }
    ).__FREE_SKI_AUDIO_CONTEXT_AUDIT__,
    hud: {
      form: document.querySelector("#motion-label")?.textContent,
      seed: document.querySelector("#seed-label")?.textContent,
    },
    player: window.__FREE_SKI__!.player,
    vfx: window.__FREE_SKI__!.vfx,
    yeti: window.__FREE_SKI__!.yeti,
  }));
  const telemetry = {
    ...runtimeTelemetry,
    audioContextLifecycle: {
      initialCold: initialColdAudioContexts,
      initialGesture: initialGestureAudioContexts,
      reloadCold: reloadColdAudioContexts,
      reloadGesture: reloadGestureAudioContexts,
    },
    minimumViewport: {
      form: formAudit,
      seed: seedAudit,
      turbo: turboAudit,
    },
    stressPresentation,
  };
  const telemetryPath = process.env.FREESKI_GATE6_TELEMETRY;
  if (telemetryPath)
    writeFileSync(telemetryPath, `${JSON.stringify(telemetry, null, 2)}\n`);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
  expect(errorResponses).toEqual([]);
});
