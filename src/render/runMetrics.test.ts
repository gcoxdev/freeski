import { expect, it } from "vitest";
import { MountainModeSimulation } from "../simulation/modes";
import { runMetrics } from "./runMetrics";
it("uses the active course clock, includes penalties and resets the displayed Freestyle score", () => {
  const modes = new MountainModeSimulation().getSnapshot();
  expect(runMetrics({ simulationSeconds: 60 }, 500, modes)).toMatchObject({
    time: 60,
    style: "500",
    styleCaption: "STYLE",
  });
  expect(
    runMetrics({ simulationSeconds: 60 }, 500, {
      ...modes,
      activeMode: "slalom",
      courses: {
        ...modes.courses,
        slalom: {
          ...modes.courses.slalom,
          elapsedSeconds: 12,
          penaltySeconds: 5,
        },
      },
    }),
  ).toEqual({
    time: 17,
    timeCaption: "RACE",
    style: "+5",
    styleCaption: "PENALTY S",
  });
  expect(
    runMetrics({ simulationSeconds: 60 }, 500, {
      ...modes,
      activeMode: "free-style",
      courses: {
        ...modes.courses,
        "free-style": {
          ...modes.courses["free-style"],
          elapsedSeconds: 3,
          styleEarned: 25,
        },
      },
    }),
  ).toMatchObject({ time: 3, style: "25", styleCaption: "SCORE" });
});
