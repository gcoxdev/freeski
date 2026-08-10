import { describe, expect, it } from "vitest";
import {
  CLASSIC_SCORE_ANCHORS,
  MODERN_EVENT_AWARDS,
  StyleScoring,
} from "./style";

describe("StyleScoring", () => {
  it("uses modern named events and awards each event once", () => {
    const scoring = new StyleScoring();
    expect(scoring.preset).toBe("modern");
    expect(scoring.award("spin-right-360", "jump-1-spin", 1)).toMatchObject({
      points: MODERN_EVENT_AWARDS["spin-right-360"],
      total: 150,
      type: "spin-right-360",
    });
    expect(scoring.award("spin-right-360", "jump-1-spin", 2)).toBeUndefined();
    expect(scoring.total).toBe(150);
    expect(scoring.drainEvents()).toHaveLength(1);
  });

  it("retains classic source-level score anchors without frame sampling", () => {
    const scoring = new StyleScoring("classic");
    scoring.award("obstacle-clear", "clear", 0);
    scoring.award("mushroom-jump", "mushroom", 1);
    scoring.award("burning-tree-clear", "fire", 2);
    expect(scoring.total).toBe(
      CLASSIC_SCORE_ANCHORS.obstacleClear +
        CLASSIC_SCORE_ANCHORS.mushroomJump +
        CLASSIC_SCORE_ANCHORS.burningTreeClear,
    );
    scoring.award("failed-landing", "fall", 3);
    expect(scoring.total).toBe(
      CLASSIC_SCORE_ANCHORS.obstacleClear +
        CLASSIC_SCORE_ANCHORS.mushroomJump +
        CLASSIC_SCORE_ANCHORS.burningTreeClear +
        CLASSIC_SCORE_ANCHORS.failedLanding,
    );
  });

  it("clamps penalties at zero and reset clears event identity", () => {
    const scoring = new StyleScoring();
    scoring.award("yellow-snow", "yellow", 0);
    expect(scoring.total).toBe(0);
    scoring.award("mushroom-jump", "mushroom", 1);
    expect(scoring.total).toBe(100);
    scoring.reset();
    expect(scoring.total).toBe(0);
    expect(scoring.award("mushroom-jump", "mushroom", 2)).toBeDefined();
  });
});
