import type { GeneratedObjectType, InteractionMetadata } from "./types";
import { MOGUL_FOOTPRINT, MOGUL_PATCH } from "./mogulPatch";

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
  mogul: Object.freeze({
    ...metadata(
      MOGUL_FOOTPRINT.radius,
      0.18,
      false,
      (MOGUL_PATCH.heightMeters * MOGUL_PATCH.sourceWidth) /
        MOGUL_PATCH.sourceHeight,
      MOGUL_PATCH.heightMeters,
      MOGUL_PATCH.originY,
    ),
    footprint: MOGUL_FOOTPRINT,
  }),
  ramp: metadata(3, 0.2, false, 8.2, 5.6, 0.88),
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
