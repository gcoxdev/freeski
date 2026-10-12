import type { PlayerEvent, PlayerSnapshot } from "../../simulation/player";
import type { InteractionEvent } from "../../simulation/slopeInteractions";
import type { YetiEvent } from "../../simulation/yeti";
import type { AtlasSpritePool } from "../atlas/AtlasSpritePool";

interface WorldEffect {
  readonly bornAt: number;
  readonly duration: number;
  readonly frame: string;
  readonly id: number;
  readonly size: number;
  readonly worldX: number;
  readonly worldY: number;
}

export interface AlpineVfxSnapshot {
  readonly activeEffects: number;
  readonly activeTracks: number;
  readonly emitted: number;
  readonly maximumEffects: number;
  readonly maximumTracks: number;
  readonly reducedMotion: boolean;
}

type ToScreen = (worldX: number, worldY: number) => readonly [number, number];

/** Emit just behind the ski contact, including across and uphill motion. */
export function snowTrailPosition(
  player: Pick<PlayerSnapshot, "worldX" | "worldY" | "velocityX" | "velocityY">,
): readonly [number, number] {
  const speed = Math.hypot(player.velocityX, player.velocityY);
  const offset = speed > 0 ? 0.65 / speed : 0;
  return [
    player.worldX - player.velocityX * offset,
    player.worldY - player.velocityY * offset,
  ];
}

/** Cosmetic-only deterministic VFX with hard pool bounds. */
export class AlpineVfx {
  static readonly MAX_EFFECTS = 56;
  static readonly MAX_TRACKS = 48;

  private readonly effects: WorldEffect[] = [];
  private readonly tracks: WorldEffect[] = [];
  private sequence = 0;
  private lastPowderAt = -1;
  private lastTrackAt = -1;
  private lastMistAt = -1;
  private reducedMotion = false;

  setReducedMotion(enabled: boolean): void {
    this.reducedMotion = enabled;
    if (enabled) {
      this.effects.splice(0, Math.max(0, this.effects.length - 8));
      this.tracks.splice(0, Math.max(0, this.tracks.length - 24));
    }
  }

  update(player: Readonly<PlayerSnapshot>, foreshadowIntensity: number): void {
    const now = player.simulationSeconds;
    this.expire(now);
    if (
      !player.paused &&
      player.motion === "grounded" &&
      player.speedMetersPerSecond > 4
    ) {
      if (now - this.lastTrackAt >= (this.reducedMotion ? 0.4 : 0.28)) {
        this.lastTrackAt = now;
        const [trailX, trailY] = snowTrailPosition(player);
        this.spawnTrack(trailX, trailY, now);
      }
      if (now - this.lastPowderAt >= (this.reducedMotion ? 0.42 : 0.12)) {
        this.lastPowderAt = now;
        const carving =
          player.heading !== "downhill" && !player.heading.endsWith("stop");
        const [trailX, trailY] = snowTrailPosition(player);
        this.spawn(
          carving
            ? player.heading.includes("left")
              ? "vfx/carve-fan-left"
              : "vfx/carve-fan-right"
            : player.speedMetersPerSecond > 17
              ? "vfx/powder-medium"
              : "vfx/powder-tiny",
          trailX,
          trailY,
          now,
          0.48,
          carving ? 32 : 22,
        );
      }
    }
    if (
      !this.reducedMotion &&
      foreshadowIntensity > 0.15 &&
      now - this.lastMistAt >= 0.75
    ) {
      this.lastMistAt = now;
      this.spawn(
        "vfx/breath-mist",
        player.worldX + 1.5,
        player.worldY - 1.4,
        now,
        1.15,
        28 + foreshadowIntensity * 16,
      );
    }
  }

  emitPlayer(
    event: Readonly<PlayerEvent>,
    player: Readonly<PlayerSnapshot>,
  ): void {
    const common = [player.worldX, player.worldY, event.atSeconds] as const;
    if (event.type === "jumped" && !this.reducedMotion)
      this.spawn("vfx/powder-medium", ...common, 0.5, 28);
    else if (event.type === "landed-clean")
      this.spawn("vfx/landing-plume", ...common, 0.75, 48);
    else if (event.type === "crashed") {
      this.spawn("vfx/crash-burst", ...common, 0.9, 64);
      if (!this.reducedMotion)
        this.spawn("vfx/ice-impact", ...common, 0.55, 36);
      this.spawnTrack(
        player.worldX,
        player.worldY,
        event.atSeconds,
        "vfx/crash-decal",
        8,
      );
    }
  }

  emitInteraction(
    event: Readonly<InteractionEvent>,
    worldX: number,
    worldY: number,
  ): void {
    if (event.type === "ramp-launch" && !this.reducedMotion)
      this.spawn("vfx/ramp-glint", worldX, worldY, event.atSeconds, 0.7, 42);
    else if (event.type === "trick-completed" && !this.reducedMotion)
      this.spawn(
        "vfx/trick-sparkle",
        worldX,
        worldY - 1.3,
        event.atSeconds,
        0.9,
        46,
      );
    else if (event.type === "crash" || event.type === "landing-crash")
      this.spawn("vfx/ice-impact", worldX, worldY, event.atSeconds, 0.65, 42);
    else if (event.type === "burning-tree-cleared" && !this.reducedMotion)
      this.spawn(
        "vfx/flame-embers",
        worldX,
        worldY - 0.8,
        event.atSeconds,
        1.15,
        62,
      );
  }

  emitYeti(event: Readonly<YetiEvent>, worldX: number, worldY: number): void {
    if (this.reducedMotion) return;
    if (event.type === "pounced" || event.type === "capture-started")
      this.spawn(
        event.type === "pounced" ? "vfx/crash-burst" : "vfx/speed-streaks",
        worldX,
        worldY,
        event.atSeconds,
        0.8,
        event.type === "pounced" ? 72 : 58,
      );
  }

  draw(
    player: Readonly<PlayerSnapshot>,
    toScreen: ToScreen,
    pool: AtlasSpritePool,
  ): void {
    const now = player.simulationSeconds;
    for (const track of this.tracks) {
      const [x, y] = toScreen(track.worldX, track.worldY);
      const progress = (now - track.bornAt) / track.duration;
      pool.draw(track.frame, x, y, {
        alpha: Math.max(0, 0.5 * (1 - progress)),
        depth: 2,
        displayHeight: track.size,
        originY: 0.5,
      });
    }
    for (const effect of this.effects) {
      const [x, y] = toScreen(effect.worldX, effect.worldY);
      const progress = (now - effect.bornAt) / effect.duration;
      const rise = this.reducedMotion
        ? 0
        : effect.frame === "vfx/flame-embers"
          ? progress * 22
          : progress * 5;
      pool.draw(effect.frame, x, y - rise, {
        alpha: Math.max(0, 1 - progress),
        depth: 32,
        displayHeight: this.reducedMotion
          ? effect.size
          : effect.size * (0.85 + progress * 0.3),
        originY: 0.72,
        rotation: this.reducedMotion ? 0 : Math.sin(effect.id * 2.17) * 0.08,
      });
    }
  }

  getSnapshot(): AlpineVfxSnapshot {
    return Object.freeze({
      activeEffects: this.effects.length,
      activeTracks: this.tracks.length,
      emitted: this.sequence,
      maximumEffects: AlpineVfx.MAX_EFFECTS,
      maximumTracks: AlpineVfx.MAX_TRACKS,
      reducedMotion: this.reducedMotion,
    });
  }

  reset(): void {
    this.effects.length = 0;
    this.tracks.length = 0;
    this.lastPowderAt = -1;
    this.lastTrackAt = -1;
    this.lastMistAt = -1;
  }

  private expire(now: number): void {
    while (
      this.effects[0] &&
      now - this.effects[0].bornAt >= this.effects[0].duration
    )
      this.effects.shift();
    while (
      this.tracks[0] &&
      now - this.tracks[0].bornAt >= this.tracks[0].duration
    )
      this.tracks.shift();
  }

  private spawn(
    frame: string,
    worldX: number,
    worldY: number,
    bornAt: number,
    duration: number,
    size: number,
  ): void {
    if (this.effects.length >= AlpineVfx.MAX_EFFECTS) this.effects.shift();
    this.effects.push({
      bornAt,
      duration,
      frame,
      id: this.sequence++,
      size,
      worldX,
      worldY,
    });
  }

  private spawnTrack(
    worldX: number,
    worldY: number,
    bornAt: number,
    frame = "vfx/tracks-short",
    duration = 4.5,
  ): void {
    if (this.tracks.length >= AlpineVfx.MAX_TRACKS) this.tracks.shift();
    this.tracks.push({
      bornAt,
      duration,
      frame,
      id: this.sequence++,
      size: frame === "vfx/crash-decal" ? 34 : 25,
      worldX,
      worldY,
    });
  }
}
