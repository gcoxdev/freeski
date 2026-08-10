import type { WorldBoundary } from "../world/boundaries";
import { WORLD_BOUNDARIES_METERS } from "../world/boundaries";

export const YETI_TUNING = Object.freeze({
  captureRadiusMeters: 1.65,
  chaseAccelerationMetersPerSecondSquared: 24,
  chewSeconds: 0.78,
  eatSeconds: 0.48,
  grabSeconds: 0.34,
  maximumHorizontalSpeed: 15,
  maximumVerticalSpeed: 18,
  pounceSeconds: 0.3,
  repositionDistanceMeters: 86,
  repositionProtectionSeconds: 1.15,
  safeRepositionDistanceMeters: 25,
  turboEvasionSpeedScale: 0.68,
  turboEvasionWindowSeconds: 1.65,
  windupSeconds: 0.36,
  recoverySeconds: 0.62,
});

export type YetiState =
  | "chasing"
  | "chew"
  | "eat"
  | "grab"
  | "inactive"
  | "pounce"
  | "recovery"
  | "windup";

export type YetiEventType =
  | "capture-started"
  | "chewing"
  | "eaten"
  | "grabbed"
  | "pounced"
  | "reset-requested"
  | "turbo-evasion"
  | "yeti-activated"
  | "yeti-repositioned";

export interface YetiPlayerState {
  readonly simulationSeconds: number;
  readonly turbo: boolean;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly worldX: number;
  readonly worldY: number;
}

export interface YetiControllerSnapshot {
  readonly active: boolean;
  readonly boundary: WorldBoundary;
  readonly id: string;
  readonly protectionSeconds: number;
  readonly state: YetiState;
  readonly stateSeconds: number;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly worldX: number;
  readonly worldY: number;
}

export interface ForeshadowSnapshot {
  readonly breathMist: number;
  readonly intensity: number;
  readonly warningLayer: number;
  readonly windStreaks: number;
}

export interface YetiSnapshot {
  readonly activeBoundaries: readonly WorldBoundary[];
  readonly capturePhase: Exclude<YetiState, "chasing" | "inactive"> | "none";
  readonly capturedBy: string | null;
  readonly controllers: readonly YetiControllerSnapshot[];
  readonly foreshadow: ForeshadowSnapshot;
  readonly lastEvent: YetiEventType | "none";
  readonly playerRemoved: boolean;
  readonly resetRequested: boolean;
  readonly turboEvasionSeconds: number;
}

export interface YetiEvent {
  readonly atSeconds: number;
  readonly boundary: WorldBoundary;
  readonly id: string;
  readonly safeDistanceMeters: number;
  readonly type: YetiEventType;
  readonly yetiId: string;
}

interface MutableYetiController {
  active: boolean;
  boundary: WorldBoundary;
  id: string;
  protectionSeconds: number;
  state: YetiState;
  stateSeconds: number;
  velocityX: number;
  velocityY: number;
  worldX: number;
  worldY: number;
}

const BOUNDARIES: readonly WorldBoundary[] = Object.freeze([
  "top",
  "bottom",
  "left",
  "right",
]);

function initialControllers(): MutableYetiController[] {
  return BOUNDARIES.map((boundary) => ({
    active: false,
    boundary,
    id: `yeti-${boundary}`,
    protectionSeconds: 0,
    state: "inactive",
    stateSeconds: 0,
    velocityX: 0,
    velocityY: 0,
    worldX: 0,
    worldY: 0,
  }));
}

function boundaryExceeded(
  boundary: WorldBoundary,
  player: Readonly<YetiPlayerState>,
): boolean {
  if (boundary === "top")
    return player.worldY < WORLD_BOUNDARIES_METERS.topYeti;
  if (boundary === "bottom")
    return player.worldY > WORLD_BOUNDARIES_METERS.bottomYeti;
  if (boundary === "left")
    return player.worldX < WORLD_BOUNDARIES_METERS.leftYeti;
  return player.worldX > WORLD_BOUNDARIES_METERS.rightYeti;
}

function safeOffset(boundary: WorldBoundary): readonly [number, number] {
  const distance = YETI_TUNING.safeRepositionDistanceMeters;
  if (boundary === "top") return [6, distance];
  if (boundary === "bottom") return [-6, -distance];
  if (boundary === "left") return [distance, 6];
  return [-distance, -6];
}

function moveToward(
  current: number,
  target: number,
  maximumDelta: number,
): number {
  if (Math.abs(target - current) <= maximumDelta) return target;
  return current + Math.sign(target - current) * maximumDelta;
}

function freezeController(
  value: MutableYetiController,
): YetiControllerSnapshot {
  return Object.freeze({ ...value });
}

/** Smooth, deterministic 1,800–2,000 m warning ramp with no explicit announcement. */
export function foreshadowIntensity(worldY: number): number {
  if (!Number.isFinite(worldY)) return 0;
  const linear = Math.max(0, Math.min(1, (worldY - 1_800) / 200));
  return linear * linear * (3 - 2 * linear);
}

export function foreshadowFor(worldY: number): ForeshadowSnapshot {
  const intensity = foreshadowIntensity(worldY);
  return Object.freeze({
    breathMist: intensity * 0.72,
    intensity,
    warningLayer: intensity * 0.58,
    windStreaks: Math.round(intensity * 9),
  });
}

/** Pure four-boundary Yeti chase/capture state machine. */
export class YetiSimulation {
  private controllers = initialControllers();
  private readonly events: YetiEvent[] = [];
  private eventSequence = 0;
  private capturedBy: string | null = null;
  private lastEvent: YetiEventType | "none" = "none";
  private playerRemoved = false;
  private previousTurbo = false;
  private resetRequested = false;
  private turboEvasionSeconds = 0;

  getSnapshot(playerWorldY = 0): YetiSnapshot {
    const captureController = this.capturedBy
      ? this.controllers.find((value) => value.id === this.capturedBy)
      : undefined;
    return Object.freeze({
      activeBoundaries: Object.freeze(
        this.controllers
          .filter((value) => value.active)
          .map((value) => value.boundary),
      ),
      capturePhase:
        captureController &&
        captureController.state !== "chasing" &&
        captureController.state !== "inactive"
          ? captureController.state
          : "none",
      capturedBy: this.capturedBy,
      controllers: Object.freeze(this.controllers.map(freezeController)),
      foreshadow: foreshadowFor(playerWorldY),
      lastEvent: this.lastEvent,
      playerRemoved: this.playerRemoved,
      resetRequested: this.resetRequested,
      turboEvasionSeconds: this.turboEvasionSeconds,
    });
  }

  drainEvents(): YetiEvent[] {
    return this.events.splice(0);
  }

  repositionYeti(id: string, worldX: number, worldY: number): boolean {
    if (![worldX, worldY].every(Number.isFinite)) return false;
    const controller = this.controllers.find((value) => value.id === id);
    if (!controller?.active || controller.state !== "chasing") return false;
    controller.worldX = worldX;
    controller.worldY = worldY;
    return true;
  }

  step(player: Readonly<YetiPlayerState>, deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0)
      throw new RangeError("deltaSeconds must be finite and positive");

    for (const controller of this.controllers) {
      if (!controller.active && boundaryExceeded(controller.boundary, player))
        this.activate(controller, player);
    }

    if (player.turbo && !this.previousTurbo && this.hasActiveChaser()) {
      this.turboEvasionSeconds = YETI_TUNING.turboEvasionWindowSeconds;
      const active = this.controllers.find((value) => value.active)!;
      this.emit("turbo-evasion", active, player);
    }
    this.previousTurbo = player.turbo;
    this.turboEvasionSeconds = Math.max(
      0,
      this.turboEvasionSeconds - deltaSeconds,
    );

    const captureController = this.capturedBy
      ? this.controllers.find((value) => value.id === this.capturedBy)
      : undefined;
    if (captureController) {
      this.stepCapture(captureController, player, deltaSeconds);
      return;
    }

    for (const controller of this.controllers) {
      if (!controller.active) continue;
      this.stepChase(controller, player, deltaSeconds);
      if (this.capturedBy) break;
    }
  }

  acknowledgeReset(): void {
    if (!this.resetRequested) return;
    this.controllers = initialControllers();
    this.capturedBy = null;
    this.playerRemoved = false;
    this.previousTurbo = false;
    this.resetRequested = false;
    this.turboEvasionSeconds = 0;
  }

  reset(): void {
    this.controllers = initialControllers();
    this.events.length = 0;
    this.eventSequence = 0;
    this.capturedBy = null;
    this.lastEvent = "none";
    this.playerRemoved = false;
    this.previousTurbo = false;
    this.resetRequested = false;
    this.turboEvasionSeconds = 0;
  }

  private activate(
    controller: MutableYetiController,
    player: Readonly<YetiPlayerState>,
  ): void {
    const [offsetX, offsetY] = safeOffset(controller.boundary);
    controller.active = true;
    controller.state = "chasing";
    controller.stateSeconds = 0;
    controller.worldX = player.worldX + offsetX;
    controller.worldY = player.worldY + offsetY;
    controller.velocityX = 0;
    controller.velocityY = 0;
    controller.protectionSeconds = YETI_TUNING.repositionProtectionSeconds;
    this.emit("yeti-activated", controller, player);
  }

  private stepChase(
    controller: MutableYetiController,
    player: Readonly<YetiPlayerState>,
    deltaSeconds: number,
  ): void {
    controller.stateSeconds += deltaSeconds;
    controller.protectionSeconds = Math.max(
      0,
      controller.protectionSeconds - deltaSeconds,
    );
    let deltaX = player.worldX - controller.worldX;
    let deltaY = player.worldY - controller.worldY;
    let distance = Math.hypot(deltaX, deltaY);
    if (distance > YETI_TUNING.repositionDistanceMeters) {
      const [offsetX, offsetY] = safeOffset(controller.boundary);
      controller.worldX = player.worldX + offsetX;
      controller.worldY = player.worldY + offsetY;
      controller.velocityX = 0;
      controller.velocityY = 0;
      controller.protectionSeconds = YETI_TUNING.repositionProtectionSeconds;
      deltaX = -offsetX;
      deltaY = -offsetY;
      distance = Math.hypot(deltaX, deltaY);
      this.emit("yeti-repositioned", controller, player);
    }
    const directionX = distance > 0 ? deltaX / distance : 0;
    const directionY = distance > 0 ? deltaY / distance : 0;
    const evasionScale =
      this.turboEvasionSeconds > 0 ? YETI_TUNING.turboEvasionSpeedScale : 1;
    const targetX =
      directionX * YETI_TUNING.maximumHorizontalSpeed * evasionScale;
    const targetY =
      directionY * YETI_TUNING.maximumVerticalSpeed * evasionScale;
    const maximumDelta =
      YETI_TUNING.chaseAccelerationMetersPerSecondSquared * deltaSeconds;
    controller.velocityX = moveToward(
      controller.velocityX,
      targetX,
      maximumDelta,
    );
    controller.velocityY = moveToward(
      controller.velocityY,
      targetY,
      maximumDelta,
    );
    controller.velocityX = Math.max(
      -YETI_TUNING.maximumHorizontalSpeed,
      Math.min(YETI_TUNING.maximumHorizontalSpeed, controller.velocityX),
    );
    controller.velocityY = Math.max(
      -YETI_TUNING.maximumVerticalSpeed,
      Math.min(YETI_TUNING.maximumVerticalSpeed, controller.velocityY),
    );
    controller.worldX += controller.velocityX * deltaSeconds;
    controller.worldY += controller.velocityY * deltaSeconds;

    const postMoveDistance = Math.hypot(
      player.worldX - controller.worldX,
      player.worldY - controller.worldY,
    );
    if (
      controller.protectionSeconds <= 0 &&
      postMoveDistance <= YETI_TUNING.captureRadiusMeters
    ) {
      this.capturedBy = controller.id;
      controller.state = "windup";
      controller.stateSeconds = 0;
      controller.velocityX = 0;
      controller.velocityY = 0;
      this.emit("capture-started", controller, player);
    }
  }

  private stepCapture(
    controller: MutableYetiController,
    player: Readonly<YetiPlayerState>,
    deltaSeconds: number,
  ): void {
    if (this.resetRequested) return;
    controller.stateSeconds += deltaSeconds;
    if (
      controller.state === "windup" &&
      controller.stateSeconds >= YETI_TUNING.windupSeconds
    ) {
      this.changeCaptureState(controller, "pounce", "pounced", player);
    } else if (
      controller.state === "pounce" &&
      controller.stateSeconds >= YETI_TUNING.pounceSeconds
    ) {
      controller.worldX = player.worldX;
      controller.worldY = player.worldY;
      this.playerRemoved = true;
      this.changeCaptureState(controller, "grab", "grabbed", player);
    } else if (
      controller.state === "grab" &&
      controller.stateSeconds >= YETI_TUNING.grabSeconds
    ) {
      this.changeCaptureState(controller, "eat", "eaten", player);
    } else if (
      controller.state === "eat" &&
      controller.stateSeconds >= YETI_TUNING.eatSeconds
    ) {
      this.changeCaptureState(controller, "chew", "chewing", player);
    } else if (
      controller.state === "chew" &&
      controller.stateSeconds >= YETI_TUNING.chewSeconds
    ) {
      controller.state = "recovery";
      controller.stateSeconds = 0;
    } else if (
      controller.state === "recovery" &&
      controller.stateSeconds >= YETI_TUNING.recoverySeconds
    ) {
      this.resetRequested = true;
      this.emit("reset-requested", controller, player);
    }
  }

  private changeCaptureState(
    controller: MutableYetiController,
    state: YetiState,
    event: YetiEventType,
    player: Readonly<YetiPlayerState>,
  ): void {
    controller.state = state;
    controller.stateSeconds = 0;
    this.emit(event, controller, player);
  }

  private hasActiveChaser(): boolean {
    return this.controllers.some(
      (value) => value.active && value.state === "chasing",
    );
  }

  private emit(
    type: YetiEventType,
    controller: MutableYetiController,
    player: Readonly<YetiPlayerState>,
  ): void {
    const safeDistanceMeters = Math.hypot(
      player.worldX - controller.worldX,
      player.worldY - controller.worldY,
    );
    this.lastEvent = type;
    this.events.push(
      Object.freeze({
        atSeconds: player.simulationSeconds,
        boundary: controller.boundary,
        id: `yeti-event-${this.eventSequence++}`,
        safeDistanceMeters,
        type,
        yetiId: controller.id,
      }),
    );
  }
}
