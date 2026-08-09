import { describe, expect, it } from "vitest";
import { FixedStepClock } from "./fixedStep";
import {
  NEUTRAL_PLAYER_INPUT,
  PlayerSimulation,
  type PlayerInputFrame,
} from "./player";

const STEP = 1 / 60;

function run(
  simulation: PlayerSimulation,
  seconds: number,
  input: Partial<PlayerInputFrame> = {},
): void {
  const frame = { ...NEUTRAL_PLAYER_INPUT, ...input };
  for (let index = 0; index < Math.round(seconds / STEP); index += 1)
    simulation.step(frame, STEP);
}

describe("PlayerSimulation", () => {
  it("accelerates downhill and preserves lateral momentum through three carve intensities", () => {
    const simulation = new PlayerSimulation();
    run(simulation, 0.08, { steer: -1 });
    expect(simulation.getSnapshot().heading).toBe("carve-left-1");
    run(simulation, 0.12, { steer: -1 });
    expect(simulation.getSnapshot().heading).toBe("carve-left-2");
    run(simulation, 0.2, { steer: -1 });
    const hardCarve = simulation.getSnapshot();
    expect(hardCarve.heading).toBe("carve-left-3");
    expect(hardCarve.velocityX).toBeLessThan(0);

    simulation.step(NEUTRAL_PLAYER_INPUT, STEP);
    expect(simulation.getSnapshot().velocityX).toBeLessThan(0);
    run(simulation, 1, { steer: 1 });
    expect(simulation.getSnapshot().velocityX).toBeGreaterThan(0);
  });

  it("supports traverse, uphill, tuck, braking and Turbo", () => {
    const simulation = new PlayerSimulation();
    run(simulation, 0.12, { steer: -1, uphill: true });
    expect(simulation.getSnapshot().heading).toBe("traverse-left");
    run(simulation, 1.2, { steer: -1, uphill: true });
    expect(simulation.getSnapshot()).toMatchObject({ heading: "uphill-left" });
    expect(simulation.getSnapshot().velocityY).toBeLessThan(0);

    simulation.reset();
    run(simulation, 1.5, { tuck: true });
    const normalTuckSpeed = simulation.getSnapshot().speedMetersPerSecond;
    simulation.toggleTurbo();
    run(simulation, 1, { tuck: true });
    expect(simulation.getSnapshot().speedMetersPerSecond).toBeGreaterThan(
      normalTuckSpeed,
    );

    run(simulation, 1, { brake: true });
    expect(simulation.getSnapshot().speedMetersPerSecond).toBeLessThan(2);
  });

  it("lands a neutral jump cleanly", () => {
    const simulation = new PlayerSimulation();
    simulation.step({ ...NEUTRAL_PLAYER_INPUT, jumpPressed: true }, STEP);
    expect(simulation.getSnapshot().motion).toBe("airborne");
    run(simulation, 1.3);
    expect(simulation.getSnapshot()).toMatchObject({
      jumpCount: 1,
      lastLanding: "clean",
      motion: "grounded",
    });
  });

  it("crashes an off-axis landing and recovers", () => {
    const simulation = new PlayerSimulation();
    simulation.step({ ...NEUTRAL_PLAYER_INPUT, jumpPressed: true }, STEP);
    let sawCrash = false;
    for (let index = 0; index < 160; index += 1) {
      simulation.step({ ...NEUTRAL_PLAYER_INPUT, steer: -1 }, STEP);
      if (simulation.getSnapshot().motion === "crashed") sawCrash = true;
    }
    expect(sawCrash).toBe(true);
    expect(simulation.getSnapshot()).toMatchObject({
      crashCount: 1,
      lastLanding: "crash",
      motion: "grounded",
    });
  });

  it("pauses without advancing and resets all run state", () => {
    const simulation = new PlayerSimulation();
    run(simulation, 1);
    simulation.togglePause();
    const paused = simulation.getSnapshot();
    run(simulation, 1, { tuck: true });
    expect(simulation.getSnapshot()).toEqual(paused);

    simulation.reset();
    expect(simulation.getSnapshot()).toMatchObject({
      paused: false,
      runNumber: 2,
      simulationSeconds: 0,
      turbo: false,
      worldX: 0,
      worldY: 0,
    });
  });

  it("is frame-rate independent behind the fixed-step clock", () => {
    function simulate(renderHz: number) {
      const simulation = new PlayerSimulation();
      const clock = new FixedStepClock(STEP, 20);
      for (let frame = 0; frame < renderHz * 5; frame += 1) {
        clock.advance(1 / renderHz, (delta) =>
          simulation.step(
            { ...NEUTRAL_PLAYER_INPUT, steer: frame < renderHz * 2.5 ? -1 : 1 },
            delta,
          ),
        );
      }
      return simulation.getSnapshot();
    }

    const atThirty = simulate(30);
    const atOneTwenty = simulate(120);
    expect(atThirty.simulationSeconds).toBeCloseTo(
      atOneTwenty.simulationSeconds,
      10,
    );
    expect(atThirty.worldX).toBeCloseTo(atOneTwenty.worldX, 10);
    expect(atThirty.worldY).toBeCloseTo(atOneTwenty.worldY, 10);
  });
});
