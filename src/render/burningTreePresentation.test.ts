import { describe, expect, it } from "vitest";
import { burningTreeFrame } from "./burningTreePresentation";

describe("burning tree presentation", () => {
  it("cycles only the three complete terrain flame frames", () => {
    const seen = new Set<string>();
    for (let frame = 0; frame < 12; frame += 1)
      seen.add(burningTreeFrame(frame / 8, "dead-tree"));
    expect([...seen].sort()).toEqual([
      "terrain/burning-tree-a",
      "terrain/burning-tree-b",
      "terrain/burning-tree-c",
    ]);
  });
});
