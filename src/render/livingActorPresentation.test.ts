import { describe, expect, it } from "vitest";
import type { LivingActorSnapshot } from "../simulation/livingSlope";
import { livingActorPresentation } from "./livingActorPresentation";

function actor(overrides: Partial<LivingActorSnapshot>): LivingActorSnapshot {
  return {
    active: true,
    direction: 1,
    id: "actor",
    kind: "dog",
    riderCount: 0,
    source: "mountain",
    state: "running-right",
    stateSeconds: 0,
    velocityX: 4,
    velocityY: 1,
    worldX: 0,
    worldY: 0,
    ...overrides,
  };
}

describe("living actor atlas presentation", () => {
  it("faces the native right-facing dog toward its actual velocity", () => {
    expect(livingActorPresentation(actor({ velocityX: 4 })).flipX).toBe(false);
    expect(livingActorPresentation(actor({ velocityX: -4 })).flipX).toBe(true);
  });

  it("faces the native left-facing walking tree toward travel and alternates feet", () => {
    const left = actor({
      kind: "walking-tree",
      state: "walking-left",
      stateSeconds: 0,
      velocityX: -2.2,
    });
    const right = actor({
      ...left,
      state: "walking-right",
      stateSeconds: 0.16,
      velocityX: 2.2,
    });
    for (const [index, phase] of ["a", "b", "c", "d", "a"].entries()) {
      const stateSeconds = index / 7 + 0.001;
      expect(livingActorPresentation({ ...left, stateSeconds })).toMatchObject({
        flipX: false,
        frame: `walking-tree/walk-${phase}`,
        displayHeight: 66,
        originY: 0.94,
      });
      expect(livingActorPresentation({ ...right, stateSeconds })).toMatchObject(
        {
          flipX: true,
          frame: `walking-tree/walk-${phase}`,
          displayHeight: 66,
          originY: 0.94,
        },
      );
    }
    expect(livingActorPresentation({ ...left, state: "idle" }).frame).toBe(
      "walking-tree/idle",
    );
  });

  it("uses every beginner pose across its state cycle", () => {
    expect(
      livingActorPresentation(actor({ kind: "beginner", state: "cruising" }))
        .frame,
    ).toBe("beginner/downhill");
    expect(
      livingActorPresentation(
        actor({ kind: "beginner", state: "wobble", velocityX: -2 }),
      ).frame,
    ).toBe("beginner/carve-left");
    expect(
      livingActorPresentation(
        actor({ kind: "beginner", state: "wobble", velocityX: 2 }),
      ).frame,
    ).toBe("beginner/carve-right");
    expect(
      livingActorPresentation(
        actor({ kind: "beginner", state: "fallen-forward" }),
      ).frame,
    ).toBe("beginner/fall-forward");
    expect(
      livingActorPresentation(
        actor({ kind: "beginner", state: "fallen-backward" }),
      ).frame,
    ).toBe("beginner/fall-backward");
  });

  it("uses both dedicated chair-drop frames", () => {
    expect(
      livingActorPresentation(
        actor({ kind: "chairlift", state: "dropping-skier" }),
      ).frame,
    ).toBe("chairlift/skier-drop");
    expect(
      livingActorPresentation(
        actor({ kind: "chairlift", state: "dropping-snowboarder" }),
      ).frame,
    ).toBe("chairlift/snowboarder-drop");
  });

  it("orients chairs differently on opposing cable directions", () => {
    expect(
      livingActorPresentation(
        actor({ kind: "chairlift", direction: -1, state: "occupied" }),
      ).flipX,
    ).toBe(false);
    expect(
      livingActorPresentation(
        actor({ kind: "chairlift", direction: 1, state: "occupied" }),
      ).flipX,
    ).toBe(true);
  });
});
