import { describe, expect, it } from "vitest";
import type { ActionFrame } from "../input/actions";
import { PlayerSimulation } from "../simulation/player";
import { SIMULATION_STEP_SECONDS } from "../simulation/fixedStep";
import { ReplayRecorder } from "./replay";

function actions(patch: Partial<ActionFrame["player"]> = {}): ActionFrame {
  return {
    debugPressed: false,
    pausePressed: false,
    player: {
      aiming: false,
      brake: false,
      jumpPressed: false,
      steer: 0,
      trickFlip: 0,
      trickSpin: 0,
      tuck: false,
      turn: 0,
      ...patch,
    },
    resetPressed: false,
    turboPressed: false,
  };
}

describe("bounded deterministic replay", () => {
  it("exports seed, generator version, fixed steps and deterministic actions", () => {
    const first = new ReplayRecorder("same-seed", "world-v1", 60);
    const second = new ReplayRecorder("same-seed", "world-v1", 60);
    for (let step = 1; step <= 40; step += 1) {
      const frame = actions({
        jumpPressed: step === 10,
        steer: step < 20 ? -0.333_333_3 : 0.5,
        tuck: step >= 25,
      });
      first.record(step, frame);
      second.record(step, frame);
    }
    expect(first.export()).toEqual(second.export());
    expect(first.getSnapshot()).toEqual(second.getSnapshot());
    expect(first.getSnapshot()).toMatchObject({
      count: 40,
      firstFixedStep: 1,
      generatorVersion: "world-v1",
      lastFixedStep: 40,
      seed: "same-seed",
    });
  });

  it("replays the same action frames to the same simulation result", () => {
    const recorder = new ReplayRecorder("simulation-seed", "world-v1");
    for (let step = 1; step <= 180; step += 1)
      recorder.record(
        step,
        actions({
          jumpPressed: step === 60,
          steer: step < 45 ? -1 : step < 90 ? 1 : 0,
          tuck: step >= 100,
        }),
      );
    const simulations = [new PlayerSimulation(), new PlayerSimulation()];
    for (const simulation of simulations)
      for (const frame of recorder.export().frames)
        simulation.step(frame.player, SIMULATION_STEP_SECONDS);
    expect(simulations[0]!.getSnapshot()).toEqual(
      simulations[1]!.getSnapshot(),
    );
  });

  it("caps memory and reports evicted frames", () => {
    const recorder = new ReplayRecorder("bounded", "world-v1", 60);
    for (let step = 1; step <= 75; step += 1) recorder.record(step, actions());
    expect(recorder.getSnapshot()).toMatchObject({
      capacity: 60,
      count: 60,
      droppedFrames: 15,
      firstFixedStep: 16,
      lastFixedStep: 75,
    });
  });
});
