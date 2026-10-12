import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { EventModeId, MarkerState } from "../../src/simulation/modes";
import type { PlayerHeading } from "../../src/simulation/player";
import type { CourseCrossingTarget } from "../../src/render/runtimeBridge";
import { CLASSIC_COURSES } from "../../src/world/classicMountain";

async function stageCrossing(
  page: Page,
  mode: EventModeId,
  target: CourseCrossingTarget,
  outcome: Exclude<MarkerState, "pending"> = "correct",
): Promise<void> {
  const staged = await page.evaluate(
    ({ selectedMode, selectedOutcome, selectedTarget }) => {
      if (!window.__FREE_SKI_DEBUG__)
        throw new Error("FreeSki debug bridge is not ready");
      return window.__FREE_SKI_DEBUG__.stageCourseCrossing(
        selectedMode,
        selectedTarget,
        selectedOutcome,
      );
    },
    {
      selectedMode: mode,
      selectedOutcome: outcome,
      selectedTarget: target,
    },
  );
  expect(staged).toBe(true);
}

async function startMode(page: Page, mode: EventModeId): Promise<void> {
  await stageCrossing(page, mode, "start");
  await page.waitForFunction(
    (selectedMode) =>
      window.__FREE_SKI__?.modes.snapshot.activeMode === selectedMode,
    mode,
  );
}

async function crossMarker(
  page: Page,
  mode: EventModeId,
  marker: number,
  outcome: Exclude<MarkerState, "pending"> = "correct",
): Promise<void> {
  await stageCrossing(page, mode, marker, outcome);
  await page.waitForFunction(
    ({ selectedMarker, selectedMode }) =>
      window.__FREE_SKI__?.modes.snapshot.courses[selectedMode].markers[
        selectedMarker - 1
      ]?.state !== "pending",
    { selectedMarker: marker, selectedMode: mode },
  );
}

async function crossCorrectMarkers(
  page: Page,
  mode: EventModeId,
  markers: readonly number[],
): Promise<void> {
  const results = await page.evaluate(
    ({ selectedMarkers, selectedMode }) => {
      const debug = window.__FREE_SKI_DEBUG__;
      if (!debug) throw new Error("FreeSki debug bridge is not ready");
      const staged = debug.stageCourseCrossings(
        selectedMode,
        selectedMarkers,
        "correct",
      );
      return selectedMarkers.map((marker) => ({
        marker,
        staged,
        state:
          window.__FREE_SKI__?.modes.snapshot.courses[selectedMode].markers[
            marker - 1
          ]?.state,
      }));
    },
    { selectedMarkers: markers, selectedMode: mode },
  );
  for (const result of results)
    expect(result).toMatchObject({ staged: true, state: "correct" });
}

async function finishMode(page: Page, mode: EventModeId): Promise<void> {
  await stageCrossing(page, mode, "finish");
  await page.waitForFunction(
    (selectedMode) =>
      window.__FREE_SKI__?.modes.snapshot.courses[selectedMode].lifecycle ===
      "finished",
    mode,
  );
  await expect(page.locator("#result-card")).toBeVisible();
  await expect(page.locator("#result-time")).toContainText(
    mode === "free-style" ? "PTS" : "S",
  );
  await expect(page.locator("#result-record")).toContainText(
    /HIGH SCORE|COURSE BEST/,
  );
  await screenshot(page, `${mode}-result.png`);
  const pausedAt = await page.evaluate(
    () => window.__FREE_SKI__!.player.simulationSeconds,
  );
  await page.waitForTimeout(180);
  expect(
    await page.evaluate(() => window.__FREE_SKI__!.player.simulationSeconds),
  ).toBe(pausedAt);
  await page.locator("#result-close").click();
  await expect(page.locator("#result-card")).toBeHidden();
  await page.waitForFunction(
    () => window.__FREE_SKI__?.player.paused === false,
  );
}

async function screenshot(page: Page, name: string): Promise<void> {
  const directory = process.env.FREESKI_GATE4_EVIDENCE_DIR;
  if (directory)
    await page.screenshot({ path: join(directory, name), fullPage: true });
}

async function loadNaturalCourse(page: Page): Promise<void> {
  await page.goto("/?seed=classic-1991&training=1&pointer=0");
  await expect(page.locator("#game-shell")).toHaveAttribute(
    "data-game-ready",
    "true",
  );
}

async function selectKeyboardHeading(
  page: Page,
  key: "a" | "d",
  heading: PlayerHeading,
): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForFunction(
    (expectedHeading) =>
      window.__FREE_SKI__?.player.heading === expectedHeading,
    heading,
  );
  await page.keyboard.up(key);
}

test("starts every course and scores Slalom through normal player controls", async ({
  page,
}) => {
  test.setTimeout(90_000);

  await loadNaturalCourse(page);
  const slalom = CLASSIC_COURSES.find((course) => course.id === "slalom")!;
  await selectKeyboardHeading(page, "a", "left-60");
  await page.waitForFunction(
    (targetX) => (window.__FREE_SKI__?.player.worldX ?? 0) < targetX,
    slalom.centerX + 2,
  );
  await page.keyboard.down("s");
  await page.waitForFunction(
    () => window.__FREE_SKI__?.modes.snapshot.activeMode === "slalom",
  );
  await page.keyboard.up("s");
  await selectKeyboardHeading(page, "a", "left-30");
  await page.waitForFunction(
    (targetX) => (window.__FREE_SKI__?.player.worldX ?? 0) < targetX,
    slalom.markers[0]!.x - 1,
  );
  await page.keyboard.down("s");
  await page.waitForFunction(
    () =>
      window.__FREE_SKI__?.modes.snapshot.courses.slalom.markers[0]?.state !==
      "pending",
  );
  await page.keyboard.up("s");
  expect(
    await page.evaluate(
      () => window.__FREE_SKI__!.modes.snapshot.courses.slalom.markers[0],
    ),
  ).toMatchObject({ expectedSide: "left", state: "correct" });

  await loadNaturalCourse(page);
  const treeSlalom = CLASSIC_COURSES.find(
    (course) => course.id === "tree-slalom",
  )!;
  await selectKeyboardHeading(page, "d", "right-60");
  await page.waitForFunction(
    (targetX) => (window.__FREE_SKI__?.player.worldX ?? 0) > targetX,
    treeSlalom.centerX - 2,
  );
  await page.keyboard.down("s");
  await page.waitForFunction(
    () => window.__FREE_SKI__?.modes.snapshot.activeMode === "tree-slalom",
  );
  await page.keyboard.up("s");

  await loadNaturalCourse(page);
  await page.keyboard.down("s");
  await page.waitForFunction(
    () => window.__FREE_SKI__?.modes.snapshot.activeMode === "free-style",
  );
  await page.keyboard.up("s");
});

test("crosses real gates to finish all modes and reloads classic records", async ({
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

  await page.goto("/?seed=classic-1991&courseTest=1");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.locator("#game-shell")).toHaveAttribute(
    "data-game-ready",
    "true",
  );
  await expect(page.locator("#mode-card")).toHaveCount(0);

  await startMode(page, "slalom");
  expect(
    await page.evaluate(() => window.__FREE_SKI__!.modes.snapshot.activeMode),
  ).toBe("slalom");
  await crossMarker(page, "slalom", 1, "wrong-side");
  expect(
    await page.evaluate(
      () =>
        window.__FREE_SKI__!.modes.snapshot.courses.slalom.markers[0]!.state,
    ),
  ).toBe("wrong-side");
  await screenshot(page, "slalom-wrong-side.png");
  await crossCorrectMarkers(
    page,
    "slalom",
    Array.from({ length: 23 }, (_, index) => index + 2),
  );
  expect(
    await page.evaluate(
      () => window.__FREE_SKI__!.modes.snapshot.courses.slalom.penaltySeconds,
    ),
  ).toBe(5);
  await screenshot(page, "slalom-penalty.png");
  await finishMode(page, "slalom");
  const slalom = await page.evaluate(
    () => window.__FREE_SKI__!.modes.snapshot.courses.slalom,
  );
  expect(slalom.markers).toHaveLength(24);
  expect(
    slalom.markers.filter((marker) => marker.state === "wrong-side"),
  ).toHaveLength(1);
  expect(slalom.penaltySeconds).toBe(5);
  expect(slalom.result?.adjustedTimeSeconds).toBe(
    (slalom.result?.rawTimeSeconds ?? 0) + 5,
  );

  await startMode(page, "tree-slalom");
  await crossCorrectMarkers(
    page,
    "tree-slalom",
    Array.from({ length: 39 }, (_, index) => index + 1),
  );
  await finishMode(page, "tree-slalom");
  const tree = await page.evaluate(
    () => window.__FREE_SKI__!.modes.snapshot.courses["tree-slalom"],
  );
  expect(tree.markers).toHaveLength(39);
  expect(tree.markers.every((marker) => marker.state === "correct")).toBe(true);
  expect(tree.result?.penaltySeconds).toBe(0);
  await screenshot(page, "tree-slalom-finish.png");

  await startMode(page, "free-style");
  const scenarioStaged = await page.evaluate(() =>
    window.__FREE_SKI_DEBUG__?.stageInteractionScenario("ramp-trick"),
  );
  expect(scenarioStaged).toBe(true);
  await page.waitForFunction(
    () => window.__FREE_SKI__?.player.motion === "airborne",
  );
  await page.keyboard.down("e");
  await page.waitForFunction(() =>
    window.__FREE_SKI__?.interactions.interactionEvents.some(
      (event) => event.type === "trick-completed",
    ),
  );
  await page.keyboard.up("e");
  await page.waitForFunction(
    () => window.__FREE_SKI__?.player.lastLanding === "clean",
  );
  await finishMode(page, "free-style");
  const freeStyle = await page.evaluate(
    () => window.__FREE_SKI__!.modes.snapshot.courses["free-style"],
  );
  expect(freeStyle.result?.score).toBeGreaterThanOrEqual(215);
  expect(freeStyle.result?.adjustedTimeSeconds).toBeNull();
  await expect(page.locator("#result-title")).toHaveText("STYLE SCORE");
  await screenshot(page, "free-style-finish.png");

  const beforeReload = await page.evaluate(() => window.__FREE_SKI__!.modes);
  expect(beforeReload.records.buckets.classic.slalom).toHaveLength(1);
  expect(beforeReload.records.buckets.classic["tree-slalom"]).toHaveLength(1);
  expect(beforeReload.records.buckets.classic["free-style"]).toHaveLength(1);
  expect(beforeReload.records.buckets.classic["free-style"][0]).toMatchObject({
    metric: "score",
  });
  expect(beforeReload.records.buckets.classic.slalom[0]).toMatchObject({
    metric: "time",
  });
  expect(beforeReload.records.buckets.seeded.slalom).toHaveLength(0);
  expect(
    beforeReload.events.filter((event) => event.type === "mode-started"),
  ).toHaveLength(3);
  expect(
    beforeReload.events.filter((event) => event.type === "mode-finished"),
  ).toHaveLength(3);

  await page.reload();
  await expect(page.locator("#game-shell")).toHaveAttribute(
    "data-game-ready",
    "true",
  );
  const reloaded = await page.evaluate(() => window.__FREE_SKI__!.modes);
  expect(reloaded.records).toEqual(beforeReload.records);
  expect(reloaded.storageAvailable).toBe(true);
  expect(Object.values(reloaded.records.buckets.classic).flat()).toHaveLength(
    3,
  );
  await page.setViewportSize({ width: 768, height: 600 });
  await expect(page.locator("#mode-card")).toHaveCount(0);
  await expect(page.locator("#settings-toggle")).toBeVisible();
  await expect(page.locator("#world-debug-toggle")).toHaveCount(0);
  await screenshot(page, "records-reloaded-768x600.png");

  const telemetryPath = process.env.FREESKI_GATE4_TELEMETRY;
  if (telemetryPath)
    writeFileSync(
      telemetryPath,
      `${JSON.stringify({ beforeReload, reloaded, slalom, tree, freeStyle }, null, 2)}\n`,
    );
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});

test("open skiing can ignore start gates and an active run survives leaving its lane", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto("/?seed=gate-four-open&training=1&courseTest=1");
  await expect(page.locator("#game-shell")).toHaveAttribute(
    "data-game-ready",
    "true",
  );
  await selectKeyboardHeading(page, "d", "right-30");
  await page.waitForFunction(
    () => (window.__FREE_SKI__?.player.worldX ?? 0) > 14,
  );
  await page.keyboard.down("s");
  await page.waitForFunction(
    () => (window.__FREE_SKI__?.player.worldY ?? 0) > 48,
  );
  await page.keyboard.up("s");
  expect(
    await page.evaluate(() => window.__FREE_SKI__?.modes.snapshot.activeMode),
  ).toBeNull();
  expect(
    await page.evaluate(() => window.__FREE_SKI__!.modes.snapshot.activeMode),
  ).toBeNull();

  await startMode(page, "slalom");
  await crossMarker(page, "slalom", 1, "missed");
  const leftLane = await page.evaluate(
    () => window.__FREE_SKI__!.modes.snapshot.courses.slalom,
  );
  expect(leftLane.lifecycle).toBe("active");
  expect(leftLane.markers[0]?.state).toBe("missed");
  expect(leftLane.penaltySeconds).toBe(5);
});
