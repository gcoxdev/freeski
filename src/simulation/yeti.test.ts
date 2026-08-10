import { describe, expect, it } from "vitest";
import {
  WORLD_BOUNDARIES_METERS,
  type WorldBoundary,
} from "../world/boundaries";
import {
  YETI_TUNING,
  YetiSimulation,
  foreshadowFor,
  foreshadowIntensity,
  type YetiPlayerState,
} from "./yeti";

const STEP = 1 / 60;

function player(overrides: Partial<YetiPlayerState> = {}): YetiPlayerState {
  return {
    simulationSeconds: 0,
    turbo: false,
    velocityX: 0,
    velocityY: 0,
    worldX: 0,
    worldY: 0,
    ...overrides,
  };
}

function stepFor(
  simulation: YetiSimulation,
  value: YetiPlayerState,
  seconds: number,
): YetiPlayerState {
  let current = value;
  for (let frame = 0; frame < Math.ceil(seconds / STEP); frame += 1) {
    current = {
      ...current,
      simulationSeconds: current.simulationSeconds + STEP,
    };
    simulation.step(current, STEP);
  }
  return current;
}

describe("YetiSimulation", () => {
  const boundaries: readonly [
    WorldBoundary,
    YetiPlayerState,
    YetiPlayerState,
  ][] = [
    [
      "top",
      player({ worldY: WORLD_BOUNDARIES_METERS.topYeti }),
      player({ worldY: WORLD_BOUNDARIES_METERS.topYeti - 0.001 }),
    ],
    [
      "bottom",
      player({ worldY: WORLD_BOUNDARIES_METERS.bottomYeti }),
      player({ worldY: WORLD_BOUNDARIES_METERS.bottomYeti + 0.001 }),
    ],
    [
      "left",
      player({ worldX: WORLD_BOUNDARIES_METERS.leftYeti }),
      player({ worldX: WORLD_BOUNDARIES_METERS.leftYeti - 0.001 }),
    ],
    [
      "right",
      player({ worldX: WORLD_BOUNDARIES_METERS.rightYeti }),
      player({ worldX: WORLD_BOUNDARIES_METERS.rightYeti + 0.001 }),
    ],
  ];

  it.each(boundaries)(
    "activates %s exclusively beyond, never exactly on, its threshold",
    (boundary, exact, beyond) => {
      const simulation = new YetiSimulation();
      simulation.step(exact, STEP);
      expect(
        simulation.getSnapshot(exact.worldY).activeBoundaries,
      ).not.toContain(boundary);
      simulation.step({ ...beyond, simulationSeconds: STEP * 2 }, STEP);
      expect(simulation.getSnapshot(beyond.worldY).activeBoundaries).toContain(
        boundary,
      );
    },
  );

  it("spawns and repositions at a protected fair distance", () => {
    const simulation = new YetiSimulation();
    let current = player({ worldY: 2_001 });
    simulation.step(current, STEP);
    let event = simulation
      .drainEvents()
      .find((candidate) => candidate.type === "yeti-activated")!;
    expect(event.safeDistanceMeters).toBeGreaterThanOrEqual(
      YETI_TUNING.safeRepositionDistanceMeters,
    );
    expect(
      simulation
        .getSnapshot(current.worldY)
        .controllers.find((value) => value.boundary === "bottom")
        ?.protectionSeconds,
    ).toBeGreaterThan(0);

    current = { ...current, simulationSeconds: STEP, worldX: 200 };
    simulation.step(current, STEP);
    event = simulation
      .drainEvents()
      .find((candidate) => candidate.type === "yeti-repositioned")!;
    expect(event.safeDistanceMeters).toBeGreaterThanOrEqual(
      YETI_TUNING.safeRepositionDistanceMeters,
    );
  });

  it("steers toward the skier within directional velocity caps", () => {
    const simulation = new YetiSimulation();
    let current = player({ worldY: 2_001, velocityY: 25 });
    current = stepFor(simulation, current, 1);
    const controller = simulation
      .getSnapshot(current.worldY)
      .controllers.find((value) => value.boundary === "bottom")!;
    expect(Math.abs(controller.velocityX)).toBeLessThanOrEqual(
      YETI_TUNING.maximumHorizontalSpeed,
    );
    expect(Math.abs(controller.velocityY)).toBeLessThanOrEqual(
      YETI_TUNING.maximumVerticalSpeed,
    );
    expect(controller.velocityY).toBeGreaterThan(0);
  });

  it("opens a measured Turbo evasion window without making contact impossible", () => {
    const simulation = new YetiSimulation();
    let current = player({ worldY: 2_001 });
    current = stepFor(simulation, current, 0.2);
    current = { ...current, turbo: true };
    simulation.step(current, STEP);
    expect(simulation.drainEvents().map((event) => event.type)).toContain(
      "turbo-evasion",
    );
    expect(
      simulation.getSnapshot(current.worldY).turboEvasionSeconds,
    ).toBeGreaterThan(1.5);

    current = stepFor(simulation, current, 1.2);
    const controller = simulation
      .getSnapshot(current.worldY)
      .controllers.find((value) => value.boundary === "bottom")!;
    expect(
      simulation.repositionYeti(controller.id, current.worldX, current.worldY),
    ).toBe(true);
    simulation.step(
      { ...current, simulationSeconds: current.simulationSeconds + STEP },
      STEP,
    );
    expect(simulation.getSnapshot(current.worldY).capturePhase).toBe("windup");
  });

  it("runs windup, pounce, grab, eat, chew, recovery, and reset with no soft lock", () => {
    const simulation = new YetiSimulation();
    let current = player({ worldY: 2_001 });
    current = stepFor(simulation, current, 1.2);
    expect(
      simulation.repositionYeti("yeti-bottom", current.worldX, current.worldY),
    ).toBe(true);
    current = stepFor(simulation, current, STEP);
    const phases = new Set([
      simulation.getSnapshot(current.worldY).capturePhase,
    ]);
    for (let frame = 0; frame < 240; frame += 1) {
      current = stepFor(simulation, current, STEP);
      phases.add(simulation.getSnapshot(current.worldY).capturePhase);
      if (simulation.getSnapshot(current.worldY).resetRequested) break;
    }
    expect(phases).toEqual(
      new Set(["windup", "pounce", "grab", "eat", "chew", "recovery"]),
    );
    expect(simulation.getSnapshot(current.worldY).playerRemoved).toBe(true);
    expect(simulation.getSnapshot(current.worldY).resetRequested).toBe(true);
    expect(simulation.drainEvents().map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "capture-started",
        "pounced",
        "grabbed",
        "eaten",
        "chewing",
        "reset-requested",
      ]),
    );
    simulation.acknowledgeReset();
    expect(simulation.getSnapshot(0)).toMatchObject({
      activeBoundaries: [],
      capturePhase: "none",
      capturedBy: null,
      playerRemoved: false,
      resetRequested: false,
    });
    simulation.step(
      player({ simulationSeconds: current.simulationSeconds + STEP }),
      STEP,
    );
    expect(simulation.getSnapshot(0).activeBoundaries).toEqual([]);
  });
});

describe("foreshadow ramp", () => {
  it("is off through 1800m, rises monotonically, and reaches full strength at 2000m", () => {
    expect(foreshadowIntensity(1_799.999)).toBe(0);
    expect(foreshadowIntensity(1_800)).toBe(0);
    const values = [1_825, 1_850, 1_900, 1_950, 1_975].map(foreshadowIntensity);
    expect(values).toEqual([...values].sort((left, right) => left - right));
    expect(values[0]).toBeGreaterThan(0);
    expect(values.at(-1)).toBeLessThan(1);
    expect(foreshadowIntensity(2_000)).toBe(1);
    expect(foreshadowIntensity(2_100)).toBe(1);
    expect(foreshadowFor(1_950)).toMatchObject({
      intensity: expect.any(Number),
      windStreaks: expect.any(Number),
    });
  });
});
