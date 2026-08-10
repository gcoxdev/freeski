import { createSeededRandom, hashSeed, type SeededRandom } from "../world/seed";

export const LIVING_SLOPE_TUNING = Object.freeze({
  actorCullDistanceMeters: 150,
  beginnerFallIntervalSeconds: 3.2,
  chairDropChancePerFixedStep: 1 / 4_096,
  chairLoopBottomY: 1_472,
  chairLoopLengthMeters: 1_536,
  chairLoopTopY: -64,
  chairSpeedMetersPerSecond: 2,
  dogContactRadiusMeters: 1.35,
  maximumActors: 22,
  snowboarderFootprintRadiusMeters: 0.75,
  snowboarderEntryDistanceMeters: 46,
  walkingTreeWakeRadiusMeters: 14,
});

export type LivingActorKind =
  "beginner" | "chairlift" | "dog" | "snowboarder" | "walking-tree";

export type LivingActorState =
  | "carve-left"
  | "carve-right"
  | "cruising"
  | "empty"
  | "entering"
  | "fallen-backward"
  | "fallen-forward"
  | "idle"
  | "jumping"
  | "knocked"
  | "occupied"
  | "recovering"
  | "running-left"
  | "running-right"
  | "tumbling-1"
  | "tumbling-2"
  | "tumbling-3"
  | "tumbling-4"
  | "walking-left"
  | "walking-right"
  | "wobble";

export type LivingActorEventType =
  | "beginner-fell"
  | "beginner-recovered"
  | "chair-looped"
  | "chair-rider-dropped"
  | "dog-hit"
  | "dog-recovered"
  | "snowboarder-entered"
  | "snowboarder-jumped"
  | "snowboarder-landed"
  | "snowboarder-tumbled"
  | "walking-tree-moved"
  | "walking-tree-woke";

export interface LivingActorSnapshot {
  readonly active: boolean;
  readonly direction: -1 | 0 | 1;
  readonly id: string;
  readonly kind: LivingActorKind;
  readonly riderCount: 0 | 1 | 2;
  readonly source: "chairlift" | "mountain" | "top-entry";
  readonly state: LivingActorState;
  readonly stateSeconds: number;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly worldX: number;
  readonly worldY: number;
}

export interface LivingActorEvent {
  readonly actorId: string;
  readonly atSeconds: number;
  readonly id: string;
  readonly terrainObjectId: string | null;
  readonly type: LivingActorEventType;
  readonly worldX: number;
  readonly worldY: number;
}

export interface LivingSlopeSnapshot {
  readonly actorCount: number;
  readonly actors: readonly LivingActorSnapshot[];
  readonly bounded: boolean;
  readonly lastEvent: LivingActorEventType | "none";
  readonly simulationSeconds: number;
  readonly workUnitsLastStep: number;
}

export interface LivingSlopePlayer {
  readonly simulationSeconds: number;
  readonly worldX: number;
  readonly worldY: number;
}

export interface LivingSlopeRamp {
  readonly footprintRadius: number;
  readonly id: string;
  readonly worldX: number;
  readonly worldY: number;
}

interface MutableActor {
  active: boolean;
  direction: -1 | 0 | 1;
  id: string;
  kind: LivingActorKind;
  lastRampId: string | null;
  riderCount: 0 | 1 | 2;
  source: "chairlift" | "mountain" | "top-entry";
  state: LivingActorState;
  stateSeconds: number;
  velocityX: number;
  velocityY: number;
  worldX: number;
  worldY: number;
}

function actor(
  value: Omit<
    MutableActor,
    "lastRampId" | "stateSeconds" | "velocityX" | "velocityY"
  > &
    Partial<Pick<MutableActor, "stateSeconds" | "velocityX" | "velocityY">>,
): MutableActor {
  return {
    lastRampId: null,
    stateSeconds: 0,
    velocityX: 0,
    velocityY: 0,
    ...value,
  };
}

function distanceToSegment(
  pointX: number,
  pointY: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): number {
  const segmentX = endX - startX;
  const segmentY = endY - startY;
  const lengthSquared = segmentX * segmentX + segmentY * segmentY;
  const ratio =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((pointX - startX) * segmentX + (pointY - startY) * segmentY) /
              lengthSquared,
          ),
        );
  return Math.hypot(
    pointX - (startX + segmentX * ratio),
    pointY - (startY + segmentY * ratio),
  );
}

function wrapChairY(worldY: number): number {
  const { chairLoopLengthMeters, chairLoopTopY } = LIVING_SLOPE_TUNING;
  return (
    ((((worldY - chairLoopTopY) % chairLoopLengthMeters) +
      chairLoopLengthMeters) %
      chairLoopLengthMeters) +
    chairLoopTopY
  );
}

function initialActors(seed: string): MutableActor[] {
  const random = createSeededRandom(hashSeed(`living-slope:${seed}`));
  const chairs: MutableActor[] = [];
  for (const direction of [-1, 1] as const) {
    for (let index = 0; index < 8; index += 1) {
      const occupied = random.next() < 0.58;
      chairs.push(
        actor({
          active: true,
          direction,
          id: `chair-${direction < 0 ? "up" : "down"}-${index}`,
          kind: "chairlift",
          riderCount: occupied ? ((random.next() < 0.3 ? 2 : 1) as 1 | 2) : 0,
          source: "mountain",
          state: occupied ? "occupied" : "empty",
          worldX: direction < 0 ? -7 : -9,
          worldY: -64 + index * 192 + (direction > 0 ? 96 : 0),
        }),
      );
    }
  }
  return [
    actor({
      active: true,
      direction: 1,
      id: "beginner-0",
      kind: "beginner",
      riderCount: 0,
      source: "mountain",
      state: "cruising",
      velocityY: 4.2,
      worldX: -18,
      worldY: 14,
    }),
    actor({
      active: true,
      direction: -1,
      id: "snowboarder-top",
      kind: "snowboarder",
      riderCount: 0,
      source: "top-entry",
      state: "entering",
      velocityY: 12.5,
      worldX: 14,
      worldY: -38,
    }),
    actor({
      active: false,
      direction: 1,
      id: "snowboarder-chair-drop",
      kind: "snowboarder",
      riderCount: 0,
      source: "chairlift",
      state: "jumping",
      worldX: -9,
      worldY: -64,
    }),
    actor({
      active: true,
      direction: -1,
      id: "dog-0",
      kind: "dog",
      riderCount: 0,
      source: "mountain",
      state: "running-left",
      velocityX: -4.8,
      velocityY: 1.2,
      worldX: 12,
      worldY: 25,
    }),
    actor({
      active: true,
      direction: 1,
      id: "walking-tree-0",
      kind: "walking-tree",
      riderCount: 0,
      source: "mountain",
      state: "idle",
      worldX: 22,
      worldY: 21,
    }),
    ...chairs,
  ];
}

/** Deterministic, engine-independent moving population with a fixed actor pool. */
export class LivingSlopeSimulation {
  private actors: MutableActor[];
  private readonly events: LivingActorEvent[] = [];
  private eventSequence = 0;
  private forcedChairDrop = false;
  private lastEvent: LivingActorEventType | "none" = "none";
  private readonly random: SeededRandom;
  private simulationSeconds = 0;
  private workUnitsLastStep = 0;

  constructor(seed: string, random?: SeededRandom) {
    this.actors = initialActors(seed);
    this.random =
      random ?? createSeededRandom(hashSeed(`living-events:${seed}`));
  }

  getSnapshot(): LivingSlopeSnapshot {
    const actors = this.actors.map((value) =>
      Object.freeze({
        active: value.active,
        direction: value.direction,
        id: value.id,
        kind: value.kind,
        riderCount: value.riderCount,
        source: value.source,
        state: value.state,
        stateSeconds: value.stateSeconds,
        velocityX: value.velocityX,
        velocityY: value.velocityY,
        worldX: value.worldX,
        worldY: value.worldY,
      }),
    );
    return Object.freeze({
      actorCount: actors.length,
      actors: Object.freeze(actors),
      bounded: actors.length <= LIVING_SLOPE_TUNING.maximumActors,
      lastEvent: this.lastEvent,
      simulationSeconds: this.simulationSeconds,
      workUnitsLastStep: this.workUnitsLastStep,
    });
  }

  drainEvents(): LivingActorEvent[] {
    return this.events.splice(0);
  }

  reset(seed = "reset"): void {
    this.actors = initialActors(seed);
    this.events.length = 0;
    this.eventSequence = 0;
    this.forcedChairDrop = false;
    this.lastEvent = "none";
    this.simulationSeconds = 0;
    this.workUnitsLastStep = 0;
  }

  repositionActor(id: string, worldX: number, worldY: number): boolean {
    if (![worldX, worldY].every(Number.isFinite)) return false;
    const target = this.actors.find((candidate) => candidate.id === id);
    if (!target) return false;
    target.worldX = worldX;
    target.worldY = worldY;
    target.active = true;
    return true;
  }

  requestChairDrop(): void {
    this.forcedChairDrop = true;
  }

  step(
    player: Readonly<LivingSlopePlayer>,
    deltaSeconds: number,
    ramps: readonly LivingSlopeRamp[] = [],
  ): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0)
      throw new RangeError("deltaSeconds must be finite and positive");
    this.simulationSeconds = player.simulationSeconds;
    this.workUnitsLastStep = 0;
    for (const value of this.actors) {
      this.workUnitsLastStep += 1;
      if (!value.active) continue;
      value.stateSeconds += deltaSeconds;
      if (value.kind === "beginner")
        this.stepBeginner(value, player, deltaSeconds);
      else if (value.kind === "snowboarder")
        this.stepSnowboarder(value, player, ramps, deltaSeconds);
      else if (value.kind === "dog") this.stepDog(value, player, deltaSeconds);
      else if (value.kind === "walking-tree")
        this.stepWalkingTree(value, player, deltaSeconds);
      else this.stepChair(value, deltaSeconds);
    }
  }

  private stepBeginner(
    value: MutableActor,
    player: Readonly<LivingSlopePlayer>,
    deltaSeconds: number,
  ): void {
    if (value.state === "cruising") {
      value.velocityY = 4.2;
      if (value.stateSeconds >= 1.05) this.changeState(value, "wobble");
    } else if (value.state === "wobble") {
      value.velocityX = Math.sin(value.stateSeconds * 16) * 2.2;
      if (value.stateSeconds >= 0.55) {
        const state =
          value.direction > 0 ? "fallen-forward" : "fallen-backward";
        value.direction = value.direction > 0 ? -1 : 1;
        this.changeState(value, state);
        this.emit("beginner-fell", value);
      }
    } else if (
      value.state === "fallen-forward" ||
      value.state === "fallen-backward"
    ) {
      value.velocityX = 0;
      value.velocityY = 0;
      if (value.stateSeconds >= 0.72) this.changeState(value, "recovering");
    } else if (value.state === "recovering") {
      if (value.stateSeconds >= 0.58) {
        this.changeState(value, "cruising");
        this.emit("beginner-recovered", value);
      }
    }
    value.worldX += value.velocityX * deltaSeconds;
    value.worldY += value.velocityY * deltaSeconds;
    if (
      value.worldY < player.worldY - 90 ||
      value.worldY > player.worldY + 90
    ) {
      value.worldX = player.worldX - 17;
      value.worldY = player.worldY - 44;
    }
  }

  private stepSnowboarder(
    value: MutableActor,
    player: Readonly<LivingSlopePlayer>,
    ramps: readonly LivingSlopeRamp[],
    deltaSeconds: number,
  ): void {
    const previousX = value.worldX;
    const previousY = value.worldY;
    if (
      value.lastRampId &&
      !ramps.some(
        (ramp) =>
          ramp.id === value.lastRampId &&
          Math.hypot(value.worldX - ramp.worldX, value.worldY - ramp.worldY) <=
            ramp.footprintRadius + 5,
      )
    )
      value.lastRampId = null;
    if (value.state === "entering") {
      value.velocityY = 13.5;
      if (value.stateSeconds >= 0.45) {
        this.changeState(
          value,
          value.direction < 0 ? "carve-left" : "carve-right",
        );
        this.emit("snowboarder-entered", value);
      }
    } else if (value.state === "carve-left" || value.state === "carve-right") {
      value.velocityX = value.state === "carve-left" ? -5.5 : 5.5;
      value.velocityY = 15.5;
      if (value.stateSeconds >= 0.72) {
        value.direction = value.state === "carve-left" ? 1 : -1;
        this.changeState(
          value,
          value.direction < 0 ? "carve-left" : "carve-right",
        );
      }
    } else if (value.state === "jumping") {
      value.velocityX *= 0.98;
      value.velocityY = 16.8;
      if (value.stateSeconds >= 0.62) {
        this.changeState(value, "tumbling-1");
        this.emit("snowboarder-tumbled", value);
      }
    } else if (value.state.startsWith("tumbling-")) {
      value.velocityY = 7.5;
      const phase = Number(value.state.at(-1));
      if (value.stateSeconds >= 0.16) {
        if (phase < 4)
          this.changeState(value, `tumbling-${phase + 1}` as LivingActorState);
        else {
          this.changeState(value, "recovering");
          this.emit("snowboarder-landed", value);
        }
      }
    } else if (value.state === "recovering") {
      value.velocityX = 0;
      value.velocityY = 5;
      if (value.stateSeconds >= 0.5)
        this.changeState(
          value,
          value.direction < 0 ? "carve-left" : "carve-right",
        );
    }
    value.worldX += value.velocityX * deltaSeconds;
    value.worldY += value.velocityY * deltaSeconds;
    if (value.state === "carve-left" || value.state === "carve-right") {
      const ramp = ramps
        .filter((candidate) => candidate.id !== value.lastRampId)
        .map((candidate) => ({
          candidate,
          distance: distanceToSegment(
            candidate.worldX,
            candidate.worldY,
            previousX,
            previousY,
            value.worldX,
            value.worldY,
          ),
        }))
        .filter(
          ({ candidate, distance }) =>
            distance <=
            candidate.footprintRadius +
              LIVING_SLOPE_TUNING.snowboarderFootprintRadiusMeters,
        )
        .sort(
          (left, right) =>
            left.distance - right.distance ||
            left.candidate.id.localeCompare(right.candidate.id),
        )[0]?.candidate;
      if (ramp) {
        value.lastRampId = ramp.id;
        this.changeState(value, "jumping");
        this.emit("snowboarder-jumped", value, ramp.id);
      }
    }
    if (
      value.source === "top-entry" &&
      (value.worldY > player.worldY + 90 ||
        Math.abs(value.worldX - player.worldX) >
          LIVING_SLOPE_TUNING.actorCullDistanceMeters)
    ) {
      value.worldX = player.worldX + (value.direction < 0 ? 16 : -16);
      value.worldY =
        player.worldY - LIVING_SLOPE_TUNING.snowboarderEntryDistanceMeters;
      this.changeState(value, "entering");
    }
    if (value.source === "chairlift" && value.worldY > player.worldY + 100)
      value.active = false;
  }

  private stepDog(
    value: MutableActor,
    player: Readonly<LivingSlopePlayer>,
    deltaSeconds: number,
  ): void {
    if (value.state === "running-left" || value.state === "running-right") {
      value.velocityX = value.state === "running-left" ? -4.8 : 4.8;
      value.velocityY = 1.2;
      const contact = Math.hypot(
        value.worldX - player.worldX,
        value.worldY - player.worldY,
      );
      if (contact <= LIVING_SLOPE_TUNING.dogContactRadiusMeters) {
        value.velocityX = 0;
        value.velocityY = 0;
        this.changeState(value, "knocked");
        this.emit("dog-hit", value);
      } else if (Math.abs(value.worldX - player.worldX) > 28) {
        this.changeState(
          value,
          value.worldX > player.worldX ? "running-left" : "running-right",
        );
      }
    } else if (value.state === "knocked") {
      if (value.stateSeconds >= 0.65) this.changeState(value, "recovering");
    } else if (value.state === "recovering" && value.stateSeconds >= 0.72) {
      this.changeState(
        value,
        value.direction < 0 ? "running-left" : "running-right",
      );
      value.direction = value.direction < 0 ? 1 : -1;
      this.emit("dog-recovered", value);
    }
    value.worldX += value.velocityX * deltaSeconds;
    value.worldY += value.velocityY * deltaSeconds;
    if (Math.abs(value.worldY - player.worldY) > 90) {
      value.worldX = player.worldX + 11;
      value.worldY = player.worldY + 18;
    }
  }

  private stepWalkingTree(
    value: MutableActor,
    player: Readonly<LivingSlopePlayer>,
    deltaSeconds: number,
  ): void {
    if (value.state === "idle") {
      const distance = Math.hypot(
        value.worldX - player.worldX,
        value.worldY - player.worldY,
      );
      if (
        value.stateSeconds >= 0 &&
        distance <= LIVING_SLOPE_TUNING.walkingTreeWakeRadiusMeters
      ) {
        this.changeState(
          value,
          value.direction < 0 ? "walking-left" : "walking-right",
        );
        this.emit("walking-tree-woke", value);
      }
    } else if (
      value.state === "walking-left" ||
      value.state === "walking-right"
    ) {
      value.velocityX = value.state === "walking-left" ? -2.2 : 2.2;
      value.worldX += value.velocityX * deltaSeconds;
      if (value.stateSeconds >= 2.4) {
        value.direction = value.direction < 0 ? 1 : -1;
        value.velocityX = 0;
        this.changeState(value, "idle");
        value.stateSeconds = -1.2;
        this.emit("walking-tree-moved", value);
      }
    }
    if (Math.abs(value.worldY - player.worldY) > 90) {
      value.worldX = player.worldX + 18;
      value.worldY = player.worldY + 24;
      this.changeState(value, "idle");
    }
  }

  private stepChair(value: MutableActor, deltaSeconds: number): void {
    const before = value.worldY;
    value.velocityY =
      value.direction * LIVING_SLOPE_TUNING.chairSpeedMetersPerSecond;
    value.worldY = wrapChairY(value.worldY + value.velocityY * deltaSeconds);
    if (
      (value.direction > 0 && value.worldY < before) ||
      (value.direction < 0 && value.worldY > before)
    )
      this.emit("chair-looped", value);

    if (value.direction < 0 || value.riderCount === 0) return;
    if (
      this.forcedChairDrop ||
      this.random.next() < LIVING_SLOPE_TUNING.chairDropChancePerFixedStep
    ) {
      this.forcedChairDrop = false;
      const dropped = this.actors.find(
        (candidate) => candidate.id === "snowboarder-chair-drop",
      )!;
      dropped.active = true;
      dropped.worldX = value.worldX;
      dropped.worldY = value.worldY + 1.5;
      dropped.velocityX = 3.5;
      dropped.velocityY = 12;
      dropped.direction = 1;
      this.changeState(dropped, "jumping");
      value.riderCount = value.riderCount === 2 ? 1 : 0;
      value.state = value.riderCount > 0 ? "occupied" : "empty";
      this.emit("chair-rider-dropped", value);
    }
  }

  private changeState(value: MutableActor, state: LivingActorState): void {
    if (value.state === state) return;
    value.state = state;
    value.stateSeconds = 0;
  }

  private emit(
    type: LivingActorEventType,
    value: MutableActor,
    terrainObjectId: string | null = null,
  ): void {
    this.lastEvent = type;
    this.events.push(
      Object.freeze({
        actorId: value.id,
        atSeconds: this.simulationSeconds,
        id: `living-${this.eventSequence++}`,
        terrainObjectId,
        type,
        worldX: value.worldX,
        worldY: value.worldY,
      }),
    );
  }
}
