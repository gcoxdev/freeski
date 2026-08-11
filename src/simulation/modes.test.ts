import { describe, expect, it } from "vitest";
import { CLASSIC_COURSES } from "../world/classicMountain";
import {
  MountainModeSimulation,
  type EventModeId,
  type ModePosition,
} from "./modes";

function position(
  worldX: number,
  worldY: number,
  simulationSeconds: number,
  style = 0,
): ModePosition {
  return { simulationSeconds, style, worldX, worldY };
}

function cross(
  simulation: MountainModeSimulation,
  x: number,
  y: number,
  seconds: number,
  style = 0,
): void {
  simulation.syncPosition(position(x, y - 0.25, seconds - 0.1, style));
  simulation.step(position(x, y + 0.25, seconds, style));
}

function start(
  simulation: MountainModeSimulation,
  mode: EventModeId,
  seconds = 1,
): void {
  const course = CLASSIC_COURSES.find((candidate) => candidate.id === mode)!;
  cross(simulation, course.centerX, course.startGate.y, seconds);
}

describe("MountainModeSimulation diegetic lifecycle", () => {
  it("starts each mode only by a downhill crossing inside its world gate", () => {
    for (const course of CLASSIC_COURSES) {
      const simulation = new MountainModeSimulation();
      simulation.syncPosition(
        position(course.centerX, course.startGate.y + 2, 0),
      );
      simulation.step(position(course.centerX, course.startGate.y - 2, 1));
      expect(simulation.getSnapshot().activeMode).toBeNull();
      cross(simulation, course.startGate.leftX - 1, course.startGate.y, 2);
      expect(simulation.getSnapshot().activeMode).toBeNull();
      cross(simulation, course.centerX, course.startGate.y, 3);
      expect(simulation.getSnapshot().activeMode).toBe(course.id);
      expect(simulation.drainEvents()).toEqual([
        expect.objectContaining({ mode: course.id, type: "mode-started" }),
      ]);
    }
  });

  it("ignores open skiing and other gates while one event is active", () => {
    const simulation = new MountainModeSimulation();
    const startY = CLASSIC_COURSES[0]!.startGate.y;
    simulation.syncPosition(position(80, startY - 1, 0));
    simulation.step(position(80, startY + 40, 2));
    expect(simulation.getSnapshot().activeMode).toBeNull();
    start(simulation, "slalom");
    cross(simulation, 0, startY, 3);
    expect(simulation.getSnapshot().activeMode).toBe("slalom");
    expect(simulation.getSnapshot().courses["free-style"].lifecycle).toBe(
      "idle",
    );
  });

  it("does not reset or duplicate state when leaving a lane or backtracking", () => {
    const simulation = new MountainModeSimulation();
    start(simulation, "slalom");
    const firstMarker = CLASSIC_COURSES[0]!.markers[0]!;
    cross(simulation, firstMarker.x - 1, firstMarker.y, 2);
    const afterMarker = simulation.getSnapshot().courses.slalom;
    expect(afterMarker.markers[0]?.state).toBe("correct");
    simulation.syncPosition(position(100, firstMarker.y + 20, 3));
    simulation.step(position(100, firstMarker.y - 20, 4));
    cross(simulation, firstMarker.x - 1, firstMarker.y, 5);
    const afterBacktrack = simulation.getSnapshot().courses.slalom;
    expect(afterBacktrack.markers[0]?.state).toBe("correct");
    expect(afterBacktrack.penaltySeconds).toBe(0);
    expect(
      simulation
        .drainEvents()
        .filter((event) => event.type.startsWith("marker")),
    ).toHaveLength(1);
  });
});

describe("timed marker events", () => {
  it("preserves exact Slalom geometry and all marker outcomes", () => {
    const simulation = new MountainModeSimulation();
    start(simulation, "slalom", 1);
    const course = CLASSIC_COURSES.find((item) => item.id === "slalom")!;
    expect(course.lengthMeters).toBe(540);
    expect(course.markers).toHaveLength(24);
    const [red, blue, third] = course.markers;
    cross(simulation, red!.x - 1, red!.y, 2);
    cross(simulation, blue!.x - 1, blue!.y, 3);
    cross(simulation, course.centerX + course.halfWidth + 4, third!.y, 4);
    const run = simulation.getSnapshot().courses.slalom;
    expect(run.markers.slice(0, 3).map((marker) => marker.state)).toEqual([
      "correct",
      "wrong-side",
      "missed",
    ]);
    expect(run.penaltySeconds).toBe(10);
    expect(simulation.drainEvents().map((event) => event.type)).toEqual([
      "mode-started",
      "marker-correct",
      "marker-wrong-side",
      "marker-missed",
    ]);
  });

  it("finishes Slalom with raw plus five-second penalties and is idempotent", () => {
    const simulation = new MountainModeSimulation();
    const course = CLASSIC_COURSES.find((item) => item.id === "slalom")!;
    start(simulation, "slalom", 10);
    course.markers.forEach((marker, index) => {
      const correctX = marker.x + (marker.color === "red" ? -1 : 1);
      const x = index === 0 ? marker.x + 1 : correctX;
      cross(simulation, x, marker.y, 11 + index);
    });
    cross(simulation, course.centerX, course.finishGate.y, 50);
    const run = simulation.getSnapshot().courses.slalom;
    expect(run.lifecycle).toBe("finished");
    expect(run.penaltySeconds).toBe(5);
    expect(run.result).toMatchObject({
      adjustedTimeSeconds: 45,
      mode: "slalom",
      penaltySeconds: 5,
      rawTimeSeconds: 40,
      score: null,
    });
    cross(simulation, course.centerX, course.finishGate.y, 60);
    expect(simulation.getSnapshot().courses.slalom.result).toEqual(run.result);
  });

  it("uses 39 researched Tree Slalom markers and requires its finish gate", () => {
    const simulation = new MountainModeSimulation();
    const course = CLASSIC_COURSES.find((item) => item.id === "tree-slalom")!;
    expect(course.lengthMeters).toBe(1_040);
    expect(course.markers).toHaveLength(39);
    start(simulation, "tree-slalom", 1);
    course.markers.forEach((marker, index) =>
      cross(
        simulation,
        marker.x + (marker.color === "red" ? -1 : 1),
        marker.y,
        2 + index,
      ),
    );
    cross(simulation, course.finishGate.rightX + 1, course.finishGate.y, 50);
    expect(simulation.getSnapshot().activeMode).toBe("tree-slalom");
    simulation.syncPosition(
      position(course.centerX, course.finishGate.y + 5, 51),
    );
    simulation.step(position(course.centerX, course.finishGate.y - 10, 52));
    cross(simulation, course.centerX, course.finishGate.y, 53);
    expect(simulation.getSnapshot().courses["tree-slalom"]).toMatchObject({
      lifecycle: "finished",
      penaltySeconds: 0,
    });
  });
});

describe("Free Style result", () => {
  it("finishes the 1000m course with time and Style earned during the run", () => {
    const simulation = new MountainModeSimulation();
    const course = CLASSIC_COURSES.find((item) => item.id === "free-style")!;
    expect(course.lengthMeters).toBe(1_040);
    cross(simulation, course.centerX, course.startGate.y, 5, 120);
    simulation.syncPosition(position(80, 700, 20, 420));
    simulation.step(position(-70, 600, 25, 500));
    expect(simulation.getSnapshot().activeMode).toBe("free-style");
    cross(simulation, course.centerX, course.finishGate.y, 35, 620);
    expect(simulation.getSnapshot().courses["free-style"].result).toMatchObject(
      {
        adjustedTimeSeconds: 30,
        mode: "free-style",
        penaltySeconds: 0,
        rawTimeSeconds: 30,
        score: 500,
      },
    );
  });
});
