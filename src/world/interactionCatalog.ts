import type { GeneratedObjectType, InteractionMetadata } from "./types";

export type InteractionObjectKind =
  GeneratedObjectType | "chairlift" | "lift-tower";

function metadata(
  radius: number,
  clearanceHeight: number,
  blocksGroundedPlayer: boolean,
  spriteWidth: number,
  spriteHeight: number,
  pivotY = 0.92,
): Readonly<InteractionMetadata> {
  return Object.freeze({
    blocksGroundedPlayer,
    clearanceHeight,
    footprint: Object.freeze({
      offsetX: 0,
      offsetY: 0.15,
      radius,
      shape: "circle" as const,
    }),
    spriteBounds: Object.freeze({
      height: spriteHeight,
      pivotY,
      width: spriteWidth,
    }),
  });
}

/** Gameplay geometry in meters. Sprite bounds are presentation-only evidence. */
export const INTERACTION_CATALOG: Readonly<
  Record<InteractionObjectKind, Readonly<InteractionMetadata>>
> = Object.freeze({
  beginner: metadata(0.75, 1.45, true, 1.8, 2.8),
  "bump-large": metadata(1.5, 0.16, false, 4.2, 1.1, 0.78),
  "bump-small": metadata(0.8, 0.08, false, 2.4, 0.6, 0.78),
  chairlift: metadata(0.7, 3.2, false, 2.8, 2.2, 0.5),
  dog: metadata(0.65, 0.42, false, 1.8, 1.2, 0.84),
  "lift-tower": metadata(1.4, 2.6, true, 4.4, 6.2),
  mogul: metadata(1.1, 0.18, false, 3.8, 1.1, 0.8),
  ramp: metadata(2, 0.2, false, 5.8, 1.8, 0.74),
  rock: metadata(1.35, 0.72, true, 3.6, 2.1, 0.82),
  stump: metadata(1, 0.68, true, 2.4, 1.8, 0.84),
  tree: metadata(2.2, 2.35, true, 5.8, 8.6),
  "walking-tree": metadata(2.2, 2.35, true, 5.8, 8.6),
});

export function interactionFor(
  kind: InteractionObjectKind,
): Readonly<InteractionMetadata> {
  return INTERACTION_CATALOG[kind];
}
