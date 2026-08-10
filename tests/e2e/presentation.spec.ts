import { expect, test, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

async function screenshot(page: Page, name: string): Promise<void> {
  const directory = process.env.FREESKI_GATE6_EVIDENCE_DIR;
  if (directory)
    await page.screenshot({ path: join(directory, name), fullPage: true });
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

  await page.goto("/?seed=gate-six-presentation&debug=1");
  await expect(page.locator("#game-shell")).toHaveAttribute(
    "data-game-ready",
    "true",
  );
  await page.evaluate(() => window.__FREE_SKI_DEBUG__?.setVisible(false));
  expect(await page.evaluate(() => window.__FREE_SKI__!.art)).toMatchObject({
    atlasFrameCount: 112,
    atlasLoaded: true,
    spriteCapacity: 196,
  });
  expect(await page.evaluate(() => window.__FREE_SKI__!.audio)).toMatchObject({
    availableCues: 26,
    gestureRequired: true,
    muted: false,
    unlocked: false,
  });

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
  await page.locator("#audio-toggle").click();
  await page.waitForFunction(
    () =>
      window.__FREE_SKI__?.audio.unlocked === true &&
      window.__FREE_SKI__?.audio.muted === false,
  );

  await page.setViewportSize({ width: 768, height: 600 });
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
  await screenshot(page, "dark-snow-768x600.png");

  const telemetry = await page.evaluate(() => ({
    art: window.__FREE_SKI__!.art,
    audio: window.__FREE_SKI__!.audio,
    player: window.__FREE_SKI__!.player,
    vfx: window.__FREE_SKI__!.vfx,
    yeti: window.__FREE_SKI__!.yeti,
  }));
  const telemetryPath = process.env.FREESKI_GATE6_TELEMETRY;
  if (telemetryPath)
    writeFileSync(telemetryPath, `${JSON.stringify(telemetry, null, 2)}\n`);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
  expect(errorResponses).toEqual([]);
});
