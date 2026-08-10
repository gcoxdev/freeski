import { describe, expect, it } from "vitest";
import {
  interactionFor,
  type InteractionObjectKind,
} from "../world/interactionCatalog";
import type { InteractionMetadata } from "../world/types";
import {
  NEUTRAL_PLAYER_INPUT,
  PlayerSimulation,
  type PlayerInputFrame,
} from "./player";
import {
  SlopeInteractionSimulation,
  type InteractiveWorldObject,
} from "./slopeInteractions";

const STEP = 1 / 60;

function stepPlayer(
  player: PlayerSimulation,
  seconds: number,
  input: Partial<PlayerInputFrame> = {},
  interactions?: SlopeInteractionSimulation,
  objects: readonly InteractiveWorldObject[] = [],
): void {
  const frame = { ...NEUTRAL_PLAYER_INPUT, ...input };
  for (let index = 0; index < Math.round(seconds / STEP); index += 1) {
    player.step(frame, STEP);
    interactions?.step(player, frame, objects, STEP);
  }
}

function atPlayer(
  player: PlayerSimulation,
  type: InteractionObjectKind,
  id: string = type,
  overrides: Partial<InteractiveWorldObject> = {},
): InteractiveWorldObject {
  const snapshot = player.getSnapshot();
  const metadata = interactionFor(type);
  return {
    id,
    interaction: metadata,
    type,
    x: snapshot.worldX,
    y: snapshot.worldY - metadata.footprint.offsetY,
    ...overrides,
  };
}

function contact(
  interactions: SlopeInteractionSimulation,
  player: PlayerSimulation,
  object: InteractiveWorldObject,
): void {
  interactions.step(player, NEUTRAL_PLAYER_INPUT, [object], STEP);
}

describe("SlopeInteractionSimulation terrain outcomes", () => {
  it.each([
    ["bump-small", 3.4],
    ["bump-large", 4.45],
  ] as const)(
    "launches a deterministic hop from %s",
    (type, expectedVelocity) => {
      const player = new PlayerSimulation();
      const interactions = new SlopeInteractionSimulation();
      contact(interactions, player, atPlayer(player, type));
      expect(player.getSnapshot()).toMatchObject({
        jumpCount: 1,
        motion: "airborne",
      });
      expect(interactions.drainEvents().map((event) => event.type)).toContain(
        "bump-hop",
      );
      const launchHeight = expectedVelocity ** 2 / (2 * 10.4);
      stepPlayer(player, expectedVelocity / 10.4, {}, interactions);
      expect(player.getSnapshot().airHeight).toBeCloseTo(launchHeight, 1);
    },
  );

  it("slows a straight mogul entry but lets a diagonal cut retain speed", () => {
    const straight = new PlayerSimulation();
    const straightInteractions = new SlopeInteractionSimulation();
    stepPlayer(straight, 0.8, { tuck: true });
    const straightSpeed = straight.getSnapshot().speedMetersPerSecond;
    contact(straightInteractions, straight, atPlayer(straight, "mogul"));
    expect(straight.getSnapshot().speedMetersPerSecond).toBeCloseTo(
      straightSpeed * 0.52,
      8,
    );
    expect(straightInteractions.drainEvents().at(-1)?.type).toBe("mogul-slow");

    const diagonal = new PlayerSimulation();
    const diagonalInteractions = new SlopeInteractionSimulation();
    stepPlayer(diagonal, 0.8, { steer: 1 });
    const diagonalSpeed = diagonal.getSnapshot().speedMetersPerSecond;
    expect(Math.abs(diagonal.getSnapshot().velocityX)).toBeGreaterThan(4.5);
    contact(diagonalInteractions, diagonal, atPlayer(diagonal, "mogul"));
    expect(diagonal.getSnapshot().speedMetersPerSecond).toBe(diagonalSpeed);
    expect(diagonalInteractions.drainEvents().at(-1)?.type).toBe("mogul-cut");
  });

  it("launches from a ramp and emits paired visual/audio feedback", () => {
    const player = new PlayerSimulation();
    const interactions = new SlopeInteractionSimulation();
    contact(interactions, player, atPlayer(player, "ramp"));
    expect(player.getSnapshot()).toMatchObject({
      jumpCount: 1,
      motion: "airborne",
    });
    expect(interactions.getSnapshot().style).toBe(25);
    expect(interactions.drainEvents().at(-1)?.type).toBe("ramp-launch");
    expect(interactions.drainFeedback()).toMatchObject([
      { cue: "ramp-glint", kind: "visual" },
      { cue: "ramp-launch", kind: "audio" },
    ]);
  });
});

describe("SlopeInteractionSimulation blocking collisions", () => {
  it.each(["rock", "stump", "tree", "lift-tower", "beginner"] as const)(
    "crashes into a grounded %s footprint",
    (type) => {
      const player = new PlayerSimulation();
      const interactions = new SlopeInteractionSimulation();
      contact(interactions, player, atPlayer(player, type));
      expect(player.getSnapshot()).toMatchObject({
        crashCount: 1,
        motion: "crashed",
      });
      expect(interactions.getSnapshot().style).toBe(0);
      expect(interactions.drainEvents().at(-1)?.type).toBe("crash");
    },
  );

  it.each(["rock", "stump", "tree", "lift-tower"] as const)(
    "clears %s above its gameplay clearance",
    (type) => {
      const player = new PlayerSimulation();
      const interactions = new SlopeInteractionSimulation();
      player.launch("test", 8.5);
      while (
        player.getSnapshot().airHeight < interactionFor(type).clearanceHeight
      ) {
        player.step(NEUTRAL_PLAYER_INPUT, STEP);
        interactions.step(player, NEUTRAL_PLAYER_INPUT, [], STEP);
      }
      contact(interactions, player, atPlayer(player, type));
      expect(player.getSnapshot().motion).toBe("airborne");
      expect(interactions.drainEvents().at(-1)?.type).toBe("collision-cleared");
      expect(interactions.getSnapshot().style).toBe(35);
    },
  );

  it("uses only a circular ground footprint, never the full sprite rectangle", () => {
    const player = new PlayerSimulation();
    const interactions = new SlopeInteractionSimulation();
    const tinyFootprintHugeSprite: InteractionMetadata = {
      blocksGroundedPlayer: true,
      clearanceHeight: 0.5,
      footprint: { offsetX: 0, offsetY: 0, radius: 0.1, shape: "circle" },
      spriteBounds: { height: 100, pivotY: 1, width: 100 },
    };
    contact(interactions, player, {
      id: "huge-sprite-far-footprint",
      interaction: tinyFootprintHugeSprite,
      type: "rock",
      x: player.getSnapshot().worldX + 1,
      y: player.getSnapshot().worldY,
    });
    expect(player.getSnapshot().crashCount).toBe(0);
    expect(interactions.getSnapshot()).toMatchObject({
      collisionChecks: 1,
      footprintHits: 0,
    });
  });

  it("rejects chain crashes during recovery and grants 320 ms of grace", () => {
    const player = new PlayerSimulation();
    const interactions = new SlopeInteractionSimulation();
    contact(interactions, player, atPlayer(player, "rock", "rock-a"));
    expect(player.getSnapshot().crashCount).toBe(1);
    stepPlayer(player, 1.2, {}, interactions);
    expect(player.getSnapshot().motion).toBe("grounded");
    expect(player.getSnapshot().recoveryGraceSeconds).toBeGreaterThan(0);
    contact(interactions, player, atPlayer(player, "tree", "tree-b"));
    expect(player.getSnapshot().crashCount).toBe(1);
    expect(interactions.drainEvents().at(-1)?.type).toBe("collision-grace");
    stepPlayer(player, 0.34, {}, interactions);
    contact(interactions, player, atPlayer(player, "rock", "rock-c"));
    expect(player.getSnapshot().crashCount).toBe(2);
  });
});

describe("SlopeInteractionSimulation tricks and secrets", () => {
  it.each([
    ["spin-left-360", { trickSpin: -1 }],
    ["spin-right-360", { trickSpin: 1 }],
    ["back-flip", { trickFlip: -1 }],
    ["front-flip", { trickFlip: 1 }],
  ] as const)(
    "awards named %s once and lands a wrapped rotation",
    (trick, input) => {
      const player = new PlayerSimulation();
      const interactions = new SlopeInteractionSimulation();
      contact(interactions, player, atPlayer(player, "ramp"));
      stepPlayer(player, 1, input, interactions);
      stepPlayer(player, 0.8, {}, interactions);
      expect(player.getSnapshot()).toMatchObject({
        lastLanding: "clean",
        motion: "grounded",
      });
      const styleEvents = interactions.drainStyleEvents();
      expect(styleEvents.filter((event) => event.type === trick)).toHaveLength(
        1,
      );
      expect(styleEvents.map((event) => event.type)).toContain("clean-landing");
    },
  );

  it("records a failed off-axis landing and its named penalty", () => {
    const player = new PlayerSimulation();
    const interactions = new SlopeInteractionSimulation();
    player.launch("test", 5.35);
    stepPlayer(player, 1.3, { steer: 1 }, interactions);
    expect(player.getSnapshot().lastLanding).toBe("crash");
    expect(interactions.drainEvents().map((event) => event.type)).toContain(
      "landing-crash",
    );
    expect(
      interactions.drainStyleEvents().map((event) => event.type),
    ).toContain("failed-landing");
  });

  it("transforms a reverse-hit stump, then consumes its mushroom for +100", () => {
    const player = new PlayerSimulation();
    const interactions = new SlopeInteractionSimulation();
    stepPlayer(player, 1.1, { steer: -1, uphill: true });
    expect(player.getSnapshot().velocityY).toBeLessThan(-0.5);
    const stump = atPlayer(player, "stump", "secret-stump");
    contact(interactions, player, stump);
    expect(interactions.deltas.get(stump.id)).toMatchObject({
      form: "mushroom",
    });
    expect(interactions.drainEvents().at(-1)?.type).toBe("mushroom-created");
    interactions.step(player, NEUTRAL_PLAYER_INPUT, [], STEP);
    contact(interactions, player, atPlayer(player, "stump", stump.id));
    expect(player.getSnapshot().motion).toBe("airborne");
    expect(interactions.deltas.get(stump.id)).toMatchObject({ consumed: true });
    expect(interactions.getSnapshot().style).toBe(100);
    expect(interactions.drainEvents().at(-1)?.type).toBe("mushroom-jumped");
  });

  it("ignites a dead tree low and clears it high for +1000", () => {
    const player = new PlayerSimulation();
    const interactions = new SlopeInteractionSimulation();
    player.launch("test", 8.5);
    stepPlayer(player, 0.04, {}, interactions);
    const tree = atPlayer(player, "tree", "dead-tree", {
      variant: "dead-tree",
    });
    contact(interactions, player, tree);
    expect(interactions.deltas.get(tree.id)).toMatchObject({ burning: true });
    expect(interactions.drainEvents().at(-1)?.type).toBe("dead-tree-ignited");
    interactions.step(player, NEUTRAL_PLAYER_INPUT, [], STEP);
    while (player.getSnapshot().airHeight < tree.interaction.clearanceHeight) {
      player.step(NEUTRAL_PLAYER_INPUT, STEP);
      interactions.step(player, NEUTRAL_PLAYER_INPUT, [], STEP);
    }
    contact(
      interactions,
      player,
      atPlayer(player, "tree", tree.id, { variant: "dead-tree" }),
    );
    expect(interactions.deltas.get(tree.id)).toMatchObject({
      burned: true,
      burning: false,
    });
    expect(interactions.getSnapshot().style).toBe(1_000);
    expect(interactions.drainEvents().at(-1)?.type).toBe(
      "burning-tree-cleared",
    );
  });

  it("knocks a dog down, then applies yellow-snow Style on re-entry", () => {
    const player = new PlayerSimulation();
    const interactions = new SlopeInteractionSimulation();
    const dog = atPlayer(player, "dog", "dog-secret");
    contact(interactions, player, dog);
    expect(interactions.deltas.get(dog.id)).toMatchObject({
      npcState: "knocked",
      yellowSnow: true,
    });
    interactions.step(player, NEUTRAL_PLAYER_INPUT, [], STEP);
    contact(interactions, player, dog);
    expect(interactions.drainEvents().map((event) => event.type)).toEqual([
      "dog-knocked",
      "yellow-snow",
    ]);
    expect(interactions.drainStyleEvents().at(-1)?.points).toBe(-25);
  });

  it("awakens a walking tree and persists its lateral offset", () => {
    const player = new PlayerSimulation();
    const interactions = new SlopeInteractionSimulation();
    const tree = atPlayer(player, "walking-tree", "walking-secret");
    contact(interactions, player, tree);
    expect(interactions.deltas.get(tree.id)).toMatchObject({
      npcState: "awake",
      offsetX: 0.75,
    });
    expect(interactions.drainEvents().map((event) => event.type)).toContain(
      "walking-tree-awake",
    );
  });
});
