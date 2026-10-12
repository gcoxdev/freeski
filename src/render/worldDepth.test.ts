import { expect, it } from "vitest";
import { worldDepth } from "./worldDepth";
it("places a skier behind downhill trees, ahead of uphill trees, and above cleared obstacles", () => {
  expect(worldDepth(250)).toBeLessThan(worldDepth(270));
  expect(worldDepth(250)).toBeGreaterThan(worldDepth(230));
  expect(worldDepth(250, 2)).toBeGreaterThan(worldDepth(270));
  expect(worldDepth(-10000)).toBeGreaterThan(5);
  expect(worldDepth(10000, 10)).toBeLessThan(32);
});
