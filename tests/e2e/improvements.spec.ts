import { expect, test } from "@playwright/test";

test("failed artwork stays on the loading screen and can be retried", async ({
  page,
}) => {
  let fail = true;
  await page.route("**/freeski-atlas.webp*", async (route) => {
    if (fail) await route.abort();
    else await route.continue();
  });
  await page.goto("/?pointer=0&training=1");
  await expect(page.locator("#loading-retry")).toBeVisible();
  await expect(page.locator("#game-shell")).not.toHaveAttribute(
    "data-game-ready",
    "true",
  );
  await expect(page.locator("#loading-status")).toContainText("could not load");
  fail = false;
  await page.locator("#loading-retry").click();
  await expect(page.locator("#game-shell")).toHaveAttribute(
    "data-game-ready",
    "true",
  );
  await expect(page.locator("#loading-screen")).toBeHidden();
  expect(await page.evaluate(() => window.__FREE_SKI__!.art.atlasLoaded)).toBe(
    true,
  );
});

test("pointer preference survives reload and explicit URL overrides stay temporary", async ({
  page,
}) => {
  await page.goto("/?training=1");
  await expect(page.locator("#game-shell")).toHaveAttribute(
    "data-game-ready",
    "true",
  );
  await page.locator("#settings-toggle").click();
  await page.locator("#pointer-toggle").click();
  await page.reload();
  await expect(page.locator("#pointer-toggle")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.goto("/?training=1&pointer=1");
  await expect(page.locator("#pointer-toggle")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.goto("/?training=1");
  await expect(page.locator("#pointer-toggle")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

for (const width of [320, 375, 768]) {
  test(`touch controls stay compact and release tricks on landing at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 667 });
    await page.goto("/?training=1&pointer=0&touch=1");
    await expect(page.locator("#game-shell")).toHaveAttribute(
      "data-game-ready",
      "true",
    );
    await expect(page.locator("#touch-controls button:visible")).toHaveCount(7);
    await expect(page.locator("#touch-reset")).toHaveCount(0);
    const left = await page.locator("#touch-left").boundingBox();
    const right = await page.locator("#touch-right").boundingBox();
    expect(left!.y).toBe(right!.y);
    expect(right!.x).toBeGreaterThan(left!.x);
    await page.locator("#touch-jump").click();
    await expect(page.locator(".touch-controls__air")).toBeVisible();
    const outside = await page
      .locator("#touch-controls button:visible")
      .evaluateAll((buttons) =>
        buttons.some((button) => {
          const box = button.getBoundingClientRect();
          return (
            box.x < 0 ||
            box.right > innerWidth ||
            box.bottom > innerHeight ||
            box.width < 44 ||
            box.height < 44
          );
        }),
      );
    expect(outside).toBe(false);
    await page.locator("#touch-spin-left").dispatchEvent("pointerdown", {
      pointerId: 91,
      pointerType: "touch",
      button: 0,
    });
    await expect(page.locator(".touch-controls__air")).toBeHidden();
    await page.waitForFunction(
      () => !window.__FREE_SKI__?.settings.heldActions.includes("trick-left"),
    );
    await expect(page.locator("#touch-controls button:visible")).toHaveCount(7);
  });
}

test("mobile race HUD displays course time and penalties in the existing bar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/?debug=1&pointer=0&courseTest=1");
  await expect(page.locator("#game-shell")).toHaveAttribute(
    "data-game-ready",
    "true",
  );
  await page.evaluate(() =>
    window.__FREE_SKI_DEBUG__!.stageCourseCrossing("slalom", "start"),
  );
  await expect(page.locator("#time-caption")).toHaveText("RACE");
  await expect(page.locator("#time-label")).toBeVisible();
  await expect(page.locator("#style-caption")).toHaveText("PENALTY S");
  await page.evaluate(() =>
    window.__FREE_SKI_DEBUG__!.stageCourseCrossing("slalom", 1, "missed"),
  );
  await expect(page.locator("#style-label")).toHaveText("+5");
  expect(
    Number(await page.locator("#time-label").textContent()),
  ).toBeGreaterThanOrEqual(5);
  await expect(page.locator("#mode-card")).toHaveCount(0);
});

test("the sound button responds to its first click and to clicks after keyboard unlock", async ({
  page,
}) => {
  await page.goto("/?training=1&pointer=0");
  await expect(page.locator("#game-shell")).toHaveAttribute(
    "data-game-ready",
    "true",
  );
  await page.locator("#audio-toggle").click();
  await expect(page.locator("#audio-toggle")).toHaveText("SOUND MUTED");
  await page.waitForFunction(() => window.__FREE_SKI__?.audio.unlocked);
  expect(
    await page.evaluate(() => localStorage.getItem("freeski.audio.muted.v1")),
  ).toBe("true");
  await page.locator("#audio-toggle").click();
  await expect(page.locator("#audio-toggle")).toHaveText("SOUND ON");
  await page.keyboard.press("s");
  await page.locator("#audio-toggle").click();
  await expect(page.locator("#audio-toggle")).toHaveText("SOUND MUTED");
  await page.locator("#audio-toggle").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#audio-toggle")).toHaveText("SOUND ON");
});
