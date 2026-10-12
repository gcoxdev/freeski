import { describe, expect, it } from "vitest";
import { FixedStepClock } from "./fixedStep";
import {
  NEUTRAL_PLAYER_INPUT,
  PLAYER_HEADINGS,
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
  it("quantizes aim to seven 30-degree headings without upward travel", () => {
    const aims = [-1, -2 / 3, -1 / 3, 0, 1 / 3, 2 / 3, 1];
    expect(PLAYER_HEADINGS).toHaveLength(7);
    for (const [index, steer] of aims.entries()) {
      const simulation = new PlayerSimulation();
      run(simulation, 1.2, { aiming: true, steer });
      const snapshot = simulation.getSnapshot();
      expect(snapshot.heading).toBe(PLAYER_HEADINGS[index]);
      expect(snapshot.velocityY).toBeGreaterThanOrEqual(0);
      if (snapshot.heading.endsWith("stop"))
        expect(snapshot.speedMetersPerSecond).toBeLessThan(0.01);
    }
  });

  it("steps keyboard steering through the same seven headings", () => {
    const simulation = new PlayerSimulation();
    simulation.step({ ...NEUTRAL_PLAYER_INPUT, turn: -1 }, STEP);
    expect(simulation.getSnapshot().heading).toBe("left-30");
    run(simulation, 0.16, { turn: -1 });
    expect(simulation.getSnapshot().heading).toBe("left-60");
    run(simulation, 0.16, { turn: -1 });
    expect(simulation.getSnapshot().heading).toBe("left-stop");
    run(simulation, 1, { turn: -1 });
    expect(simulation.getSnapshot().speedMetersPerSecond).toBeLessThan(0.01);

    simulation.step(NEUTRAL_PLAYER_INPUT, STEP);
    expect(simulation.getSnapshot().heading).toBe("left-stop");
    simulation.step({ ...NEUTRAL_PLAYER_INPUT, turn: 1 }, STEP);
    expect(simulation.getSnapshot().heading).toBe("left-60");

    simulation.step({ ...NEUTRAL_PLAYER_INPUT, aiming: true, steer: 0 }, STEP);
    expect(simulation.getSnapshot().heading).toBe("downhill");
  });

  it("stops immediately at either exact side-facing heading", () => {
    for (const steer of [-1, 1]) {
      const simulation = new PlayerSimulation();
      run(simulation, 0.5, { tuck: true });
      simulation.step({ ...NEUTRAL_PLAYER_INPUT, aiming: true, steer }, STEP);
      expect(simulation.getSnapshot()).toMatchObject({
        heading: steer < 0 ? "left-stop" : "right-stop",
        speedMetersPerSecond: 0,
        velocityX: 0,
        velocityY: 0,
      });
    }
  });

  it("supports downhill tuck, braking and Turbo without uphill movement", () => {
    const simulation = new PlayerSimulation();
    run(simulation, 1.5, { tuck: true });
    const normalTuck = simulation.getSnapshot();
    expect(normalTuck).toMatchObject({ heading: "downhill", tucking: true });
    expect(normalTuck.velocityY).toBeGreaterThan(0);

    simulation.toggleTurbo();
    run(simulation, 1, { tuck: true });
    expect(simulation.getSnapshot().speedMetersPerSecond).toBeGreaterThan(
      normalTuck.speedMetersPerSecond,
    );

    run(simulation, 1.5, { brake: true });
    expect(simulation.getSnapshot().heading).toBe("left-stop");
    expect(simulation.getSnapshot().speedMetersPerSecond).toBeLessThan(0.01);
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

  it("turns two airborne jump clicks into one complete rotation", () => {
    const simulation = new PlayerSimulation();
    simulation.step({ ...NEUTRAL_PLAYER_INPUT, jumpPressed: true }, STEP);
    simulation.step({ ...NEUTRAL_PLAYER_INPUT, jumpPressed: true }, STEP);
    simulation.step(NEUTRAL_PLAYER_INPUT, STEP);
    simulation.step({ ...NEUTRAL_PLAYER_INPUT, jumpPressed: true }, STEP);
    run(simulation, 1.3);
    expect(simulation.getSnapshot()).toMatchObject({
      lastLanding: "clean",
      motion: "grounded",
    });
    expect(
      simulation
        .drainEvents()
        .filter((event) => event.type === "rotation-clicked")
        .map((event) => event.detail),
    ).toEqual(["1-of-2", "2-of-2"]);
  });

  it("accepts repeated airborne clicks for multiple complete flips", () => {
    const simulation = new PlayerSimulation();
    expect(simulation.launch("ramp", 12.8)).toBe(true);
    for (let click = 0; click < 4; click += 1) {
      simulation.step({ ...NEUTRAL_PLAYER_INPUT, jumpPressed: true }, STEP);
      simulation.step(NEUTRAL_PLAYER_INPUT, STEP);
    }
    run(simulation, 2.8);
    expect(simulation.getSnapshot()).toMatchObject({
      lastLanding: "clean",
      motion: "grounded",
    });
    expect(
      simulation
        .drainEvents()
        .filter((event) => event.type === "rotation-clicked")
        .map((event) => event.detail),
    ).toEqual(["1-of-2", "2-of-2", "3-of-4", "4-of-4"]);
  });

  it("keeps pointer steering from turning a completed ramp flip into a crash", () => {
    const simulation = new PlayerSimulation();
    expect(simulation.launch("ramp", 12.8)).toBe(true);
    for (let click = 0; click < 2; click += 1) {
      simulation.step(
        {
          ...NEUTRAL_PLAYER_INPUT,
          aiming: true,
          jumpPressed: true,
          steer: 0.85,
        },
        STEP,
      );
      simulation.step(
        { ...NEUTRAL_PLAYER_INPUT, aiming: true, steer: 0.85 },
        STEP,
      );
    }
    run(simulation, 2.8, { aiming: true, steer: 0.85 });
    expect(simulation.getSnapshot()).toMatchObject({
      airTilt: 0,
      lastLanding: "clean",
      motion: "grounded",
    });
  });

  it("crashes an incomplete half rotation and records its crash kind", () => {
    const simulation = new PlayerSimulation();
    simulation.step({ ...NEUTRAL_PLAYER_INPUT, jumpPressed: true }, STEP);
    simulation.step({ ...NEUTRAL_PLAYER_INPUT, jumpPressed: true }, STEP);
    let crash = simulation.getSnapshot();
    for (let index = 0; index < 160 && crash.motion !== "crashed"; index += 1) {
      simulation.step(NEUTRAL_PLAYER_INPUT, STEP);
      crash = simulation.getSnapshot();
    }
    expect(crash).toMatchObject({ crashKind: "landing", motion: "crashed" });

    run(simulation, 2);
    expect(simulation.getSnapshot()).toMatchObject({
      crashCount: 1,
      lastLanding: "crash",
      motion: "grounded",
    });
  });

  it("distinguishes a run-over from an ordinary impact", () => {
    const simulation = new PlayerSimulation();
    expect(simulation.tryCrash("snowboarder:test", "runover")).toBe(true);
    expect(simulation.getSnapshot()).toMatchObject({
      crashKind: "runover",
      motion: "crashed",
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
            {
              ...NEUTRAL_PLAYER_INPUT,
              aiming: true,
              steer: frame < renderHz * 2.5 ? -1 / 3 : 1 / 3,
            },
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
