import { describe, expect, it } from "vitest";
import {
  INTERACTION_CATALOG,
  interactionFor,
  type InteractionObjectKind,
} from "./interactionCatalog";

const EXPECTED_KINDS: readonly InteractionObjectKind[] = [
  "beginner",
  "bump-large",
  "bump-small",
  "chairlift",
  "dog",
  "lift-tower",
  "mogul",
  "ramp",
  "rock",
  "stump",
  "tree",
  "walking-tree",
];

describe("interaction catalog", () => {
  it("gives every generated and lift object immutable gameplay geometry", () => {
    expect(Object.keys(INTERACTION_CATALOG).sort()).toEqual(
      [...EXPECTED_KINDS].sort(),
    );
    for (const kind of EXPECTED_KINDS) {
      const metadata = interactionFor(kind);
      expect(Object.isFrozen(metadata)).toBe(true);
      expect(Object.isFrozen(metadata.footprint)).toBe(true);
      expect(Object.isFrozen(metadata.spriteBounds)).toBe(true);
      expect(metadata.footprint).toMatchObject({ shape: "circle" });
      expect(metadata.footprint.radius).toBeGreaterThan(0);
      expect(metadata.clearanceHeight).toBeGreaterThanOrEqual(0);
      expect(metadata.spriteBounds.width).toBeGreaterThan(0);
      expect(metadata.spriteBounds.height).toBeGreaterThan(0);
    }
  });

  it("keeps footprints and clearances independent from sprite bounds", () => {
    const tree = interactionFor("tree");
    expect(tree.footprint.radius).not.toBe(tree.spriteBounds.width / 2);
    expect(tree.footprint.radius).not.toBe(tree.spriteBounds.height / 2);
    expect(tree.clearanceHeight).not.toBe(tree.spriteBounds.height);
    expect(interactionFor("lift-tower").blocksGroundedPlayer).toBe(true);
    expect(interactionFor("chairlift").blocksGroundedPlayer).toBe(false);
  });
});
