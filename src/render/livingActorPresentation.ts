import type { LivingActorSnapshot } from "../simulation/livingSlope";

export interface LivingActorPresentation {
  readonly displayHeight: number;
  readonly flipX: boolean;
  readonly frame: string;
  readonly originY: number;
  readonly shadowHeight: number;
  readonly shadowWidth: number;
}

function horizontalDirection(actor: Readonly<LivingActorSnapshot>): -1 | 1 {
  if (Math.abs(actor.velocityX) > 0.01) return actor.velocityX < 0 ? -1 : 1;
  return actor.direction < 0 ? -1 : 1;
}

/** Atlas mapping follows actual motion, never a stale intended direction. */
export function livingActorPresentation(
  actor: Readonly<LivingActorSnapshot>,
): LivingActorPresentation {
  if (actor.kind === "chairlift") {
    const frame =
      actor.state === "dropping-skier"
        ? "chairlift/skier-drop"
        : actor.state === "dropping-snowboarder"
          ? "chairlift/snowboarder-drop"
          : actor.riderCount === 0
            ? "chairlift/empty"
            : actor.riderCount === 1
              ? "chairlift/one-skier"
              : "chairlift/two-riders";
    return {
      displayHeight: 58,
      flipX: false,
      frame,
      originY: 0.52,
      shadowHeight: 7,
      shadowWidth: 42,
    };
  }

  if (actor.kind === "beginner") {
    const frame = actor.state.startsWith("fallen")
      ? actor.state.endsWith("forward")
        ? "beginner/fall-forward"
        : "beginner/fall-backward"
      : actor.state === "wobble"
        ? horizontalDirection(actor) < 0
          ? "beginner/carve-left"
          : "beginner/carve-right"
        : "beginner/downhill";
    return {
      displayHeight: actor.state.startsWith("fallen") ? 32 : 47,
      flipX: false,
      frame,
      originY: 0.94,
      shadowHeight: 8,
      shadowWidth: 34,
    };
  }

  if (actor.kind === "snowboarder") {
    const frame =
      actor.state === "jumping"
        ? "snowboarder/jump"
        : actor.state.startsWith("tumbling")
          ? "snowboarder/tumble"
          : actor.state === "carve-left"
            ? "snowboarder/carve-left"
            : actor.state === "carve-right"
              ? "snowboarder/carve-right"
              : "snowboarder/tuck";
    return {
      displayHeight: actor.state === "jumping" ? 53 : 45,
      flipX: false,
      frame,
      originY: 0.94,
      shadowHeight: 8,
      shadowWidth: 35,
    };
  }

  if (actor.kind === "dog") {
    const frame =
      actor.state === "knocked"
        ? "dog/knocked-over"
        : actor.state === "recovering"
          ? "dog/alert"
          : Math.floor(actor.stateSeconds * 7) % 2 === 0
            ? "dog/trot-a"
            : "dog/trot-b";
    return {
      displayHeight: actor.state === "knocked" ? 25 : 31,
      flipX: horizontalDirection(actor) < 0,
      frame,
      originY: 0.88,
      shadowHeight: 7,
      shadowWidth: 27,
    };
  }

  const frame = actor.state.startsWith("walking")
    ? Math.floor(actor.stateSeconds * 5) % 2 === 0
      ? "walking-tree/step-left"
      : "walking-tree/step-right"
    : "walking-tree/idle";
  return {
    displayHeight: 66,
    flipX: horizontalDirection(actor) < 0,
    frame,
    originY: 0.94,
    shadowHeight: 9,
    shadowWidth: 46,
  };
}
