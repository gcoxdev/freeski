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
});
