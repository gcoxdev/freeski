export const ACCESSIBILITY_STORAGE_KEY = "freeski.accessibility.v1";

export type YetiPresentation = "full" | "reduced";

export interface AccessibilitySettings {
  readonly flash: boolean;
  readonly reducedMotion: boolean;
  readonly screenShake: boolean;
  readonly volume: number;
  readonly yetiPresentation: YetiPresentation;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function defaultAccessibilitySettings(
  prefersReducedMotion: boolean,
): AccessibilitySettings {
  return Object.freeze({
    flash: !prefersReducedMotion,
    reducedMotion: prefersReducedMotion,
    screenShake: !prefersReducedMotion,
    volume: 0.8,
    yetiPresentation: prefersReducedMotion ? "reduced" : "full",
  });
}

function normalizedVolume(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}

export function sanitizeAccessibilitySettings(
  value: unknown,
  fallback: AccessibilitySettings,
): AccessibilitySettings {
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Partial<AccessibilitySettings>;
  return Object.freeze({
    flash:
      typeof candidate.flash === "boolean" ? candidate.flash : fallback.flash,
    reducedMotion:
      typeof candidate.reducedMotion === "boolean"
        ? candidate.reducedMotion
        : fallback.reducedMotion,
    screenShake:
      typeof candidate.screenShake === "boolean"
        ? candidate.screenShake
        : fallback.screenShake,
    volume: normalizedVolume(candidate.volume, fallback.volume),
    yetiPresentation:
      candidate.yetiPresentation === "full" ||
      candidate.yetiPresentation === "reduced"
        ? candidate.yetiPresentation
        : fallback.yetiPresentation,
  });
}

/** Small resilient persisted store; gameplay remains available if storage fails. */
export class AccessibilitySettingsStore {
  private value: AccessibilitySettings;

  constructor(
    private readonly storage: StorageLike | undefined,
    prefersReducedMotion: boolean,
  ) {
    const fallback = defaultAccessibilitySettings(prefersReducedMotion);
    let persisted: unknown;
    try {
      const raw = storage?.getItem(ACCESSIBILITY_STORAGE_KEY);
      persisted = raw ? JSON.parse(raw) : undefined;
    } catch {
      persisted = undefined;
    }
    this.value = sanitizeAccessibilitySettings(persisted, fallback);
  }

  getSnapshot(): AccessibilitySettings {
    return this.value;
  }

  update(patch: Partial<AccessibilitySettings>): AccessibilitySettings {
    this.value = sanitizeAccessibilitySettings(
      { ...this.value, ...patch },
      this.value,
    );
    try {
      this.storage?.setItem(
        ACCESSIBILITY_STORAGE_KEY,
        JSON.stringify(this.value),
      );
    } catch {
      // Storage denial must not disable accessibility controls.
    }
    return this.value;
  }
}
