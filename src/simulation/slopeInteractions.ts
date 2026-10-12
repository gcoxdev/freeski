import type {
  PlayerInputFrame,
  PlayerMotion,
  PlayerSimulation,
} from "./player";
import { touchesFootprint } from "./footprintContact";
import {
  StyleScoring,
  type ScorePresetName,
  type StyleEvent,
  type StyleEventType,
} from "./style";
import { ChunkDeltaStore } from "../world/chunkDeltas";
import type { ObjectDelta } from "../world/chunkDeltas";
import type { InteractionObjectKind } from "../world/interactionCatalog";
import type {
  GeneratedObjectVariant,
  InteractionMetadata,
} from "../world/types";

const FULL_ROTATION = Math.PI * 2;
export const RAMP_LAUNCH_VELOCITY = 12.8;

export const PLAYER_COLLISION_FOOTPRINT = Object.freeze({
  radius: 0.65,
  shape: "circle" as const,
});

export interface InteractiveWorldObject {
  readonly id: string;
  readonly interaction: InteractionMetadata;
  /** Optional deterministic airtime interval for explicit staged scenarios. */
  readonly rampLaunchVelocity?: number;
  readonly type: InteractionObjectKind;
  readonly variant?: GeneratedObjectVariant;
  readonly x: number;
  readonly y: number;
}

export type InteractionEventType =
  | "bump-hop"
  | "burning-tree-cleared"
  | "collision-cleared"
  | "collision-grace"
  | "crash"
  | "dead-tree-ignited"
  | "dog-knocked"
  | "landed-clean"
  | "landing-crash"
  | "mogul-cut"
  | "mogul-slow"
  | "mushroom-created"
  | "mushroom-jumped"
  | "ramp-launch"
  | "trick-completed"
  | "walking-tree-awake"
  | "yellow-snow";

export interface InteractionEvent {
  readonly airHeight: number;
  readonly atSeconds: number;
  readonly clearanceHeight: number;
  readonly id: string;
  readonly objectId: string;
  readonly type: InteractionEventType;
}

export interface FeedbackEvent {
  readonly atSeconds: number;
  readonly cue: string;
  readonly id: string;
  readonly kind: "audio" | "visual";
  readonly label: string;
  readonly objectId: string;
}

export interface InteractionSnapshot {
  readonly activeTrick: string;
  readonly collisionChecks: number;
  readonly deltaCount: number;
  readonly footprintHits: number;
  readonly lastEvent: InteractionEventType | "none";
  readonly preset: ScorePresetName;
  readonly style: number;
}

export class SlopeInteractionSimulation {
  readonly deltas: ChunkDeltaStore;
  readonly scoring: StyleScoring;
  private contacts = new Set<string>();
  private readonly events: InteractionEvent[] = [];
  private readonly feedback: FeedbackEvent[] = [];
  private readonly styleEvents: StyleEvent[] = [];
  private previousMotion: PlayerMotion = "grounded";
  private activeJump = 0;
  private awardedSpinRotations = 0;
  private awardedPitchRotations = 0;
  private activeTrickValue = "none";
  private readonly pendingLandedTricks: Array<{
    readonly id: string;
    readonly type: StyleEventType;
  }> = [];
  private collisionChecksValue = 0;
  private footprintHitsValue = 0;
  private eventSequence = 0;
  private currentAtSeconds = 0;

  constructor(
    preset: ScorePresetName = "modern",
    deltas = new ChunkDeltaStore(),
  ) {
    this.scoring = new StyleScoring(preset);
    this.deltas = deltas;
  }

  step(
    player: PlayerSimulation,
    _input: Readonly<PlayerInputFrame>,
    objects: readonly InteractiveWorldObject[],
    deltaSeconds: number,
  ): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0)
      throw new RangeError("deltaSeconds must be finite and positive");
    this.captureAirAndLanding(player);
    const contacts = new Set<string>();
    for (const object of objects) {
      const delta = this.deltas.get(object.id);
      if (delta?.consumed || delta?.destroyed) continue;
      this.collisionChecksValue += 1;
      if (!this.overlaps(player, object, delta)) continue;
      contacts.add(object.id);
      this.footprintHitsValue += 1;
      if (this.contacts.has(object.id)) continue;
      const launched = this.handleContact(player, object, delta);
      if (launched) break;
    }
    this.contacts = contacts;
    this.previousMotion = player.getSnapshot().motion;
  }

  getSnapshot(): InteractionSnapshot {
    return Object.freeze({
      activeTrick: this.activeTrickValue,
      collisionChecks: this.collisionChecksValue,
      deltaCount: Object.keys(this.deltas.snapshot()).length,
      footprintHits: this.footprintHitsValue,
      lastEvent: this.events.at(-1)?.type ?? "none",
      preset: this.scoring.preset,
      style: this.scoring.total,
    });
  }

  drainEvents(): InteractionEvent[] {
    return this.events.splice(0);
  }

  drainFeedback(): FeedbackEvent[] {
    return this.feedback.splice(0);
  }

  drainStyleEvents(): StyleEvent[] {
    return this.styleEvents.splice(0);
  }

  reset(): void {
    this.contacts.clear();
    this.events.length = 0;
    this.feedback.length = 0;
    this.styleEvents.length = 0;
    this.previousMotion = "grounded";
    this.activeJump = 0;
    this.awardedSpinRotations = 0;
    this.awardedPitchRotations = 0;
    this.activeTrickValue = "none";
    this.pendingLandedTricks.length = 0;
    this.collisionChecksValue = 0;
    this.footprintHitsValue = 0;
    this.eventSequence = 0;
    this.scoring.reset();
    this.deltas.clear();
  }

  private overlaps(
    player: PlayerSimulation,
    object: InteractiveWorldObject,
    delta: Readonly<ObjectDelta> | undefined,
  ): boolean {
    const snapshot = player.getSnapshot();
    const footprint = object.interaction.footprint;
    // Airborne crossings do not consume entry; landing on snow still slows.
    if (object.type === "mogul" && snapshot.motion !== "grounded") return false;
    const objectX = object.x + (delta?.offsetX ?? 0) + footprint.offsetX;
    const objectY = object.y + footprint.offsetY;
    return touchesFootprint(
      snapshot.worldX - objectX,
      snapshot.worldY - objectY,
      PLAYER_COLLISION_FOOTPRINT.radius,
      footprint,
    );
  }

  private handleContact(
    player: PlayerSimulation,
    object: InteractiveWorldObject,
    delta: Readonly<ObjectDelta> | undefined,
  ): boolean {
    let snapshot = player.getSnapshot();
    const atSeconds = snapshot.simulationSeconds;
    this.currentAtSeconds = atSeconds;

    if (delta?.form === "mushroom") {
      const launched = player.launch("mushroom", 5.9);
      if (launched || snapshot.motion === "airborne") {
        this.deltas.patch(object.id, { consumed: true });
        this.award("mushroom-jump", `mushroom:${object.id}`, atSeconds);
        this.emit(
          "mushroom-jumped",
          object,
          snapshot.airHeight,
          "MUSHROOM +100",
          "secret-bloom",
          "secret-chime",
        );
      }
      return launched;
    }

    if (object.type === "dog") {
      if (delta?.yellowSnow) {
        this.award("yellow-snow", `yellow:${object.id}`, atSeconds);
        this.emit(
          "yellow-snow",
          object,
          snapshot.airHeight,
          "YELLOW SNOW",
          "yellow-splash",
          "dog-secret",
        );
      } else {
        this.deltas.patch(object.id, {
          npcState: "knocked",
          yellowSnow: true,
        });
        this.emit(
          "dog-knocked",
          object,
          snapshot.airHeight,
          "DOG DOWN",
          "powder-pop",
          "dog-hit",
        );
      }
      return false;
    }

    if (object.type === "bump-small" || object.type === "bump-large") {
      if (snapshot.motion !== "grounded") return false;
      const launched = player.launch(
        object.type,
        object.type === "bump-large" ? 4.45 : 3.4,
      );
      if (launched) {
        this.award(
          "bump-hop",
          `bump:${object.id}:${snapshot.jumpCount + 1}`,
          atSeconds,
        );
        this.emit(
          "bump-hop",
          object,
          0,
          object.type === "bump-large" ? "BIG BUMP" : "BUMP HOP",
          "powder-pop",
          "small-jump",
        );
      }
      return launched;
    }

    if (object.type === "ramp") {
      if (snapshot.motion !== "grounded") return false;
      const launched = player.launch(
        "ramp",
        object.rampLaunchVelocity ?? RAMP_LAUNCH_VELOCITY,
      );
      if (launched) {
        this.award(
          "ramp-takeoff",
          `ramp:${object.id}:${snapshot.jumpCount + 1}`,
          atSeconds,
        );
        this.emit(
          "ramp-launch",
          object,
          0,
          "RAMP LINE",
          "ramp-glint",
          "ramp-launch",
        );
      }
      return launched;
    }

    if (object.type === "mogul") {
      if (snapshot.motion !== "grounded") return false;
      if (Math.abs(snapshot.velocityX) < 4.5 && snapshot.velocityY > 5) {
        player.applySpeedMultiplier(0.52);
        this.emit(
          "mogul-slow",
          object,
          0,
          "MOGUL CHECK",
          "snow-drag",
          "mogul-thump",
        );
      } else {
        this.emit(
          "mogul-cut",
          object,
          0,
          "MOGUL CUT",
          "carve-fan",
          "carve-slice",
        );
      }
      return false;
    }

    if (
      object.type === "tree" &&
      object.variant === "dead-tree" &&
      !delta?.burned
    ) {
      if (
        delta?.burning &&
        snapshot.motion === "airborne" &&
        snapshot.airHeight >= object.interaction.clearanceHeight
      ) {
        this.deltas.patch(object.id, { burned: true, burning: false });
        this.award("burning-tree-clear", `burn-clear:${object.id}`, atSeconds);
        this.emit(
          "burning-tree-cleared",
          object,
          snapshot.airHeight,
          "FIRE LINE +1000",
          "ember-burst",
          "secret-chime",
        );
        return false;
      }
      if (
        !delta?.burning &&
        snapshot.motion === "airborne" &&
        snapshot.airHeight >= 0.18 &&
        snapshot.airHeight < object.interaction.clearanceHeight
      ) {
        this.deltas.patch(object.id, { burning: true });
        this.emit(
          "dead-tree-ignited",
          object,
          snapshot.airHeight,
          "DEAD TREE LIT",
          "flame-start",
          "fire-whoosh",
        );
        return false;
      }
    }

    if (
      snapshot.motion === "airborne" &&
      snapshot.airHeight >= object.interaction.clearanceHeight
    ) {
      if (object.interaction.blocksGroundedPlayer) {
        this.award(
          "obstacle-clear",
          `clear:${object.id}:${snapshot.jumpCount}`,
          atSeconds,
        );
        this.emit(
          "collision-cleared",
          object,
          snapshot.airHeight,
          "CLEAN CLEAR",
          "clear-spark",
          "clear-tone",
        );
      }
      return false;
    }

    if (
      object.type === "stump" &&
      snapshot.motion === "grounded" &&
      snapshot.heading.endsWith("stop")
    ) {
      this.deltas.patch(object.id, { form: "mushroom" });
      this.emit(
        "mushroom-created",
        object,
        0,
        "MUSHROOM FOUND",
        "secret-bloom",
        "secret-chime",
      );
      return false;
    }

    if (object.type === "walking-tree" && delta?.npcState !== "awake") {
      this.deltas.patch(object.id, { npcState: "awake", offsetX: 0.75 });
      this.emit(
        "walking-tree-awake",
        object,
        snapshot.airHeight,
        "TREE WALKING",
        "branch-shake",
        "wood-creak",
      );
    }

    if (!object.interaction.blocksGroundedPlayer) return false;
    snapshot = player.getSnapshot();
    if (player.tryCrash(`${object.type}:${object.id}`)) {
      this.activeTrickValue = "none";
      this.pendingLandedTricks.length = 0;
      this.award(
        "obstacle-crash",
        `crash:${object.id}:${snapshot.crashCount + 1}`,
        atSeconds,
      );
      this.emit(
        "crash",
        object,
        snapshot.airHeight,
        `${object.type.toUpperCase()} CRASH`,
        "impact-burst",
        "obstacle-crash",
      );
    } else {
      this.emit(
        "collision-grace",
        object,
        snapshot.airHeight,
        "RECOVERY GRACE",
        "grace-ring",
        "grace-tick",
      );
    }
    return false;
  }

  private captureAirAndLanding(player: PlayerSimulation): void {
    const snapshot = player.getSnapshot();
    if (snapshot.motion === "airborne") {
      if (snapshot.jumpCount !== this.activeJump) {
        this.activeJump = snapshot.jumpCount;
        this.awardedSpinRotations = 0;
        this.awardedPitchRotations = 0;
        this.pendingLandedTricks.length = 0;
        this.activeTrickValue = "airborne";
      }
      this.captureRotations(
        snapshot.airSpin,
        "spin",
        snapshot.simulationSeconds,
      );
      this.captureRotations(
        snapshot.airPitch,
        "pitch",
        snapshot.simulationSeconds,
      );
    }
    if (this.previousMotion === "airborne" && snapshot.motion === "grounded") {
      for (const trick of this.pendingLandedTricks)
        this.award(trick.type, trick.id, snapshot.simulationSeconds);
      this.pendingLandedTricks.length = 0;
      this.award(
        "clean-landing",
        `landing:${snapshot.jumpCount}`,
        snapshot.simulationSeconds,
      );
      this.emitPlayer(
        "landed-clean",
        snapshot.simulationSeconds,
        snapshot.airHeight,
        "STUCK LANDING",
        "landing-plume",
        "landing-tone",
      );
      this.activeTrickValue = "none";
    } else if (
      this.previousMotion === "airborne" &&
      snapshot.motion === "crashed"
    ) {
      this.pendingLandedTricks.length = 0;
      this.award(
        "failed-landing",
        `failed-landing:${snapshot.jumpCount}`,
        snapshot.simulationSeconds,
      );
      this.emitPlayer(
        "landing-crash",
        snapshot.simulationSeconds,
        0,
        "MISSED LANDING",
        "impact-burst",
        "obstacle-crash",
      );
      this.activeTrickValue = "none";
    }
  }

  private captureRotations(
    angle: number,
    axis: "pitch" | "spin",
    atSeconds: number,
  ): void {
    const completed = Math.floor(Math.abs(angle) / FULL_ROTATION);
    const awarded =
      axis === "spin" ? this.awardedSpinRotations : this.awardedPitchRotations;
    for (let rotation = awarded + 1; rotation <= completed; rotation += 1) {
      const type: StyleEventType =
        axis === "spin"
          ? angle < 0
            ? "spin-left-360"
            : "spin-right-360"
          : angle < 0
            ? "back-flip"
            : "front-flip";
      this.pendingLandedTricks.push({
        id: `trick:${this.activeJump}:${axis}:${rotation}`,
        type,
      });
      this.activeTrickValue = type;
      this.emitPlayer(
        "trick-completed",
        atSeconds,
        0,
        type.replaceAll("-", " ").toUpperCase(),
        "trick-sparkle",
        "trick-tone",
      );
    }
    if (axis === "spin") this.awardedSpinRotations = completed;
    else this.awardedPitchRotations = completed;
  }

  private award(type: StyleEventType, id: string, atSeconds: number): void {
    const event = this.scoring.award(type, id, atSeconds);
    if (event) this.styleEvents.push(event);
  }

  private emit(
    type: InteractionEventType,
    object: InteractiveWorldObject,
    airHeight: number,
    label: string,
    visualCue: string,
    audioCue: string,
  ): void {
    const atSeconds = this.currentAtSeconds;
    const event = Object.freeze({
      airHeight,
      atSeconds,
      clearanceHeight: object.interaction.clearanceHeight,
      id: `interaction-${this.eventSequence++}`,
      objectId: object.id,
      type,
    });
    this.events.push(event);
    this.pushFeedback(atSeconds, object.id, label, visualCue, audioCue);
  }

  private emitPlayer(
    type: InteractionEventType,
    atSeconds: number,
    airHeight: number,
    label: string,
    visualCue: string,
    audioCue: string,
  ): void {
    this.events.push(
      Object.freeze({
        airHeight,
        atSeconds,
        clearanceHeight: 0,
        id: `interaction-${this.eventSequence++}`,
        objectId: "player",
        type,
      }),
    );
    this.pushFeedback(atSeconds, "player", label, visualCue, audioCue);
  }

  private pushFeedback(
    atSeconds: number,
    objectId: string,
    label: string,
    visualCue: string,
    audioCue: string,
  ): void {
    this.feedback.push(
      Object.freeze({
        atSeconds,
        cue: visualCue,
        id: `feedback-${this.eventSequence++}`,
        kind: "visual" as const,
        label,
        objectId,
      }),
      Object.freeze({
        atSeconds,
        cue: audioCue,
        id: `feedback-${this.eventSequence++}`,
        kind: "audio" as const,
        label,
        objectId,
      }),
    );
  }
}
