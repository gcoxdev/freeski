import { expect, test, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

async function stage(page: Page, scenario: string): Promise<void> {
  const staged = await page.evaluate(
    (value) => window.__FREE_SKI_DEBUG__?.stageLivingScenario(value as never),
    scenario,
  );
  expect(staged).toBe(true);
  if (scenario === "population")
    await page.waitForFunction(() => {
      const snapshot = window.__FREE_SKI__?.livingSlope.snapshot;
      return (
        snapshot !== undefined &&
        snapshot.workUnitsLastStep > 0 &&
        snapshot.workUnitsLastStep === snapshot.actorCount
      );
    });
}

async function evidenceScreenshot(page: Page, name: string): Promise<void> {
  const directory = process.env.FREESKI_GATE5_EVIDENCE_DIR;
  if (directory)
    await page.screenshot({ path: join(directory, name), fullPage: true });
}

test("living population, foreshadow, Turbo chase, and capture recover without a soft lock", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => failedRequests.push(request.url()));

  await page.goto("/?seed=gate-five-living&training=1&courseTest=1&debug=1");
  await expect(page.locator("#game-shell")).toHaveAttribute(
    "data-game-ready",
    "true",
  );

  await stage(page, "population");
  const initialPopulation = await page.evaluate(
    () => window.__FREE_SKI__!.livingSlope.snapshot,
  );
  expect(initialPopulation.bounded).toBe(true);
  expect(initialPopulation.actorCount).toBeLessThanOrEqual(22);
  expect(initialPopulation.workUnitsLastStep).toBe(
    initialPopulation.actorCount,
  );
  await expect(page.locator("#world-debug-living")).toContainText(
    `POPULATION ${initialPopulation.actorCount}`,
  );
  await evidenceScreenshot(page, "living-population.png");

  await page.waitForFunction(() =>
    window.__FREE_SKI__?.livingSlope.events.some(
      (event) =>
        event.type === "snowboarder-jumped" &&
        event.terrainObjectId === "scenario-living-ramp",
    ),
  );
  expect(
    await page.evaluate(() =>
      window.__FREE_SKI__?.livingSlope.events.find(
        (event) => event.type === "snowboarder-jumped",
      ),
    ),
  ).toMatchObject({ terrainObjectId: "scenario-living-ramp" });
  await evidenceScreenshot(page, "snowboarder-ramp-encounter.png");

  await page.waitForFunction(() => {
    const types = window.__FREE_SKI__?.livingSlope.events.map(
      (event) => event.type,
    );
    return (
      types?.includes("beginner-fell") &&
      types.includes("snowboarder-jumped") &&
      types.includes("snowboarder-tumbled") &&
      types.includes("snowboarder-landed") &&
      types.includes("walking-tree-woke") &&
      types.includes("walking-tree-moved")
    );
  });
  const chairBefore = await page.evaluate(
    () =>
      window.__FREE_SKI__!.livingSlope.snapshot.actors.find(
        (actor) => actor.id === "chair-up-0",
      )!.worldY,
  );
  await page.waitForTimeout(350);
  const chairAfter = await page.evaluate(
    () =>
      window.__FREE_SKI__!.livingSlope.snapshot.actors.find(
        (actor) => actor.id === "chair-up-0",
      )!.worldY,
  );
  expect(chairAfter).toBeLessThan(chairBefore);

  await stage(page, "dog-contact");
  await page.waitForFunction(() =>
    window.__FREE_SKI__?.livingSlope.events.some(
      (event) => event.type === "dog-hit",
    ),
  );
  expect(
    await page.evaluate(
      () => window.__FREE_SKI__!.interactions.deltas["dog-0"]?.yellowSnow,
    ),
  ).toBe(true);
  await evidenceScreenshot(page, "dog-hit-yellow-snow.png");
  await page.waitForFunction(() =>
    window.__FREE_SKI__?.livingSlope.events.some(
      (event) => event.type === "dog-recovered",
    ),
  );

  await stage(page, "chair-drop");
  await page.waitForFunction(() =>
    window.__FREE_SKI__?.livingSlope.events.some(
      (event) => event.type === "chair-rider-dropped",
    ),
  );
  expect(
    await page.evaluate(
      () =>
        window.__FREE_SKI__!.livingSlope.snapshot.actors.find(
          (actor) => actor.id === "snowboarder-chair-drop",
        )?.active,
    ),
  ).toBe(true);
  await evidenceScreenshot(page, "dog-chair-drop.png");

  await stage(page, "foreshadow");
  await page.waitForFunction(
    () => (window.__FREE_SKI__?.player.worldY ?? 0) > 1_900,
  );
  const foreshadow = await page.evaluate(
    () => window.__FREE_SKI__!.yeti.snapshot.foreshadow,
  );
  expect(foreshadow.intensity).toBeGreaterThan(0.5);
  expect(foreshadow.intensity).toBeLessThan(1);
  expect(foreshadow.windStreaks).toBeGreaterThan(0);
  expect(
    await page.evaluate(
      () => window.__FREE_SKI__!.yeti.snapshot.activeBoundaries,
    ),
  ).toEqual([]);
  expect((await page.locator("body").innerText()).toUpperCase()).not.toContain(
    "YETI",
  );
  await evidenceScreenshot(page, "foreshadow-1900m.png");

  await stage(page, "yeti-bottom");
  await page.waitForFunction(() =>
    window.__FREE_SKI__?.yeti.events.some(
      (event) => event.type === "yeti-activated" && event.boundary === "bottom",
    ),
  );
  const activation = await page.evaluate(() =>
    window.__FREE_SKI__!.yeti.events.find(
      (event) => event.type === "yeti-activated" && event.boundary === "bottom",
    ),
  );
  expect(activation?.safeDistanceMeters).toBeGreaterThanOrEqual(25);
  expect(
    await page.evaluate(() => window.__FREE_SKI__!.player.worldY),
  ).toBeGreaterThan(2_000);
  await expect(page.locator("#world-debug-boundary")).toContainText(
    "BOUNDARY BOTTOM",
  );
  await evidenceScreenshot(page, "bottom-chase.png");

  const distanceBeforeTurbo = await page.evaluate(() => {
    const runtime = window.__FREE_SKI__!;
    const chaser = runtime.yeti.snapshot.controllers.find(
      (controller) => controller.boundary === "bottom",
    )!;
    return Math.hypot(
      runtime.player.worldX - chaser.worldX,
      runtime.player.worldY - chaser.worldY,
    );
  });
  await page.keyboard.press("f");
  await page.keyboard.down("s");
  await page.waitForFunction(() =>
    window.__FREE_SKI__?.yeti.events.some(
      (event) => event.type === "turbo-evasion",
    ),
  );
  await page.waitForTimeout(850);
  const distanceAfterTurbo = await page.evaluate(() => {
    const runtime = window.__FREE_SKI__!;
    const chaser = runtime.yeti.snapshot.controllers.find(
      (controller) => controller.boundary === "bottom",
    )!;
    return Math.hypot(
      runtime.player.worldX - chaser.worldX,
      runtime.player.worldY - chaser.worldY,
    );
  });
  expect(distanceAfterTurbo).toBeGreaterThan(distanceBeforeTurbo + 4);
  await evidenceScreenshot(page, "turbo-evasion.png");
  await page.keyboard.up("s");
  await page.keyboard.press("f");

  await page.waitForFunction(() => {
    const controller = window.__FREE_SKI__?.yeti.snapshot.controllers.find(
      (value) => value.boundary === "bottom",
    );
    return controller?.state === "chasing" && controller.protectionSeconds <= 0;
  });
  await stage(page, "yeti-contact");
  await page.waitForFunction(() =>
    window.__FREE_SKI__?.yeti.events.some(
      (event) => event.type === "capture-started",
    ),
  );
  await page.waitForFunction(
    () => window.__FREE_SKI__?.yeti.snapshot.capturePhase === "pounce",
  );
  await evidenceScreenshot(page, "capture-pounce.png");
  await page.waitForFunction(
    () => window.__FREE_SKI__?.yeti.snapshot.capturePhase === "chew",
  );
  await expect(page.locator("#game-shell")).toHaveAttribute(
    "data-capture-phase",
    "chew",
  );
  expect(
    await page.evaluate(() => window.__FREE_SKI__!.yeti.snapshot.playerRemoved),
  ).toBe(true);
  await evidenceScreenshot(page, "capture-chew.png");

  await page.waitForFunction(() =>
    window.__FREE_SKI__?.yeti.events.some(
      (event) => event.type === "reset-requested",
    ),
  );
  await page.waitForFunction(
    () =>
      window.__FREE_SKI__?.player.runNumber === 2 &&
      window.__FREE_SKI__?.yeti.snapshot.activeBoundaries.length === 0,
  );
  const recoveryStartY = await page.evaluate(
    () => window.__FREE_SKI__!.player.worldY,
  );
  expect(recoveryStartY).toBeLessThan(10);
  await page.keyboard.down("s");
  await page.waitForFunction(
    (startY) =>
      window.__FREE_SKI__?.settings.heldActions.includes("tuck") === true &&
      (window.__FREE_SKI__?.player.worldY ?? startY) > startY + 1,
    recoveryStartY,
  );
  await page.keyboard.up("s");
  await page.setViewportSize({ width: 768, height: 600 });
  await expect(page.locator("#mode-card")).toBeVisible();
  await expect(page.locator("#pointer-toggle")).toBeVisible();
  await expect(page.locator("#world-debug-toggle")).toBeVisible();
  await evidenceScreenshot(page, "post-capture-recovery-768x600.png");

  const telemetry = await page.evaluate(() => ({
    interactions: window.__FREE_SKI__!.interactions,
    livingSlope: window.__FREE_SKI__!.livingSlope,
    player: window.__FREE_SKI__!.player,
    yeti: window.__FREE_SKI__!.yeti,
  }));
  const telemetryPath = process.env.FREESKI_GATE5_TELEMETRY;
  if (telemetryPath)
    writeFileSync(telemetryPath, `${JSON.stringify(telemetry, null, 2)}\n`);
  expect(telemetry.livingSlope.events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: "beginner-fell" }),
      expect.objectContaining({ type: "snowboarder-tumbled" }),
      expect.objectContaining({ type: "dog-hit" }),
      expect.objectContaining({ type: "walking-tree-woke" }),
      expect.objectContaining({ type: "chair-rider-dropped" }),
    ]),
  );
  expect(telemetry.yeti.events.map((event) => event.type)).toEqual(
    expect.arrayContaining([
      "yeti-activated",
      "turbo-evasion",
      "capture-started",
      "pounced",
      "grabbed",
      "eaten",
      "chewing",
      "reset-requested",
    ]),
  );
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});
