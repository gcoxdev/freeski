import { describe, expect, it } from "vitest";
import {
  ACCESSIBILITY_STORAGE_KEY,
  AccessibilitySettingsStore,
  defaultAccessibilitySettings,
  sanitizeAccessibilitySettings,
} from "./settings";

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial) values.set(ACCESSIBILITY_STORAGE_KEY, initial);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    values,
  };
}

describe("accessibility settings", () => {
  it("derives sensible first-run defaults from reduced-motion preference", () => {
    expect(defaultAccessibilitySettings(false)).toEqual({
      flash: true,
      reducedMotion: false,
      screenShake: true,
      volume: 0.8,
      yetiPresentation: "full",
    });
    expect(defaultAccessibilitySettings(true)).toEqual({
      flash: false,
      reducedMotion: true,
      screenShake: false,
      volume: 0.8,
      yetiPresentation: "reduced",
    });
  });

  it("sanitizes malformed values and clamps volume", () => {
    const fallback = defaultAccessibilitySettings(false);
    expect(
      sanitizeAccessibilitySettings(
        {
          flash: "yes",
          reducedMotion: true,
          screenShake: false,
          volume: 9,
          yetiPresentation: "unknown",
        },
        fallback,
      ),
    ).toEqual({
      flash: true,
      reducedMotion: true,
      screenShake: false,
      volume: 1,
      yetiPresentation: "full",
    });
  });

  it("persists and reloads every release accessibility preference", () => {
    const storage = memoryStorage();
    const first = new AccessibilitySettingsStore(storage, false);
    first.update({
      flash: false,
      reducedMotion: true,
      screenShake: false,
      volume: 0.35,
      yetiPresentation: "reduced",
    });
    expect(
      new AccessibilitySettingsStore(storage, false).getSnapshot(),
    ).toEqual({
      flash: false,
      reducedMotion: true,
      screenShake: false,
      volume: 0.35,
      yetiPresentation: "reduced",
    });
  });

  it("survives unavailable storage", () => {
    const denied = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    const store = new AccessibilitySettingsStore(denied, true);
    expect(store.update({ volume: 0.5 }).volume).toBe(0.5);
  });
});
