export const PLAYER_MIN_RENDERED_CONTENT_HEIGHT = 48;

const GROUNDED_CONTENT_HEIGHT = 56;
const AIRBORNE_CONTENT_HEIGHT = 54;
const IMPACT_CONTENT_HEIGHT = 52;

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
  "player/tuck": GROUNDED_CONTENT_HEIGHT,
  "player/uphill-left": GROUNDED_CONTENT_HEIGHT,
  "player/uphill-right": GROUNDED_CONTENT_HEIGHT,
  "player/wipeout": IMPACT_CONTENT_HEIGHT,
} as const);

export type ProductionPlayerFrame = keyof typeof PLAYER_FRAME_CONTENT_HEIGHTS;

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
