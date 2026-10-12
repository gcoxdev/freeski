import { join } from "node:path";
import { expect, test } from "@playwright/test";

test("streams and renders a deterministic classic mountain", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/?seed=gate-two-world&debug=1");
  await expect(page.locator("#game-shell")).toHaveAttribute(
    "data-game-ready",
    "true",
  );
  await expect(page.locator("#world-debug")).toBeVisible();
  await expect(page.locator("#world-debug-toggle")).toHaveCount(0);

  const initial = await page.evaluate(() => window.__FREE_SKI__!);
  expect(initial.world).toMatchObject({
    chunkSizeMeters: 64,
    corridorWidthMeters: 4.5,
    currentChunk: "0,0",
    missingRequiredChunks: 0,
  });
  expect(initial.world.activeChunks).toBeGreaterThanOrEqual(20);
  expect(initial.world.cachedChunks).toBeGreaterThanOrEqual(
    initial.world.activeChunks,
  );
  expect(initial.world.aheadRows).toEqual([1, 2]);
  expect(initial.world.visibleObjects).toBeGreaterThan(0);
  expect(initial.world.visibleObjects).toBeLessThanOrEqual(20);
  const contentSignature = initial.world.generatedSignature;
  const overlaySignature = initial.world.overlaySignature;

  await page.reload();
  await expect(page.locator("#game-shell")).toHaveAttribute(
    "data-game-ready",
    "true",
  );
  const reloaded = await page.evaluate(() => window.__FREE_SKI__!);
  expect(reloaded.world.generatedSignature).toBe(contentSignature);
  expect(reloaded.world.overlaySignature).toBe(overlaySignature);
  expect(reloaded.world.visibleObjects).toBeLessThanOrEqual(20);

  await page.setViewportSize({ width: 768, height: 600 });
  await page.reload();
  await expect(page.locator("#game-shell")).toHaveAttribute(
    "data-game-ready",
    "true",
  );
  const narrow = await page.evaluate(() => window.__FREE_SKI__!);
  expect(narrow.world.generatedSignature).toBe(contentSignature);
  expect(narrow.world.missingRequiredChunks).toBe(0);
  expect(narrow.world.aheadRows).toEqual([1, 2]);

  const evidenceDirectory = process.env.FREESKI_GATE2_EVIDENCE_DIR;
  if (evidenceDirectory) {
    await page.screenshot({
      path: join(evidenceDirectory, "world-minimum-viewport.png"),
      fullPage: true,
    });
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?seed=gate-two-other&debug=1");
  await expect(page.locator("#game-shell")).toHaveAttribute(
    "data-game-ready",
    "true",
  );
  const otherSeed = await page.evaluate(() => window.__FREE_SKI__!);
  expect(otherSeed.world.generatedSignature).not.toBe(contentSignature);
  expect(otherSeed.world.overlaySignature).toBe(overlaySignature);

  await page.keyboard.press("g");
  await expect(page.locator("#world-debug")).toBeHidden();
  await page.keyboard.press("g");
  await expect(page.locator("#world-debug")).toBeVisible();
  await page.keyboard.down("ArrowDown");
  await page.waitForFunction(
    () => (window.__FREE_SKI__?.player.worldY ?? 0) > 70,
  );
  await page.keyboard.up("ArrowDown");
  const descended = await page.evaluate(() => window.__FREE_SKI__!);
  const currentRow = Number(descended.world.currentChunk.split(",")[1]);
  expect(descended.world.aheadRows).toEqual([currentRow + 1, currentRow + 2]);
  expect(descended.world.missingRequiredChunks).toBe(0);
  expect(descended.telemetry.worldTransitions).toBeGreaterThanOrEqual(2);

  if (evidenceDirectory) {
    await page.screenshot({
      path: join(evidenceDirectory, "world-stream-desktop.png"),
      fullPage: true,
    });
  }
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("audits a 2100m fixed-step descent without missing chunks or blockers", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto("/?seed=gate-two-audit&debug=1");
  await expect(page.locator("#game-shell")).toHaveAttribute(
    "data-game-ready",
    "true",
  );
  const report = await page.evaluate(() => {
    if (!window.__FREE_SKI_DEBUG__)
      throw new Error("World debug bridge missing");
    return window.__FREE_SKI_DEBUG__.runAutomatedDescent(2_100);
  });
  expect(report).toMatchObject({
    corridorBlockers: 0,
    missingChunks: 0,
    passed: true,
  });
  expect(report.endY).toBeGreaterThanOrEqual(2_100);
  expect(report.fixedSteps).toBeGreaterThan(1_000);
  expect(report.visitedRows).toBeGreaterThanOrEqual(33);
});
