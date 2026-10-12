import { expect, test, type Page } from "@playwright/test";

async function waitUntilReady(page: Page): Promise<void> {
  await expect(page.locator("#game-shell")).toHaveAttribute(
    "data-game-ready",
    "true",
  );
}

async function installStandardGamepad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 16 }, () => ({
      pressed: false,
      touched: false,
      value: 0,
    }));
    const gamepad = {
      axes: [0, 0, 0, 0],
      buttons,
      connected: true,
      id: "FreeSki standard-layout test controller",
      index: 0,
      mapping: "standard",
      timestamp: 0,
      vibrationActuator: null,
    };
    const scope = window as typeof window & {
      __FREE_SKI_GAMEPAD_TEST__?: typeof gamepad;
    };
    scope.__FREE_SKI_GAMEPAD_TEST__ = gamepad;
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [gamepad],
    });
  });
}

async function setGamepadButton(
  page: Page,
  button: number,
  pressed: boolean,
): Promise<void> {
  await page.evaluate(
    ({ index, active }) => {
      const gamepad = (
        window as typeof window & {
          __FREE_SKI_GAMEPAD_TEST__?: {
            buttons: Array<{
              pressed: boolean;
              touched: boolean;
              value: number;
            }>;
            timestamp: number;
          };
        }
      ).__FREE_SKI_GAMEPAD_TEST__;
      if (!gamepad) throw new Error("Test gamepad was not installed");
      gamepad.buttons[index] = {
        pressed: active,
        touched: active,
        value: active ? 1 : 0,
      };
      gamepad.timestamp += 1;
    },
    { active: pressed, index: button },
  );
}

async function setGamepadSteer(page: Page, value: number): Promise<void> {
  await page.evaluate((axis) => {
    const gamepad = (
      window as typeof window & {
        __FREE_SKI_GAMEPAD_TEST__?: {
          axes: number[];
          timestamp: number;
        };
      }
    ).__FREE_SKI_GAMEPAD_TEST__;
    if (!gamepad) throw new Error("Test gamepad was not installed");
    gamepad.axes[0] = axis;
    gamepad.timestamp += 1;
  }, value);
}

async function instrumentAudioContexts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const scope = window as typeof window & {
      __FREE_SKI_RELEASE_AUDIO_CONTEXTS__?: number;
    };
    scope.__FREE_SKI_RELEASE_AUDIO_CONTEXTS__ = 0;
    const Original = scope.AudioContext;
    if (!Original) return;
    Object.defineProperty(scope, "AudioContext", {
      configurable: true,
      value: new Proxy(Original, {
        construct(target, argumentsList) {
          scope.__FREE_SKI_RELEASE_AUDIO_CONTEXTS__ =
            (scope.__FREE_SKI_RELEASE_AUDIO_CONTEXTS__ ?? 0) + 1;
          return Reflect.construct(target, argumentsList);
        },
      }),
      writable: true,
    });
  });
}

test("skip link and heading hierarchy reach play at the minimum viewport", async ({
  page,
}) => {
  await page.setViewportSize({ height: 600, width: 768 });
  await page.goto("/?seed=gate-seven-skip-link&training=1");
  await waitUntilReady(page);

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "FreeSki — Downhill Mountain Game",
    }),
  ).toHaveCount(1);
  expect(
    await page
      .locator("h1, h2, h3, h4, h5, h6")
      .evaluateAll((headings) =>
        headings.map((heading) => Number(heading.tagName.slice(1))),
      ),
  ).toEqual([1, 2, 2]);

  const skipLink = page.getByRole("link", {
    name: "Skip to playable mountain",
  });
  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  const focusedBox = await skipLink.boundingBox();
  expect(focusedBox).not.toBeNull();
  expect(focusedBox!.x).toBeGreaterThanOrEqual(0);
  expect(focusedBox!.y).toBeGreaterThanOrEqual(0);
  expect(focusedBox!.x + focusedBox!.width).toBeLessThanOrEqual(768);
  expect(focusedBox!.y + focusedBox!.height).toBeLessThanOrEqual(600);

  await page.keyboard.press("Enter");
  const playableArea = page.locator("#game-canvas");
  await expect(playableArea).toBeFocused();
  const canvasBox = await page.locator("#game-canvas canvas").boundingBox();
  expect(canvasBox?.width).toBeGreaterThanOrEqual(760);
  expect(canvasBox?.height).toBeGreaterThanOrEqual(470);
});

test("keyboard, standard gamepad, and touch feed equivalent bounded actions", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await installStandardGamepad(page);
  await page.goto("/?seed=gate-seven-input&training=1&touch=1");
  await waitUntilReady(page);

  const touchActions = await page
    .locator("#touch-controls button[data-action]")
    .evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("data-action")).sort(),
    );
  expect(touchActions).toEqual([
    "brake",
    "jump",
    "pause",
    "reset",
    "steer-left",
    "steer-right",
    "trick-back",
    "trick-front",
    "trick-left",
    "trick-right",
    "tuck",
    "turbo",
  ]);
  await expect(page.getByRole("button", { name: "Jump" })).toBeVisible();

  await page.keyboard.down("ArrowLeft");
  await page.waitForFunction(
    () =>
      window.__FREE_SKI__?.settings.heldActions.includes("steer-left") &&
      window.__FREE_SKI__?.player.heading === "left-stop",
  );
  await page.keyboard.up("ArrowLeft");
  await page.waitForFunction(
    () => !window.__FREE_SKI__?.settings.heldActions.includes("steer-left"),
  );

  await page.waitForFunction(
    () => window.__FREE_SKI__?.settings.connectedGamepads === 1,
  );
  await setGamepadSteer(page, 1);
  await page.waitForFunction(
    () => window.__FREE_SKI__?.player.heading === "right-stop",
  );
  await setGamepadSteer(page, 0);

  const pauseEventsBefore = await page.evaluate(
    () =>
      window.__FREE_SKI__!.telemetry.playerEvents.filter(
        (event) => event.type === "paused",
      ).length,
  );
  await setGamepadButton(page, 9, true);
  await page.waitForFunction(() => window.__FREE_SKI__?.player.paused === true);
  await page.waitForTimeout(350);
  expect(
    await page.evaluate(
      () =>
        window.__FREE_SKI__!.telemetry.playerEvents.filter(
          (event) => event.type === "paused",
        ).length,
    ),
  ).toBe(pauseEventsBefore + 1);
  await setGamepadButton(page, 9, false);
  await page.waitForTimeout(80);
  await setGamepadButton(page, 9, true);
  await page.waitForFunction(
    () => window.__FREE_SKI__?.player.paused === false,
  );
  await setGamepadButton(page, 9, false);

  const touchLeft = page.getByRole("button", { name: "Carve left" });
  await touchLeft.dispatchEvent("pointerdown", {
    button: 0,
    pointerId: 41,
    pointerType: "touch",
  });
  await page.waitForFunction(() =>
    window.__FREE_SKI__?.settings.heldActions.includes("steer-left"),
  );
  await touchLeft.dispatchEvent("pointerup", {
    button: 0,
    pointerId: 41,
    pointerType: "touch",
  });
  await page.waitForFunction(
    () => !window.__FREE_SKI__?.settings.heldActions.includes("steer-left"),
  );

  await page.waitForFunction(
    () => window.__FREE_SKI__?.player.motion === "grounded",
  );
  const jumpEventsBefore = await page.evaluate(
    () =>
      window.__FREE_SKI__!.telemetry.playerEvents.filter(
        (event) => event.type === "jumped",
      ).length,
  );
  await page.getByRole("button", { name: "Jump" }).click();
  await page.waitForFunction(
    (count) =>
      (window.__FREE_SKI__?.telemetry.playerEvents.filter(
        (event) => event.type === "jumped",
      ).length ?? 0) > count,
    jumpEventsBefore,
  );

  await page.waitForFunction(
    () => (window.__FREE_SKI__?.replay.count ?? 0) > 0,
  );
  const releaseAudit = await page.evaluate(() => {
    const runtime = window.__FREE_SKI__!;
    const replay = window.__FREE_SKI_DEBUG__!.exportReplay();
    return {
      inputSources: [
        ...new Set(runtime.telemetry.inputEvents.map((event) => event.source)),
      ],
      replay,
    };
  });
  expect(releaseAudit.inputSources).toEqual(
    expect.arrayContaining(["gamepad", "keyboard", "touch"]),
  );
  expect(releaseAudit.replay).toMatchObject({
    capacity: 7_200,
    droppedFrames: 0,
    format: "freeski-replay-v2",
    generatorVersion: "freeski-world-v4",
    seed: "gate-seven-input",
  });
  expect(releaseAudit.replay.frames.length).toBeGreaterThan(0);
  expect(Object.keys(releaseAudit.replay.frames[0]!).sort()).toEqual([
    "debugPressed",
    "fixedStep",
    "pausePressed",
    "player",
    "resetPressed",
    "turboPressed",
  ]);
});

test("accessibility settings persist and lifecycle transitions resume cleanly", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await instrumentAudioContexts(page);
  await page.goto("/?seed=gate-seven-accessibility&training=1");
  await page.evaluate(() =>
    localStorage.removeItem("freeski.accessibility.v1"),
  );
  await page.reload();
  await waitUntilReady(page);

  expect(
    await page.evaluate(
      () =>
        (
          window as typeof window & {
            __FREE_SKI_RELEASE_AUDIO_CONTEXTS__?: number;
          }
        ).__FREE_SKI_RELEASE_AUDIO_CONTEXTS__,
    ),
  ).toBe(0);
  await page.getByRole("button", { name: "SETTINGS" }).click();
  const dialog = page.getByRole("dialog", { name: "SETTINGS" });
  await expect(dialog).toBeVisible();
  await expect(page.locator("#settings-close")).toBeFocused();
  await page.waitForFunction(
    () =>
      window.__FREE_SKI__?.lifecycle.autoPaused === true &&
      window.__FREE_SKI__?.lifecycle.reasons.includes("settings"),
  );

  await page.getByLabel("Reduced Motion").check();
  await page.getByLabel("Screen Shake").uncheck();
  await page.getByLabel("Impact Flash").uncheck();
  await page.getByLabel("Gentle Yeti").check();
  await page.locator("#setting-volume").fill("0.35");
  await expect(page.locator("#setting-volume-output")).toHaveText("35%");
  await expect(page.locator("#game-shell")).toHaveAttribute(
    "data-reduced-motion",
    "true",
  );
  expect(await page.evaluate(() => window.__FREE_SKI__!.audio.volume)).toBe(
    0.35,
  );
  expect(
    await page.evaluate(() => window.__FREE_SKI__!.vfx.reducedMotion),
  ).toBe(true);
  await page.locator("#settings-close").click();
  await page.waitForFunction(
    () =>
      window.__FREE_SKI__?.lifecycle.autoPaused === false &&
      window.__FREE_SKI__?.player.paused === false,
  );

  const disabledCounts = await page.evaluate(
    () => window.__FREE_SKI__!.presentation,
  );
  expect(
    await page.evaluate(() =>
      window.__FREE_SKI_DEBUG__?.stageInteractionScenario("crash-recovery"),
    ),
  ).toBe(true);
  await page.waitForFunction(
    () => window.__FREE_SKI__?.player.motion === "crashed",
  );
  expect(
    await page.evaluate(() => window.__FREE_SKI__!.presentation),
  ).toMatchObject({
    flashCount: disabledCounts.flashCount,
    shakeCount: disabledCounts.shakeCount,
    yetiPresentation: "reduced",
  });
  await page.waitForFunction(
    () => window.__FREE_SKI__?.player.motion === "grounded",
  );

  await page.getByRole("button", { name: "SETTINGS" }).click();
  await page.getByLabel("Reduced Motion").uncheck();
  await page.getByLabel("Screen Shake").check();
  await page.getByLabel("Impact Flash").check();
  await page.getByLabel("Gentle Yeti").uncheck();
  await page.locator("#settings-close").click();
  const enabledCounts = await page.evaluate(
    () => window.__FREE_SKI__!.presentation,
  );
  expect(
    await page.evaluate(() => {
      window.__FREE_SKI_DEBUG__?.stageInteractionScenario("none");
      return window.__FREE_SKI_DEBUG__?.stageInteractionScenario(
        "crash-recovery",
      );
    }),
  ).toBe(true);
  await page.waitForFunction(
    () => window.__FREE_SKI__?.player.motion === "crashed",
  );
  await expect
    .poll(() =>
      page.evaluate(() => window.__FREE_SKI__!.presentation.flashCount),
    )
    .toBeGreaterThan(enabledCounts.flashCount);
  expect(
    await page.evaluate(() => window.__FREE_SKI__!.presentation.shakeCount),
  ).toBeGreaterThan(enabledCounts.shakeCount);

  await page.locator("#game-canvas canvas").focus();
  await page.keyboard.down("ArrowRight");
  await page.waitForFunction(() =>
    window.__FREE_SKI__?.settings.heldActions.includes("steer-right"),
  );
  const beforeBlur = await page.evaluate(
    () => window.__FREE_SKI__!.player.simulationSeconds,
  );
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.waitForFunction(
    () =>
      window.__FREE_SKI__?.lifecycle.reasons.includes("blur") &&
      window.__FREE_SKI__?.settings.heldActions.length === 0,
  );
  const pausedAtBlur = await page.evaluate(
    () => window.__FREE_SKI__!.player.simulationSeconds,
  );
  expect(pausedAtBlur - beforeBlur).toBeLessThan(0.1);
  await page.waitForTimeout(250);
  expect(
    await page.evaluate(() => window.__FREE_SKI__!.player.simulationSeconds),
  ).toBe(pausedAtBlur);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.keyboard.up("ArrowRight");
  await page.waitForFunction(
    () =>
      window.__FREE_SKI__?.lifecycle.reasons.length === 0 &&
      window.__FREE_SKI__?.player.paused === false,
  );

  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForFunction(() =>
    window.__FREE_SKI__?.lifecycle.reasons.includes("hidden"),
  );
  const hiddenSeconds = await page.evaluate(
    () => window.__FREE_SKI__!.player.simulationSeconds,
  );
  await page.waitForTimeout(200);
  expect(
    await page.evaluate(() => window.__FREE_SKI__!.player.simulationSeconds),
  ).toBe(hiddenSeconds);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForFunction(
    () =>
      window.__FREE_SKI__?.lifecycle.reasons.length === 0 &&
      window.__FREE_SKI__?.player.paused === false,
  );
  await page.waitForTimeout(250);
  expect(
    (await page.evaluate(() => window.__FREE_SKI__!.player.simulationSeconds)) -
      hiddenSeconds,
  ).toBeLessThan(0.6);

  const resizeBefore = await page.evaluate(
    () => window.__FREE_SKI__!.lifecycle.resizeCount,
  );
  await page.setViewportSize({ width: 768, height: 600 });
  await expect
    .poll(() => page.evaluate(() => window.__FREE_SKI__!.lifecycle.resizeCount))
    .toBeGreaterThan(resizeBefore);
  const canvasBox = await page.locator("#game-canvas canvas").boundingBox();
  expect(canvasBox?.width).toBeGreaterThanOrEqual(760);
  expect(canvasBox?.height).toBeGreaterThanOrEqual(470);
  expect(
    await page.evaluate(() => window.__FREE_SKI__!.settings.heldActions),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () =>
        (
          window as typeof window & {
            __FREE_SKI_RELEASE_AUDIO_CONTEXTS__?: number;
          }
        ).__FREE_SKI_RELEASE_AUDIO_CONTEXTS__,
    ),
  ).toBe(1);

  await page.reload();
  await waitUntilReady(page);
  expect(
    await page.evaluate(() => window.__FREE_SKI__!.settings.accessibility),
  ).toEqual({
    flash: true,
    reducedMotion: false,
    screenShake: true,
    volume: 0.35,
    yetiPresentation: "full",
  });
  await page.getByRole("button", { name: "SETTINGS" }).click();
  await expect(page.getByLabel("Reduced Motion")).not.toBeChecked();
  await expect(page.getByLabel("Screen Shake")).toBeChecked();
  await expect(page.getByLabel("Impact Flash")).toBeChecked();
  await expect(page.getByLabel("Gentle Yeti")).not.toBeChecked();
  await expect(page.locator("#setting-volume-output")).toHaveText("35%");
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("keyboard reset recovers promptly from the bottom Yeti boundary", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto("/?seed=gate-seven-yeti-reset&training=1&courseTest=1");
  await waitUntilReady(page);

  const descent = await page.evaluate(() =>
    window.__FREE_SKI_DEBUG__?.runAutomatedDescent(2_100),
  );
  expect(descent).toMatchObject({ passed: true });
  expect(
    await page.evaluate(() =>
      window.__FREE_SKI_DEBUG__?.stageLivingScenario("yeti-bottom"),
    ),
  ).toBe(true);
  await page.waitForFunction(
    () =>
      (window.__FREE_SKI__?.player.worldY ?? 0) > 2_000 &&
      window.__FREE_SKI__?.yeti.events.some(
        (event) =>
          event.type === "yeti-activated" && event.boundary === "bottom",
      ),
  );

  const runNumberBeforeReset = await page.evaluate(
    () => window.__FREE_SKI__!.player.runNumber,
  );
  await page.keyboard.press("r");
  await page.waitForFunction((previousRunNumber) => {
    const runtime = window.__FREE_SKI__;
    return (
      runtime !== undefined &&
      runtime.player.runNumber > previousRunNumber &&
      runtime.player.motion === "grounded" &&
      runtime.player.simulationSeconds < 2 &&
      runtime.player.worldY >= 0 &&
      runtime.player.worldY < 10 &&
      runtime.yeti.snapshot.activeBoundaries.length === 0
    );
  }, runNumberBeforeReset);
});
