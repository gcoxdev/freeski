import type { PlayerHeading, PlayerSnapshot } from "../simulation/player";

export const PLAYER_TARGET_RENDERED_EXTENT = 48;
export const PLAYER_MIN_RENDERED_CONTENT_HEIGHT = 16;

/** Every source pose is normalized by its longest visible dimension. */
export const PLAYER_FRAME_TARGET_EXTENTS = Object.freeze({
  "player/air-neutral": PLAYER_TARGET_RENDERED_EXTENT,
  "player/crash-laying": PLAYER_TARGET_RENDERED_EXTENT,
  "player/heading-downhill": PLAYER_TARGET_RENDERED_EXTENT,
  "player/heading-left-30": PLAYER_TARGET_RENDERED_EXTENT,
  "player/heading-left-60": PLAYER_TARGET_RENDERED_EXTENT,
  "player/heading-left-stop": PLAYER_TARGET_RENDERED_EXTENT,
  "player/heading-right-30": PLAYER_TARGET_RENDERED_EXTENT,
  "player/heading-right-60": PLAYER_TARGET_RENDERED_EXTENT,
  "player/heading-right-stop": PLAYER_TARGET_RENDERED_EXTENT,
  "player/jump-takeoff": PLAYER_TARGET_RENDERED_EXTENT,
  "player/landing-crouch": PLAYER_TARGET_RENDERED_EXTENT,
  "player/rotation-045": PLAYER_TARGET_RENDERED_EXTENT,
  "player/rotation-090": PLAYER_TARGET_RENDERED_EXTENT,
  "player/rotation-135": PLAYER_TARGET_RENDERED_EXTENT,
  "player/rotation-180": PLAYER_TARGET_RENDERED_EXTENT,
  "player/rotation-225": PLAYER_TARGET_RENDERED_EXTENT,
  "player/rotation-270": PLAYER_TARGET_RENDERED_EXTENT,
  "player/rotation-315": PLAYER_TARGET_RENDERED_EXTENT,
  "player/runover-laying": PLAYER_TARGET_RENDERED_EXTENT,
  "player/trick-daffy": PLAYER_TARGET_RENDERED_EXTENT,
  "player/trick-spread": PLAYER_TARGET_RENDERED_EXTENT,
  "player/trick-twist-left": PLAYER_TARGET_RENDERED_EXTENT,
  "player/trick-twist-right": PLAYER_TARGET_RENDERED_EXTENT,
  "player/tuck": PLAYER_TARGET_RENDERED_EXTENT,
} as const);

export type ProductionPlayerFrame = keyof typeof PLAYER_FRAME_TARGET_EXTENTS;

const GROUNDED_FRAME_FOR_HEADING: Readonly<
  Record<PlayerHeading, ProductionPlayerFrame>
> = Object.freeze({
  downhill: "player/heading-downhill",
  "left-30": "player/heading-left-30",
  "left-60": "player/heading-left-60",
  "left-stop": "player/heading-left-stop",
  "right-30": "player/heading-right-30",
  "right-60": "player/heading-right-60",
  "right-stop": "player/heading-right-stop",
});

const TRICK_FRAME = Object.freeze({
  daffy: "player/trick-daffy",
  none: "player/air-neutral",
  spread: "player/trick-spread",
  "twist-left": "player/trick-twist-left",
  "twist-right": "player/trick-twist-right",
} as const satisfies Record<
  PlayerSnapshot["trickPose"],
  ProductionPlayerFrame
>);

type PlayerPose = Pick<
  PlayerSnapshot,
  | "airHeight"
  | "airPitch"
  | "crashKind"
  | "heading"
  | "motion"
  | "trickPose"
  | "tucking"
>;

function rotationFrame(rotation: number): ProductionPlayerFrame {
  const phase = ((rotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const step = Math.round(phase / (Math.PI / 4));
  if (step <= 0 || step >= 8) return "player/air-neutral";
  const degrees = String(step * 45).padStart(3, "0");
  return `player/rotation-${degrees}` as ProductionPlayerFrame;
}

/** Direct state-to-art contract; no compensating flips or mislabeled cells. */
export function playerAtlasFrame(
  player: Readonly<PlayerPose>,
): ProductionPlayerFrame {
  if (player.motion === "crashed")
    return player.crashKind === "runover"
      ? "player/runover-laying"
      : "player/crash-laying";
  if (player.motion === "recovering") return "player/landing-crouch";
  if (player.motion === "airborne") {
    if (player.trickPose !== "none") return TRICK_FRAME[player.trickPose];
    if (Math.abs(player.airPitch) >= 0.2) return rotationFrame(player.airPitch);
    return player.airHeight < 0.45
      ? "player/jump-takeoff"
      : "player/air-neutral";
  }
  if (player.tucking) return "player/tuck";
  return GROUNDED_FRAME_FOR_HEADING[player.heading];
}

export interface PlayerPresentationScale {
  readonly knownFrame: boolean;
  readonly targetContentExtent: number;
  readonly targetContentHeight: number;
  readonly uniformScale: number;
}

/** Plant the visible bottom of every trimmed grounded pose on one ski line. */
export function playerGroundAnchorOffset(
  sourceHeight: number,
  trimY: number,
  trimmedContentHeight: number,
  uniformScale: number,
  originY = 0.94,
): number {
  if (
    ![sourceHeight, trimY, trimmedContentHeight, uniformScale].every(
      Number.isFinite,
    ) ||
    sourceHeight <= 0 ||
    trimmedContentHeight <= 0 ||
    uniformScale <= 0
  )
    return 0;
  return (sourceHeight * originY - trimY - trimmedContentHeight) * uniformScale;
}

/** Preserve source proportions while normalizing every pose to one body extent. */
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
