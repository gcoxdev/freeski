import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { FreeSkiRuntime } from "../../src/render/runtimeBridge";

async function runtimeSnapshot(page: Page): Promise<FreeSkiRuntime> {
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
  await expect(page.locator("#seed-label")).toHaveText("gate-zero-proof");

  await page.keyboard.press("ArrowLeft");
  await expect
    .poll(() => page.evaluate(() => window.__FREE_SKI__?.lastInput))
    .toBe("ArrowLeft");

  const runtime = await page.evaluate(() => window.__FREE_SKI__);
  expect(runtime).toMatchObject({
    engine: "phaser-3",
    generatorVersion: "freeski-world-v1",
    ready: true,
    seed: "gate-zero-proof",
  });
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);

  const evidencePath = process.env.FREESKI_GATE0_SCREENSHOT;
  if (evidencePath)
    await page.screenshot({ path: evidencePath, fullPage: true });
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
  await expect(page.locator("#motion-label")).toBeVisible();
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

  await page.goto("/?seed=gate-one-playthrough");
  await expect(page.locator("#game-shell")).toHaveAttribute(
    "data-game-ready",
    "true",
  );
  await page.waitForFunction(
    () => (window.__FREE_SKI__?.player.worldY ?? 0) > 0.5,
  );

  const initial = await runtimeSnapshot(page);
  expect(initial.camera.playerScreenRatio).toBeCloseTo(0.35, 8);
  expect(initial.settings.pointerSteeringEnabled).toBe(false);

  await page.keyboard.down("a");
  await page.waitForFunction(
    () => window.__FREE_SKI__?.player.heading === "carve-left-3",
  );
  const afterLeft = await runtimeSnapshot(page);
  expect(afterLeft.player.heading).toBe("carve-left-3");
  expect(afterLeft.player.worldX).toBeLessThan(initial.player.worldX);

  const evidenceDirectory = process.env.FREESKI_GATE1_EVIDENCE_DIR;
  if (evidenceDirectory) {
    await page.screenshot({
      path: join(evidenceDirectory, "normal-carve.png"),
      fullPage: true,
    });
  }
  await page.keyboard.up("a");

  await page.keyboard.down("ArrowRight");
  await page.waitForFunction(
    () => window.__FREE_SKI__?.player.heading === "carve-right-3",
  );
  await page.waitForFunction(
    () => (window.__FREE_SKI__?.player.velocityX ?? -1) > 0,
  );
  const rightwardStart = (await runtimeSnapshot(page)).player.worldX;
  await page.waitForTimeout(260);
  const afterRight = await runtimeSnapshot(page);
  expect(afterRight.player.heading).toMatch(/^carve-right-/);
  expect(afterRight.player.velocityX).toBeGreaterThan(0);
  expect(afterRight.player.worldX).toBeGreaterThan(rightwardStart);
  await page.keyboard.up("ArrowRight");

  await page.keyboard.down("w");
  await page.waitForFunction(
    () => window.__FREE_SKI__?.player.heading === "uphill-right",
  );
  await page.waitForFunction(
    () => (window.__FREE_SKI__?.player.velocityY ?? 1) < 0,
  );
  const uphillStartY = (await runtimeSnapshot(page)).player.worldY;
  await page.waitForTimeout(420);
  expect((await runtimeSnapshot(page)).player.worldY).toBeLessThan(
    uphillStartY,
  );
  await page.keyboard.up("w");

  await page.keyboard.down("b");
  await page.waitForFunction(
    () => window.__FREE_SKI__?.player.heading === "brake",
  );
  await page.waitForFunction(
    () => (window.__FREE_SKI__?.player.speedMetersPerSecond ?? 3) < 2,
  );
  await page.keyboard.up("b");

  await page.keyboard.down("s");
  await page.waitForFunction(
    () => window.__FREE_SKI__?.player.heading === "tuck",
  );
  await page.waitForFunction(
    () => (window.__FREE_SKI__?.player.speedMetersPerSecond ?? 0) > 18,
  );
  const normalTuckSpeed = (await runtimeSnapshot(page)).player
    .speedMetersPerSecond;
  await page.keyboard.up("s");
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
  await expect(page.locator("#turbo-indicator")).toHaveText("TURBO ON");
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
  if (evidenceDirectory) {
    await page.screenshot({
      path: join(evidenceDirectory, "clean-jump.png"),
      fullPage: true,
    });
  }
  await page.waitForFunction(
    () => window.__FREE_SKI__?.player.lastLanding === "clean",
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
  await page.keyboard.down("ArrowLeft");
  await page.keyboard.press("Space");
  await page.waitForFunction(
    (expected) => (window.__FREE_SKI__?.player.crashCount ?? 0) > expected,
    crashCountBefore,
  );
  await page.keyboard.up("ArrowLeft");
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
    "carve-left-1",
    "carve-left-2",
    "carve-left-3",
    "carve-right-1",
    "carve-right-2",
    "carve-right-3",
    "traverse-right",
    "uphill-right",
    "brake",
    "tuck",
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

test("keeps pointer steering opt-in and click-to-jump functional", async ({
  page,
}) => {
  await page.goto("/?pointer=1");
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
    () => window.__FREE_SKI__?.player.heading === "carve-right-3",
  );
  await page.mouse.click(box.x + box.width * 0.83, box.y + box.height * 0.35);
  await page.waitForFunction(
    () => window.__FREE_SKI__?.player.motion === "airborne",
  );

  await page.locator("#pointer-toggle").click();
  await expect(page.locator("#pointer-toggle")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect((await runtimeSnapshot(page)).settings.pointerSteeringEnabled).toBe(
    false,
  );
});
