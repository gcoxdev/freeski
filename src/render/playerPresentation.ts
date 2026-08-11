import type { PlayerHeading, PlayerSnapshot } from "../simulation/player";

export const PLAYER_TARGET_RENDERED_EXTENT = 48;
export const PLAYER_MIN_RENDERED_CONTENT_HEIGHT = 24;

/**
 * Exhaustive presentation contract for production player atlas frames.
 *
 * Every pose receives the same maximum visible extent. This keeps horizontal
 * carves and crashes from appearing much larger than the downhill silhouette.
 */
export const PLAYER_FRAME_TARGET_EXTENTS = Object.freeze({
  "player/air-neutral": PLAYER_TARGET_RENDERED_EXTENT,
  "player/back-flip-1": PLAYER_TARGET_RENDERED_EXTENT,
  "player/back-flip-2": PLAYER_TARGET_RENDERED_EXTENT,
  "player/back-flip-3": PLAYER_TARGET_RENDERED_EXTENT,
  "player/carve-left-1": PLAYER_TARGET_RENDERED_EXTENT,
  "player/carve-left-2": PLAYER_TARGET_RENDERED_EXTENT,
  "player/carve-left-3": PLAYER_TARGET_RENDERED_EXTENT,
  "player/carve-right-1": PLAYER_TARGET_RENDERED_EXTENT,
  "player/carve-right-2": PLAYER_TARGET_RENDERED_EXTENT,
  "player/carve-right-3": PLAYER_TARGET_RENDERED_EXTENT,
  "player/downhill": PLAYER_TARGET_RENDERED_EXTENT,
  "player/front-flip-1": PLAYER_TARGET_RENDERED_EXTENT,
  "player/front-flip-2": PLAYER_TARGET_RENDERED_EXTENT,
  "player/front-flip-3": PLAYER_TARGET_RENDERED_EXTENT,
  "player/hockey-stop-left": PLAYER_TARGET_RENDERED_EXTENT,
  "player/hockey-stop-right": PLAYER_TARGET_RENDERED_EXTENT,
  "player/jump-takeoff": PLAYER_TARGET_RENDERED_EXTENT,
  "player/landing-crouch": PLAYER_TARGET_RENDERED_EXTENT,
  "player/spin-left": PLAYER_TARGET_RENDERED_EXTENT,
  "player/spin-right": PLAYER_TARGET_RENDERED_EXTENT,
  "player/tuck": PLAYER_TARGET_RENDERED_EXTENT,
  "player/uphill-left": PLAYER_TARGET_RENDERED_EXTENT,
  "player/uphill-right": PLAYER_TARGET_RENDERED_EXTENT,
  "player/wipeout": PLAYER_TARGET_RENDERED_EXTENT,
} as const);

export type ProductionPlayerFrame = keyof typeof PLAYER_FRAME_TARGET_EXTENTS;

const GROUNDED_FRAME_FOR_HEADING: Readonly<
  Record<Exclude<PlayerHeading, "brake">, ProductionPlayerFrame>
> = Object.freeze({
  "carve-left-1": "player/carve-left-2",
  "carve-left-2": "player/carve-left-3",
  "carve-left-3": "player/carve-right-1",
  "carve-right-1": "player/carve-left-1",
  "carve-right-2": "player/carve-right-2",
  "carve-right-3": "player/hockey-stop-left",
  downhill: "player/downhill",
  "traverse-left": "player/carve-right-3",
  "traverse-right": "player/hockey-stop-right",
  tuck: "player/uphill-right",
  "uphill-left": "player/uphill-left",
  "uphill-right": "player/hockey-stop-right",
});

type PlayerPose = Pick<
  PlayerSnapshot,
  "airHeight" | "airPitch" | "airSpin" | "heading" | "motion" | "velocityX"
>;

function wrappedMagnitude(value: number): number {
  return Math.abs(Math.atan2(Math.sin(value), Math.cos(value)));
}

function rotationFrame(
  prefix: "back-flip" | "front-flip",
  rotation: number,
): ProductionPlayerFrame {
  const phase = (Math.abs(rotation) % (Math.PI * 2)) / (Math.PI * 2);
  const index = (Math.floor(phase * 3) % 3) + 1;
  return `player/${prefix}-${index}` as ProductionPlayerFrame;
}

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
    const pitch = wrappedMagnitude(player.airPitch);
    const spin = wrappedMagnitude(player.airSpin);
    if (pitch < 0.24 && spin < 0.24)
      return player.airHeight < 0.45 ? "player/jump-takeoff" : "player/tuck";
    if (spin >= pitch)
      return player.airSpin < 0 ? "player/spin-left" : "player/spin-right";
    if (Math.abs(pitch - Math.PI) < 0.32) return "player/air-neutral";
    return rotationFrame(
      player.airPitch < 0 ? "back-flip" : "front-flip",
      player.airPitch,
    );
  }
  if (player.heading === "brake")
    return player.velocityX < 0
      ? "player/carve-right-3"
      : "player/hockey-stop-right";
  return GROUNDED_FRAME_FOR_HEADING[player.heading];
}

export interface PlayerPresentationScale {
  readonly knownFrame: boolean;
  readonly targetContentExtent: number;
  readonly targetContentHeight: number;
  readonly uniformScale: number;
}

/**
 * Returns one uniform scale so atlas proportions remain intact. Unknown future
 * player frames fail readable at the conservative impact-state target.
 */
export function playerPresentationScale(
  frameName: string,
  trimmedContentWidth: number,
  trimmedContentHeight: number,
): PlayerPresentationScale {
  const knownFrame = Object.hasOwn(PLAYER_FRAME_TARGET_EXTENTS, frameName);
  const targetContentExtent = PLAYER_TARGET_RENDERED_EXTENT;
  const safeTrimmedWidth =
    Number.isFinite(trimmedContentWidth) && trimmedContentWidth > 0
      ? trimmedContentWidth
      : 1;
  const safeTrimmedHeight =
    Number.isFinite(trimmedContentHeight) && trimmedContentHeight > 0
      ? trimmedContentHeight
      : 1;
  const uniformScale =
    targetContentExtent / Math.max(safeTrimmedWidth, safeTrimmedHeight);
  return {
    knownFrame,
    targetContentExtent,
    targetContentHeight: safeTrimmedHeight * uniformScale,
    uniformScale,
  };
}
