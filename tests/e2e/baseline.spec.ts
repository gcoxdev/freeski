import { expect, test } from "@playwright/test";

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
});
