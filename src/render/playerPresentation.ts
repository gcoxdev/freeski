import type { PlayerHeading, PlayerSnapshot } from "../simulation/player";

export const PLAYER_MIN_RENDERED_CONTENT_HEIGHT = 42;

const GROUNDED_CONTENT_HEIGHT = 44;
const AIRBORNE_CONTENT_HEIGHT = 43;
const IMPACT_CONTENT_HEIGHT = 42;

/**
 * Exhaustive presentation contract for production player atlas frames.
 *
 * Values describe visible, trimmed sprite content rather than the differently
 * sized transparent source canvases stored in the atlas. The narrow range
 * keeps state changes visually steady while retaining a little pose emphasis.
 */
export const PLAYER_FRAME_CONTENT_HEIGHTS = Object.freeze({
  "player/air-neutral": AIRBORNE_CONTENT_HEIGHT,
  "player/back-flip-1": AIRBORNE_CONTENT_HEIGHT,
  "player/back-flip-2": AIRBORNE_CONTENT_HEIGHT,
  "player/back-flip-3": AIRBORNE_CONTENT_HEIGHT,
  "player/carve-left-1": GROUNDED_CONTENT_HEIGHT,
  "player/carve-left-2": GROUNDED_CONTENT_HEIGHT,
  "player/carve-left-3": GROUNDED_CONTENT_HEIGHT,
  "player/carve-right-1": GROUNDED_CONTENT_HEIGHT,
  "player/carve-right-2": GROUNDED_CONTENT_HEIGHT,
  "player/carve-right-3": GROUNDED_CONTENT_HEIGHT,
  "player/downhill": GROUNDED_CONTENT_HEIGHT,
  "player/front-flip-1": AIRBORNE_CONTENT_HEIGHT,
  "player/front-flip-2": AIRBORNE_CONTENT_HEIGHT,
  "player/front-flip-3": AIRBORNE_CONTENT_HEIGHT,
  "player/hockey-stop-left": GROUNDED_CONTENT_HEIGHT,
  "player/hockey-stop-right": GROUNDED_CONTENT_HEIGHT,
  "player/jump-takeoff": AIRBORNE_CONTENT_HEIGHT,
  "player/landing-crouch": IMPACT_CONTENT_HEIGHT,
  "player/spin-left": AIRBORNE_CONTENT_HEIGHT,
  "player/spin-right": AIRBORNE_CONTENT_HEIGHT,
  "player/tuck": AIRBORNE_CONTENT_HEIGHT,
  "player/uphill-left": GROUNDED_CONTENT_HEIGHT,
  "player/uphill-right": GROUNDED_CONTENT_HEIGHT,
  "player/wipeout": IMPACT_CONTENT_HEIGHT,
} as const);

export type ProductionPlayerFrame = keyof typeof PLAYER_FRAME_CONTENT_HEIGHTS;

const GROUNDED_FRAME_FOR_HEADING: Readonly<
  Record<Exclude<PlayerHeading, "brake">, ProductionPlayerFrame>
> = Object.freeze({
  "carve-left-1": "player/carve-left-2",
  "carve-left-2": "player/carve-left-3",
  "carve-left-3": "player/carve-right-3",
  "carve-right-1": "player/carve-left-1",
  "carve-right-2": "player/carve-right-1",
  "carve-right-3": "player/carve-right-2",
  downhill: "player/downhill",
  "traverse-left": "player/carve-right-3",
  "traverse-right": "player/hockey-stop-left",
  tuck: "player/uphill-right",
  "uphill-left": "player/uphill-left",
  "uphill-right": "player/hockey-stop-right",
});

type PlayerPose = Pick<
  PlayerSnapshot,
  "airPitch" | "heading" | "motion" | "velocityX"
>;

/**
 * Maps simulation state to poses that were visually audited in the generated
 * sheet. Several original cell labels did not match their depicted direction,
 * so presentation deliberately does not rely on label text alone.
 */
export function playerAtlasFrame(
  player: Readonly<PlayerPose>,
): ProductionPlayerFrame {
  if (player.motion === "crashed") return "player/wipeout";
  if (player.motion === "recovering") return "player/landing-crouch";
  if (player.motion === "airborne") {
    const pitch = Math.abs(player.airPitch) % (Math.PI * 2);
    if (pitch < Math.PI / 4 || pitch >= (Math.PI * 7) / 4) return "player/tuck";
    const forward = player.airPitch > 0;
    if (pitch < (Math.PI * 3) / 4)
      return forward ? "player/front-flip-2" : "player/back-flip-1";
    if (pitch < (Math.PI * 5) / 4)
      return forward ? "player/front-flip-1" : "player/air-neutral";
    return forward ? "player/back-flip-1" : "player/back-flip-3";
  }
  if (player.heading === "brake")
    return player.velocityX < 0
      ? "player/carve-right-3"
      : "player/hockey-stop-left";
  return GROUNDED_FRAME_FOR_HEADING[player.heading];
}

export interface PlayerPresentationScale {
  readonly knownFrame: boolean;
  readonly targetContentHeight: number;
  readonly uniformScale: number;
}

/**
 * Returns one uniform scale so atlas proportions remain intact. Unknown future
 * player frames fail readable at the conservative impact-state target.
 */
export function playerPresentationScale(
  frameName: string,
  trimmedContentHeight: number,
): PlayerPresentationScale {
  const knownFrame = Object.hasOwn(PLAYER_FRAME_CONTENT_HEIGHTS, frameName);
  const targetContentHeight = knownFrame
    ? PLAYER_FRAME_CONTENT_HEIGHTS[frameName as ProductionPlayerFrame]
    : IMPACT_CONTENT_HEIGHT;
  const safeTrimmedHeight =
    Number.isFinite(trimmedContentHeight) && trimmedContentHeight > 0
      ? trimmedContentHeight
      : 1;
  return {
    knownFrame,
    targetContentHeight,
    uniformScale: targetContentHeight / safeTrimmedHeight,
  };
}
