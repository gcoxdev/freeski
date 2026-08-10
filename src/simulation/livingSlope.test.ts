import { describe, expect, it } from "vitest";
import type { SeededRandom } from "../world/seed";
import {
  LIVING_SLOPE_TUNING,
  LivingSlopeSimulation,
  type LivingSlopePlayer,
} from "./livingSlope";

const STEP = 1 / 60;

function runFor(
  simulation: LivingSlopeSimulation,
  seconds: number,
  player: Omit<LivingSlopePlayer, "simulationSeconds"> = {
    worldX: 0,
    worldY: 0,
  },
): void {
  let time = simulation.getSnapshot().simulationSeconds;
  for (let index = 0; index < Math.ceil(seconds / STEP); index += 1) {
    time += STEP;
    simulation.step({ ...player, simulationSeconds: time }, STEP);
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
    runFor(simulation, 6);
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
  });

  it("runs top-entry snowboarder carve, jump, four tumble phases, and landing", () => {
    const simulation = new LivingSlopeSimulation("boarder");
    const states = new Set<string>();
    for (let frame = 0; frame < 210; frame += 1) {
      simulation.step(
        { simulationSeconds: (frame + 1) * STEP, worldX: 0, worldY: 0 },
        STEP,
      );
      states.add(
        simulation
          .getSnapshot()
          .actors.find((value) => value.id === "snowboarder-top")!.state,
      );
    }
    const eventTypes = simulation.drainEvents().map((event) => event.type);
    expect(eventTypes).toEqual(
      expect.arrayContaining([
        "snowboarder-entered",
        "snowboarder-jumped",
        "snowboarder-tumbled",
        "snowboarder-landed",
      ]),
    );
    for (const phase of [1, 2, 3, 4])
      expect(states.has(`tumbling-${phase}`)).toBe(true);
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
    runFor(simulation, 1.5);
    expect(simulation.drainEvents().map((event) => event.type)).toContain(
      "dog-recovered",
    );
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
