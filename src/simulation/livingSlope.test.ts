import { describe, expect, it } from "vitest";
import type { SeededRandom } from "../world/seed";
import {
  LIVING_SLOPE_TUNING,
  LivingSlopeSimulation,
  type LivingSlopePlayer,
  type LivingSlopeRamp,
} from "./livingSlope";

const STEP = 1 / 60;

function runFor(
  simulation: LivingSlopeSimulation,
  seconds: number,
  player: Omit<LivingSlopePlayer, "simulationSeconds"> = {
    worldX: 0,
    worldY: 0,
  },
  ramps: readonly LivingSlopeRamp[] = [],
): void {
  let time = simulation.getSnapshot().simulationSeconds;
  for (let index = 0; index < Math.ceil(seconds / STEP); index += 1) {
    time += STEP;
    simulation.step({ ...player, simulationSeconds: time }, STEP, ramps);
  }
}

function fixedRandom(value: number): SeededRandom {
  return {
    next: () => value,
    nextInt: (maximum) => Math.min(maximum - 1, Math.floor(value * maximum)),
  };
}

describe("LivingSlopeSimulation", () => {
  it("keeps a deterministic, bounded, pooling-ready actor population", () => {
    const first = new LivingSlopeSimulation("living-seed");
    const second = new LivingSlopeSimulation("living-seed");
    runFor(first, 1);
    runFor(second, 1);
    expect(first.getSnapshot()).toEqual(second.getSnapshot());
    expect(first.getSnapshot().actorCount).toBe(11);
    expect(first.getSnapshot().actorCount).toBeLessThanOrEqual(
      LIVING_SLOPE_TUNING.maximumActors,
    );
    expect(first.getSnapshot().bounded).toBe(true);
    expect(first.getSnapshot().workUnitsLastStep).toBe(
      first.getSnapshot().actorCount,
    );
  });

  it("cycles a beginner through both falls and recovery", () => {
    const simulation = new LivingSlopeSimulation("beginner");
    const start = simulation
      .getSnapshot()
      .actors.find((value) => value.kind === "beginner")!;
    runFor(simulation, 7);
    const events = simulation.drainEvents();
    expect(
      events.filter((event) => event.type === "beginner-fell"),
    ).toHaveLength(2);
    expect(
      events.filter((event) => event.type === "beginner-recovered"),
    ).toHaveLength(2);
    const beginner = simulation
      .getSnapshot()
      .actors.find((value) => value.kind === "beginner")!;
    expect(["cruising", "wobble"]).toContain(beginner.state);
    expect(beginner.worldY).toBeGreaterThan(start.worldY + 20);
  });

  it("triggers the top-entry snowboarder's jump and tumble only on ramp geometry", () => {
    const withRamp = new LivingSlopeSimulation("boarder");
    const withoutRamp = new LivingSlopeSimulation("boarder");
    const ramps = [
      {
        footprintRadius: 2,
        id: "test-ramp",
        worldX: 11,
        worldY: -24,
      },
    ] as const;
    const states = new Set<string>();
    for (let frame = 0; frame < 210; frame += 1) {
      withRamp.step(
        { simulationSeconds: (frame + 1) * STEP, worldX: 0, worldY: 0 },
        STEP,
        ramps,
      );
      withoutRamp.step(
        { simulationSeconds: (frame + 1) * STEP, worldX: 0, worldY: 0 },
        STEP,
        [],
      );
      states.add(
        withRamp
          .getSnapshot()
          .actors.find((value) => value.id === "snowboarder-top")!.state,
      );
    }
    const events = withRamp.drainEvents();
    const eventTypes = events.map((event) => event.type);
    expect(eventTypes).toEqual(
      expect.arrayContaining([
        "snowboarder-entered",
        "snowboarder-jumped",
        "snowboarder-tumbled",
        "snowboarder-landed",
      ]),
    );
    expect(
      events.find((event) => event.type === "snowboarder-jumped"),
    ).toMatchObject({ terrainObjectId: "test-ramp" });
    for (const phase of [1, 2, 3, 4])
      expect(states.has(`tumbling-${phase}`)).toBe(true);
    const rampFreeTypes = withoutRamp.drainEvents().map((event) => event.type);
    expect(rampFreeTypes).toContain("snowboarder-entered");
    expect(rampFreeTypes).not.toContain("snowboarder-jumped");
    expect(rampFreeTypes).not.toContain("snowboarder-tumbled");
  });

  it("knocks a dog without crashing the player, leaves a yellow-snow event, and recovers", () => {
    const simulation = new LivingSlopeSimulation("dog");
    expect(simulation.repositionActor("dog-0", 0, 0)).toBe(true);
    runFor(simulation, 0.1);
    expect(simulation.drainEvents().map((event) => event.type)).toContain(
      "dog-hit",
    );
    expect(
      simulation.getSnapshot().actors.find((value) => value.id === "dog-0")
        ?.state,
    ).toBe("knocked");
    runFor(simulation, 1.5, { worldX: 100, worldY: 0 });
    expect(simulation.drainEvents().map((event) => event.type)).toContain(
      "dog-recovered",
    );
    const recovered = simulation
      .getSnapshot()
      .actors.find((value) => value.id === "dog-0")!;
    expect(recovered.state).toBe(
      recovered.direction < 0 ? "running-left" : "running-right",
    );
    runFor(simulation, STEP, { worldX: 100, worldY: 0 });
    const running = simulation
      .getSnapshot()
      .actors.find((value) => value.id === "dog-0")!;
    expect(Math.sign(running.velocityX)).toBe(running.direction);
  });

  it("wakes a walking tree by proximity and moves it laterally before idling", () => {
    const simulation = new LivingSlopeSimulation("tree");
    expect(simulation.repositionActor("walking-tree-0", 5, 0)).toBe(true);
    runFor(simulation, 0.1);
    const start = simulation
      .getSnapshot()
      .actors.find((value) => value.id === "walking-tree-0")!;
    expect(start.state).toBe("walking-right");
    runFor(simulation, 2.5);
    const finish = simulation
      .getSnapshot()
      .actors.find((value) => value.id === "walking-tree-0")!;
    expect(finish.worldX).toBeGreaterThan(start.worldX + 4);
    expect(finish.state).toBe("idle");
    expect(simulation.drainEvents().map((event) => event.type)).toEqual(
      expect.arrayContaining(["walking-tree-woke", "walking-tree-moved"]),
    );
  });

  it("starts the walking tree patrol without requiring a collision", () => {
    const simulation = new LivingSlopeSimulation("tree-patrol");
    const before = simulation
      .getSnapshot()
      .actors.find((value) => value.id === "walking-tree-0")!;
    runFor(simulation, 2, { worldX: -50, worldY: before.worldY });
    const after = simulation
      .getSnapshot()
      .actors.find((value) => value.id === "walking-tree-0")!;
    expect(after.state).toBe("walking-right");
    expect(after.worldX).toBeGreaterThan(before.worldX);
  });

  it("loops chairs both ways and makes rider drops rare but seeded/injectable", () => {
    const noDrop = new LivingSlopeSimulation("chair-no-drop", fixedRandom(0.5));
    runFor(noDrop, 0.1);
    expect(noDrop.drainEvents().map((event) => event.type)).toContain(
      "chair-looped",
    );
    runFor(noDrop, 2);
    expect(
      noDrop
        .drainEvents()
        .some((event) => event.type === "chair-rider-dropped"),
    ).toBe(false);

    const seededDrop = new LivingSlopeSimulation("chair-drop", fixedRandom(0));
    runFor(seededDrop, STEP);
    expect(
      seededDrop
        .drainEvents()
        .some((event) => event.type === "chair-rider-dropped"),
    ).toBe(true);
    expect(LIVING_SLOPE_TUNING.chairDropChancePerFixedStep).toBe(1 / 4_096);
    expect(
      seededDrop
        .getSnapshot()
        .actors.find((value) => value.source === "chairlift")?.active,
    ).toBe(true);
  });

  it("supports a transparent deterministic chair-drop staging request", () => {
    const simulation = new LivingSlopeSimulation("staged", fixedRandom(1));
    simulation.requestChairDrop();
    runFor(simulation, STEP);
    expect(simulation.drainEvents().map((event) => event.type)).toContain(
      "chair-rider-dropped",
    );
  });
});
