import type { PlayerSnapshot } from "../simulation/player";
import type { ModeSnapshot } from "../simulation/modes";

export function runMetrics(
  player: Pick<PlayerSnapshot, "simulationSeconds">,
  style: number,
  modes: ModeSnapshot,
) {
  const active = modes.activeMode ? modes.courses[modes.activeMode] : null;
  const racing = active && active.id !== "free-style";
  return {
    time: active
      ? active.elapsedSeconds + (racing ? active.penaltySeconds : 0)
      : player.simulationSeconds,
    timeCaption: racing ? "RACE" : "TIME",
    style: racing
      ? `+${active.penaltySeconds}`
      : String(active?.styleEarned ?? style),
    styleCaption: racing ? "PENALTY S" : active ? "SCORE" : "STYLE",
  };
}

/** Existing HUD slots change meaning during a course; no extra overlay. */
export function updateRunMetrics(
  player: PlayerSnapshot,
  style: number,
  modes: ModeSnapshot,
): void {
  const metrics = runMetrics(player, style, modes);
  for (const [id, value] of Object.entries({
    "speed-label": String(Math.round(player.speedMetersPerSecond * 3.6)),
    "distance-label": String(Math.floor(player.worldY)),
    "time-label": metrics.time.toFixed(1),
    "time-caption": metrics.timeCaption,
    "style-label": metrics.style,
    "style-caption": metrics.styleCaption,
  })) {
    const element = document.getElementById(id);
    if (element && element.textContent !== value) element.textContent = value;
  }
  document
    .getElementById("game-shell")
    ?.setAttribute("data-active-mode", modes.activeMode ?? "none");
}
