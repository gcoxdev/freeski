import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { FreeSkiRuntime } from "../../src/render/runtimeBridge";

async function runtimeSnapshot(page: Page): Promise<FreeSkiRuntime> {
  await page.waitForFunction(() => window.__FREE_SKI__?.ready);
  return page.evaluate(() => {
    if (!window.__FREE_SKI__) throw new Error("FreeSki runtime is not ready");
    return window.__FREE_SKI__;
  });
}

async function holdKey(page: Page, key: string, milliseconds: number) {
  await page.keyboard.down(key);
  await page.waitForTimeout(milliseconds);
  await page.keyboard.up(key);
}

test("shows a fully styled loading state before the game bundle is ready", async ({
  page,
}) => {
  await page.route("**/src/main.ts*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    await route.continue();
  });
  await page.goto("/", { waitUntil: "commit" });
  const loading = page.locator("#loading-screen");
  await expect(loading).toBeVisible();
  await expect(loading).toHaveCSS("position", "absolute");
  await expect(loading).toHaveCSS("color", "rgb(247, 249, 245)");
  await expect(page.locator("#loading-status")).toHaveText(
    /Starting|Loading|Opening/,
  );
  await expect(page.locator("#game-shell")).toHaveAttribute(
    "data-game-ready",
    "true",
    { timeout: 20_000 },
  );
  await expect(loading).toBeHidden();
});

test("loads an interactive Phaser baseline without console errors", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/?seed=gate-zero-proof");

  const shell = page.locator("#game-shell");
  await expect(shell).toHaveAttribute("data-game-ready", "true");
  await expect(page.locator("#system-label")).toHaveText(
    "Alpine systems online",
  );
  await expect(page.locator("#game-canvas canvas")).toBeVisible();
  expect(await page.evaluate(() => window.__FREE_SKI__!.seed)).toBe(
    "gate-zero-proof",
  );

  await page.keyboard.press("ArrowLeft");
  await expect
    .poll(() => page.evaluate(() => window.__FREE_SKI__?.lastInput))
    .toBe("ArrowLeft");

  const runtime = await page.evaluate(() => window.__FREE_SKI__);
  expect(runtime).toMatchObject({
    engine: "phaser-3",
    generatorVersion: "freeski-world-v5",
    ready: true,
    seed: "gate-zero-proof",
  });
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);

  const evidencePath = process.env.FREESKI_GATE0_SCREENSHOT;
  if (evidencePath)
    await page.screenshot({ path: evidencePath, fullPage: true });
});

test("retires legacy offline caches and keeps the same build on ordinary reload", async ({
  page,
}) => {
  await page.goto("/?seed=cache-refresh-proof");
  await expect(page.locator("#game-shell")).toHaveAttribute(
    "data-game-ready",
    "true",
  );
  const before = await page.locator("html").getAttribute("data-build-version");
  expect(before).toMatch(/^2026-/);
  await page.reload();
  await expect(page.locator("#game-shell")).toHaveAttribute(
    "data-game-ready",
    "true",
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-build-version",
    before!,
  );
  const runtime = await runtimeSnapshot(page);
  expect(runtime.world.visibleObjects).toBeLessThanOrEqual(20);
});

test("remains playable at the minimum supported viewport", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 600 });
  await page.goto("/");

  await expect(page.locator("#game-canvas canvas")).toBeVisible();
  const canvasBox = await page.locator("#game-canvas canvas").boundingBox();
  expect(canvasBox?.width).toBeGreaterThanOrEqual(760);
  expect(canvasBox?.height).toBeGreaterThan(470);
  await expect(page.locator("#speed-label")).toBeVisible();
  await expect(page.locator("#distance-label")).toBeVisible();
  await page.locator("#settings-toggle").click();
  await expect(page.locator("#settings-restart")).toBeVisible();
  await expect(page.locator("#pointer-toggle")).toBeVisible();
});

test("plays the full fixed-step skiing control sequence", async ({ page }) => {
  test.setTimeout(180_000);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/?seed=gate-one-playthrough&training=1");
  await expect(page.locator("#game-shell")).toHaveAttribute(
    "data-game-ready",
    "true",
  );
  await page.waitForFunction(
    () => (window.__FREE_SKI__?.player.worldY ?? 0) > 0.5,
  );

  const initial = await runtimeSnapshot(page);
  expect(initial.camera.playerScreenRatio).toBeCloseTo(0.35, 8);
  expect(initial.settings.pointerSteeringEnabled).toBe(true);
  expect(initial.settings.trainingMode).toBe(true);

  await page.keyboard.down("a");
  await page.waitForFunction(
    () => window.__FREE_SKI__?.player.heading === "left-stop",
  );
  await page.waitForFunction(
    () => window.__FREE_SKI__?.art.playerFrame === "player/heading-left-stop",
  );
  const afterLeft = await runtimeSnapshot(page);
  expect(afterLeft.player.heading).toBe("left-stop");
  expect(afterLeft.player.speedMetersPerSecond).toBe(0);
  expect(afterLeft.art.playerFrame).toBe("player/heading-left-stop");
  expect(afterLeft.player.worldX).toBeLessThan(initial.player.worldX);

  const evidenceDirectory = process.env.FREESKI_GATE1_EVIDENCE_DIR;
  if (evidenceDirectory) {
    await page.screenshot({
      path: join(evidenceDirectory, "normal-carve.png"),
      fullPage: true,
    });
  }
  await page.keyboard.up("a");
  await page.keyboard.down("s");
  await page.waitForFunction(
    () => window.__FREE_SKI__?.player.heading === "downhill",
  );
  await page.keyboard.up("s");

  await page.keyboard.down("ArrowRight");
  await page.waitForFunction(
    () => window.__FREE_SKI__?.player.heading === "right-60",
  );
  await page.waitForFunction(
    () => window.__FREE_SKI__?.art.playerFrame === "player/heading-right-60",
  );
  await page.waitForFunction(
    () => (window.__FREE_SKI__?.player.velocityX ?? -1) > 0,
  );
  const rightwardStart = (await runtimeSnapshot(page)).player.worldX;
  await page.waitForTimeout(60);
  const afterRight = await runtimeSnapshot(page);
  expect(afterRight.player.heading).toMatch(/^right-/);
  if (afterRight.player.heading === "right-stop") {
    expect(afterRight.player.speedMetersPerSecond).toBe(0);
  } else {
    expect(afterRight.player.velocityX).toBeGreaterThan(0);
  }
  expect(afterRight.player.velocityY).toBeGreaterThanOrEqual(0);
  expect(afterRight.art.playerFrame).toBe(
    `player/heading-${afterRight.player.heading}`,
  );
  expect(afterRight.player.worldX).toBeGreaterThan(rightwardStart);
  await page.keyboard.up("ArrowRight");

  await page.keyboard.press("w");
  await page.waitForFunction(
    () => window.__FREE_SKI__?.player.motion === "airborne",
  );
  expect((await runtimeSnapshot(page)).player.velocityY).toBeGreaterThanOrEqual(
    0,
  );
  await page.waitForFunction(
    () => window.__FREE_SKI__?.player.motion === "grounded",
  );

  await page.keyboard.down("b");
  await page.waitForFunction(
    () => window.__FREE_SKI__?.player.heading.endsWith("stop") === true,
  );
  await page.waitForFunction(
    () => (window.__FREE_SKI__?.player.speedMetersPerSecond ?? 3) < 2,
  );
  await page.keyboard.up("b");

  await page.keyboard.down("s");
  await page.waitForFunction(
    () =>
      window.__FREE_SKI__?.player.heading === "downhill" &&
      window.__FREE_SKI__?.player.tucking === true,
  );
  await page.waitForFunction(
    () =>
      window.__FREE_SKI__?.art.playerFrame === "player/tuck" &&
      window.__FREE_SKI__?.player.motion === "grounded",
  );
  if (evidenceDirectory) {
    await page.screenshot({
      path: join(evidenceDirectory, "front-facing-tuck.png"),
      fullPage: true,
    });
  }
  await page.waitForFunction(
    () => (window.__FREE_SKI__?.player.speedMetersPerSecond ?? 0) > 18,
  );
  const normalTuckSpeed = (await runtimeSnapshot(page)).player
    .speedMetersPerSecond;
  await page.keyboard.up("s");
  const canvas = await page.locator("#game-canvas canvas").boundingBox();
  expect(canvas).not.toBeNull();
  await page.mouse.move(canvas!.x + canvas!.width / 2, canvas!.y + 80);
  await page.mouse.down({ button: "right" });
  await page.waitForFunction(
    () =>
      window.__FREE_SKI__?.settings.heldActions.includes("tuck") === true &&
      window.__FREE_SKI__?.player.tucking === true &&
      window.__FREE_SKI__?.art.playerFrame === "player/tuck",
  );
  await page.mouse.up({ button: "right" });
  await page.waitForFunction(
    () => window.__FREE_SKI__?.settings.heldActions.includes("tuck") === false,
  );
  await page.keyboard.press("f");
  await expect(page.locator("#game-shell")).toHaveAttribute(
    "data-turbo",
    "true",
  );
  await holdKey(page, "ArrowDown", 850);
  const turbo = await runtimeSnapshot(page);
  expect(turbo.player.turbo).toBe(true);
  expect(turbo.player.speedMetersPerSecond).toBeGreaterThan(
    normalTuckSpeed + 5,
  );
  await expect(page.locator(".boost-status")).toBeVisible();
  if (evidenceDirectory) {
    await page.screenshot({
      path: join(evidenceDirectory, "turbo-descent.png"),
      fullPage: true,
    });
  }

  await page.keyboard.press("Escape");
  await expect(page.locator("#pause-card")).toBeVisible();
  const paused = await runtimeSnapshot(page);
  await page.waitForTimeout(350);
  expect((await runtimeSnapshot(page)).player.simulationSeconds).toBe(
    paused.player.simulationSeconds,
  );
  if (evidenceDirectory) {
    await page.screenshot({
      path: join(evidenceDirectory, "paused.png"),
      fullPage: true,
    });
  }
  await page.keyboard.press("F3");
  await expect(page.locator("#pause-card")).toBeHidden();

  await page.keyboard.press("Space");
  await page.waitForFunction(
    () => window.__FREE_SKI__?.player.motion === "airborne",
  );
  await page.keyboard.press("Space");
  await page.waitForTimeout(30);
  await page.keyboard.press("Space");
  await page.waitForFunction(
    () => window.__FREE_SKI__?.art.playerFrame === "player/rotation-180",
  );
  if (evidenceDirectory) {
    await page.screenshot({
      path: join(evidenceDirectory, "clean-jump.png"),
      fullPage: true,
    });
  }
  await page.waitForFunction(
    () =>
      window.__FREE_SKI__?.player.motion === "grounded" &&
      window.__FREE_SKI__?.player.lastLanding === "clean",
  );
  expect(
    Math.max(
      ...(await runtimeSnapshot(page)).telemetry.samples.map(
        (sample) => sample.airHeight,
      ),
    ),
  ).toBeGreaterThan(0.8);
  expect((await runtimeSnapshot(page)).player.motion).toBe("grounded");

  const crashCountBefore = (await runtimeSnapshot(page)).player.crashCount;
  await page.keyboard.press("Space");
  await page.waitForFunction(
    () => window.__FREE_SKI__?.player.motion === "airborne",
  );
  await page.keyboard.press("Space");
  await page.waitForFunction(
    (expected) => (window.__FREE_SKI__?.player.crashCount ?? 0) > expected,
    crashCountBefore,
  );
  if (evidenceDirectory) {
    await page.screenshot({
      path: join(evidenceDirectory, "crash.png"),
      fullPage: true,
    });
  }
  await page.waitForFunction(
    () => window.__FREE_SKI__?.player.motion === "grounded",
  );
  expect((await runtimeSnapshot(page)).player.lastLanding).toBe("crash");

  const runBeforeReset = (await runtimeSnapshot(page)).player.runNumber;
  await page.keyboard.press("r");
  await page.waitForFunction(
    (expected) => window.__FREE_SKI__?.player.runNumber === expected,
    runBeforeReset + 1,
  );
  expect((await runtimeSnapshot(page)).player.turbo).toBe(false);
  await page.keyboard.press("F2");
  await page.waitForFunction(
    (expected) => window.__FREE_SKI__?.player.runNumber === expected,
    runBeforeReset + 2,
  );

  const finalRuntime = await runtimeSnapshot(page);
  const headings = finalRuntime.telemetry.playerEvents
    .filter((event) => event.type === "heading-changed")
    .map((event) => event.detail);
  for (const heading of [
    "left-30",
    "left-60",
    "left-stop",
    "downhill",
    "right-30",
    "right-60",
  ]) {
    expect(headings).toContain(heading);
  }
  for (const eventType of [
    "turbo-on",
    "paused",
    "resumed",
    "jumped",
    "landed-clean",
    "crashed",
    "recovered",
    "reset",
  ]) {
    expect(
      finalRuntime.telemetry.playerEvents.map((event) => event.type),
    ).toContain(eventType);
  }
  expect(finalRuntime.telemetry.fixedSteps).toBeGreaterThan(300);
  expect(finalRuntime.telemetry.samples.length).toBeGreaterThan(40);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);

  const telemetryPath = process.env.FREESKI_GATE1_TELEMETRY;
  if (telemetryPath)
    writeFileSync(telemetryPath, `${JSON.stringify(finalRuntime, null, 2)}\n`);
});

test("keeps default pointer steering, opt-out, and click-to-jump functional", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto("/?training=1");
  await expect(page.locator("#pointer-toggle")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect((await runtimeSnapshot(page)).settings.pointerSteeringEnabled).toBe(
    true,
  );

  const canvas = page.locator("#game-canvas canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Game canvas has no bounds");
  await page.mouse.move(box.x + box.width * 0.83, box.y + box.height * 0.35);
  await page.waitForFunction(
    () => window.__FREE_SKI__?.player.heading === "right-stop",
  );
  await page.keyboard.down("a");
  await page.waitForFunction(
    () => window.__FREE_SKI__?.player.heading === "left-stop",
  );
  await page.keyboard.up("a");
  await page.waitForFunction(
    () => window.__FREE_SKI__?.player.heading === "right-stop",
  );
  await page.mouse.click(box.x + box.width * 0.83, box.y + box.height * 0.35);
  await page.waitForFunction(
    () => window.__FREE_SKI__?.player.motion === "airborne",
  );

  await page.locator("#settings-toggle").click();
  await page.locator("#pointer-toggle").click();
  await page.locator("#settings-close").click();
  await expect(page.locator("#pointer-toggle")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect((await runtimeSnapshot(page)).settings.pointerSteeringEnabled).toBe(
    false,
  );

  await page.goto("/?pointer=0&training=1");
  await expect(page.locator("#pointer-toggle")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});
