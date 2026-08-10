import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type {
  FreeSkiRuntime,
  GateThreeScenario,
} from "../../src/render/runtimeBridge";

async function runtimeSnapshot(page: Page): Promise<FreeSkiRuntime> {
  return page.evaluate(() => {
    if (!window.__FREE_SKI__) throw new Error("FreeSki runtime is not ready");
    return window.__FREE_SKI__;
  });
}

async function stage(page: Page, scenario: GateThreeScenario): Promise<void> {
  const staged = await page.evaluate((value) => {
    if (!window.__FREE_SKI_DEBUG__)
      throw new Error("FreeSki debug bridge is not ready");
    return window.__FREE_SKI_DEBUG__.stageInteractionScenario(value);
  }, scenario);
  expect(staged).toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.__FREE_SKI__?.interactions.scenario))
    .toBe(scenario);
}

async function waitForInteraction(page: Page, type: string): Promise<void> {
  await page.waitForFunction(
    (eventType) =>
      window.__FREE_SKI__?.interactions.interactionEvents.some(
        (event) => event.type === eventType,
      ),
    type,
    { timeout: 15_000 },
  );
}

async function evidenceScreenshot(page: Page, filename: string): Promise<void> {
  const directory = process.env.FREESKI_GATE3_EVIDENCE_DIR;
  if (directory)
    await page.screenshot({ path: join(directory, filename), fullPage: true });
}

test("demonstrates ramp trick, crash recovery, mushroom, and burning-tree sequences", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/?seed=gate-three-playthrough&debug=1");
  await expect(page.locator("#game-shell")).toHaveAttribute(
    "data-game-ready",
    "true",
  );
  await expect(page.locator("#world-debug")).toBeVisible();

  await stage(page, "ramp-trick");
  await page.waitForFunction(
    () => window.__FREE_SKI__?.player.motion === "airborne",
  );
  await page.keyboard.down("e");
  await waitForInteraction(page, "trick-completed");
  await page.keyboard.up("e");
  await expect(page.locator("#trick-label")).toContainText("SPIN RIGHT 360");
  await evidenceScreenshot(page, "ramp-trick.png");
  await page.waitForFunction(
    () =>
      window.__FREE_SKI__?.player.motion === "grounded" &&
      window.__FREE_SKI__?.player.lastLanding === "clean",
  );
  const ramp = await runtimeSnapshot(page);
  expect(ramp.interactions.styleEvents.map((event) => event.type)).toEqual(
    expect.arrayContaining(["ramp-takeoff", "spin-right-360", "clean-landing"]),
  );

  await stage(page, "crash-recovery");
  await waitForInteraction(page, "crash");
  await evidenceScreenshot(page, "crash-impact.png");
  expect((await runtimeSnapshot(page)).player.crashCount).toBe(1);
  await page.waitForFunction(
    () =>
      window.__FREE_SKI__?.player.motion === "grounded" &&
      (window.__FREE_SKI__?.player.recoveryGraceSeconds ?? 0) > 0,
  );
  const recovered = await runtimeSnapshot(page);
  expect(recovered.player.recoveryGraceSeconds).toBeGreaterThan(0);
  expect(recovered.interactions.feedbackEvents).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ cue: "impact-burst", kind: "visual" }),
      expect.objectContaining({ cue: "obstacle-crash", kind: "audio" }),
    ]),
  );

  await stage(page, "mushroom");
  await page.keyboard.down("w");
  await waitForInteraction(page, "mushroom-created");
  await page.keyboard.up("w");
  expect(
    (await runtimeSnapshot(page)).interactions.deltas["scenario-stump"],
  ).toMatchObject({ form: "mushroom" });
  await stage(page, "mushroom");
  await waitForInteraction(page, "mushroom-jumped");
  await expect(page.locator("#feedback-label")).toContainText("MUSHROOM +100");
  await evidenceScreenshot(page, "mushroom-secret.png");
  const mushroom = await runtimeSnapshot(page);
  expect(mushroom.interactions.snapshot.style).toBe(100);
  expect(mushroom.interactions.deltas["scenario-stump"]).toMatchObject({
    consumed: true,
    form: "mushroom",
  });

  await stage(page, "burning-ignite");
  await page.keyboard.press("Space");
  await waitForInteraction(page, "dead-tree-ignited");
  await expect(page.locator("#feedback-label")).toContainText("DEAD TREE LIT");
  await evidenceScreenshot(page, "burning-tree-ignited.png");
  await page.waitForFunction(
    () => window.__FREE_SKI__?.player.motion === "grounded",
  );
  await stage(page, "burning-clear");
  await waitForInteraction(page, "ramp-launch");
  await waitForInteraction(page, "burning-tree-cleared");
  await expect(page.locator("#feedback-label")).toContainText(
    "FIRE LINE +1000",
  );
  await evidenceScreenshot(page, "burning-tree-cleared.png");
  const burning = await runtimeSnapshot(page);
  expect(burning.interactions.snapshot.style).toBeGreaterThanOrEqual(1_025);
  expect(burning.interactions.styleEvents.map((event) => event.type)).toEqual(
    expect.arrayContaining([
      "clean-landing",
      "ramp-takeoff",
      "burning-tree-clear",
    ]),
  );
  expect(burning.interactions.deltas["scenario-dead-tree"]).toMatchObject({
    burned: true,
    burning: false,
  });
  expect(burning.interactions.feedbackEvents).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ cue: "ember-burst", kind: "visual" }),
      expect.objectContaining({ cue: "secret-chime", kind: "audio" }),
    ]),
  );

  expect(burning.interactions.snapshot.collisionChecks).toBeGreaterThan(0);
  expect(burning.interactions.snapshot.footprintHits).toBeGreaterThan(0);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);

  const telemetryPath = process.env.FREESKI_GATE3_TELEMETRY;
  if (telemetryPath)
    writeFileSync(telemetryPath, `${JSON.stringify(burning, null, 2)}\n`);
});
