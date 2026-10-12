import type { YetiControllerSnapshot } from "../simulation/yeti";

export function yetiPresentation(controller: Readonly<YetiControllerSnapshot>) {
  const { state, stateSeconds, velocityX, velocityY } = controller;
  let frame: string;
  let lateral = false;
  if (state === "windup") frame = "yeti/pounce-windup";
  else if (state === "pounce") frame = "yeti/pounce-air";
  else if (state === "grab") frame = "yeti/grab";
  else if (state === "eat" || state === "chew")
    frame =
      Math.floor(stateSeconds * 7) % 2 === 0 ? "yeti/chew-a" : "yeti/chew-b";
  else if (state === "recovery") frame = "yeti/belly-pat";
  else if (Math.hypot(velocityX, velocityY) < 0.1) frame = "yeti/idle-recovery";
  else if (Math.abs(velocityX) > Math.abs(velocityY)) {
    lateral = true;
    const phase = Math.floor(stateSeconds * 10) % 4;
    frame = `yeti/run-side-${["a", "b", "c", "d"][phase]}`;
  } else {
    const phase = Math.floor(stateSeconds * 8) % 2 === 0 ? "a" : "b";
    frame = `yeti/run-${velocityY < 0 ? "away" : "toward"}-${phase}`;
  }
  return {
    frame,
    flipX: lateral && velocityX > 0,
    // The new cycle uses a shared canvas: preserve its body size and natural
    // flight phase rather than stretching each trimmed pose to a fixed height.
    displayHeight: lateral
      ? 106
      : state === "pounce" || state === "grab"
        ? 92
        : 84,
    originY: lateral ? 0.84 : 0.95,
  };
}
