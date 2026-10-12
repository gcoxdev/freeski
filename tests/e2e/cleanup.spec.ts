import { expect, test } from "@playwright/test";

test("Settings restarts a paused course without clearing saved preferences", async ({
  page,
}) => {
  await page.goto("/?debug=1&pointer=0");
  await expect(page.locator("#game-shell")).toHaveAttribute(
    "data-game-ready",
    "true",
  );
  await page.evaluate(() => {
    window.__FREE_SKI_DEBUG__!.setVisible(false);
    window.__FREE_SKI_DEBUG__!.stageCourseCrossing("free-style", "start");
  });
  const runNumber = await page.evaluate(
    () => window.__FREE_SKI__!.player.runNumber,
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("#pause-card")).toBeVisible();
  await expect(page.locator("#pause-card")).not.toContainText("RUN SUSPENDED");
  await expect(page.locator("#mode-card")).toHaveCount(0);
  await page.locator("#settings-toggle").click();
  await page.locator("#setting-volume").fill("0.35");
  await page.getByRole("button", { name: "RESTART GAME" }).click();
  await expect(page.locator("#settings-panel")).toBeHidden();
  await expect(page.locator("#pause-card")).toBeHidden();
  await expect(page.locator("#game-canvas")).toBeFocused();
  await page.waitForFunction(
    (previousRun) => window.__FREE_SKI__!.player.runNumber === previousRun + 1,
    runNumber,
  );
  const runtime = await page.evaluate(() => window.__FREE_SKI__!);
  expect(runtime.player.paused).toBe(false);
  expect(runtime.player.worldY).toBeLessThan(15);
  expect(runtime.player.turbo).toBe(false);
  expect(runtime.modes.snapshot.activeMode).toBeNull();
  expect(runtime.interactions.snapshot.style).toBe(0);
  expect(runtime.yeti.snapshot.activeBoundaries).toEqual([]);
  expect(runtime.settings.accessibility.volume).toBe(0.35);
  expect(runtime.lifecycle.reasons).not.toContain("settings");
});

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 768, height: 600 },
  { width: 375, height: 667 },
  { width: 320, height: 480 },
  { width: 844, height: 390 },
]) {
  test(`compact HUD leaves the slope usable at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/?pointer=0");
    await expect(page.locator("#game-shell")).toHaveAttribute(
      "data-game-ready",
      "true",
    );
    await expect(page.locator("footer")).toHaveCount(0);
    await expect(page.locator("#mode-card")).toHaveCount(0);
    const canvas = await page.locator("#game-canvas").boundingBox();
    expect(canvas!.height).toBeGreaterThanOrEqual(viewport.height - 56);
    await page.keyboard.press("f");
    await expect(page.locator(".boost-status")).toBeVisible();
    const boxes = await page
      .locator(".run-metrics .metric, .header-actions button")
      .evaluateAll((elements) =>
        elements
          .filter((element) => element.getClientRects().length)
          .map((element) => {
            const { left, right, top, bottom } =
              element.getBoundingClientRect();
            return { left, right, top, bottom };
          }),
      );
    for (let i = 0; i < boxes.length; i++) {
      expect(boxes[i]!.left).toBeGreaterThanOrEqual(0);
      expect(boxes[i]!.right).toBeLessThanOrEqual(viewport.width);
      for (const b of boxes.slice(i + 1)) {
        const a = boxes[i]!;
        expect(
          a.left < b.right &&
            a.right > b.left &&
            a.top < b.bottom &&
            a.bottom > b.top,
        ).toBe(false);
      }
    }
    await page.locator("#settings-toggle").click();
    await expect(page.getByRole("dialog", { name: "SETTINGS" })).toBeVisible();
    await expect(page.locator("#pointer-toggle")).toBeVisible();
    await expect(page.locator("#settings-restart")).toBeVisible();
    await expect(
      page.locator(
        "#replay-export, #settings-details, #settings-status, #turbo-indicator, #seed-label",
      ),
    ).toHaveCount(0);
    expect(await page.locator("#settings-panel").innerText()).not.toMatch(
      /WORLD|GENERATOR|EXPORT/,
    );
    expect(
      (await page.locator(".settings-controls").innerText()).match(/F boost/g),
    ).toHaveLength(1);
    await expect(
      page.locator("#settings-panel > :last-child"),
    ).toHaveJSProperty("tagName", "FORM");
    await expect(
      page.locator("#settings-panel form input").last(),
    ).toHaveAttribute("id", "setting-volume");
    await page.keyboard.press("Escape");
    await expect(page.locator("#settings-panel")).toBeHidden();
    await expect(page.locator("#settings-toggle")).toBeFocused();
  });
}
