import { describe, expect, it } from "vitest";
import {
  ALPINE_SOUND_BANK,
  AlpineAudio,
  AUDIO_MUTE_STORAGE_KEY,
} from "./AlpineAudio";

describe("AlpineAudio", () => {
  it("catalogs every Gate 6 sound family", () => {
    expect(ALPINE_SOUND_BANK).toEqual(
      expect.arrayContaining([
        "jump",
        "landing",
        "crash",
        "gate-start",
        "dog-bark",
        "lift-clack",
        "mushroom-secret",
        "ui-toggle",
        "yeti-warning",
        "yeti-eat",
      ]),
    );
    expect(new Set(ALPINE_SOUND_BANK).size).toBe(ALPINE_SOUND_BANK.length);
  });

  it("loads and persists mute without creating an AudioContext", () => {
    const values = new Map<string, string>([[AUDIO_MUTE_STORAGE_KEY, "true"]]);
    const audio = new AlpineAudio({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    });
    expect(audio.getSnapshot()).toMatchObject({
      gestureRequired: true,
      muted: true,
      unlocked: false,
    });
    audio.toggleMuted();
    expect(values.get(AUDIO_MUTE_STORAGE_KEY)).toBe("false");
    expect(audio.getSnapshot().muted).toBe(false);
  });

  it("records cues before unlock without violating autoplay", () => {
    const audio = new AlpineAudio();
    audio.play("jump");
    expect(audio.getSnapshot()).toMatchObject({
      cueCount: 1,
      gestureRequired: true,
      lastCue: "jump",
      unlocked: false,
    });
  });
});
