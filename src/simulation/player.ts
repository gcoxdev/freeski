export type PlayerHeading =
  | "left-stop"
  | "left-60"
  | "left-30"
  | "downhill"
  | "right-30"
  | "right-60"
  | "right-stop";

export type PlayerMotion = "grounded" | "airborne" | "crashed" | "recovering";
export type LandingResult = "none" | "clean" | "crash";
export type PlayerCrashKind = "impact" | "landing" | "runover";
export type PlayerTrickPose =
  "none" | "spread" | "daffy" | "twist-left" | "twist-right";

export interface PlayerInputFrame {
  aiming: boolean;
  brake: boolean;
  jumpPressed: boolean;
  steer: number;
  trickFlip: number;
  trickSpin: number;
  tuck: boolean;
  turn: number;
}

export interface PlayerSnapshot {
  airHeight: number;
  airPitch: number;
  airSpin: number;
  airTilt: number;
  crashKind: PlayerCrashKind;
  crashCount: number;
  heading: PlayerHeading;
  jumpCount: number;
  lastLanding: LandingResult;
  motion: PlayerMotion;
  paused: boolean;
  recoveryGraceSeconds: number;
  runNumber: number;
  simulationSeconds: number;
  speedMetersPerSecond: number;
  trickPose: PlayerTrickPose;
  tucking: boolean;
  turbo: boolean;
  velocityX: number;
  velocityY: number;
  worldX: number;
  worldY: number;
}

export type PlayerEventType =
  | "crashed"
  | "heading-changed"
  | "jumped"
  | "landed-clean"
  | "paused"
  | "repositioned"
  | "recovered"
  | "recovery-started"
  | "reset"
  | "rotation-clicked"
  | "resumed"
  | "turbo-off"
  | "turbo-on";

export interface PlayerEvent {
  atSeconds: number;
  detail: string;
  type: PlayerEventType;
}

export const NEUTRAL_PLAYER_INPUT: Readonly<PlayerInputFrame> = Object.freeze({
  aiming: false,
  brake: false,
  jumpPressed: false,
  steer: 0,
  trickFlip: 0,
  trickSpin: 0,
  tuck: false,
  turn: 0,
});

export const PLAYER_TUNING = Object.freeze({
  airControlAcceleration: 7,
  airClickRotationRate: 8.4,
  airGravity: 10.4,
  airTiltRate: 3.35,
  airTrickRotationRate: 6.45,
  cleanLandingTilt: 0.48,
  crashDuration: 0.68,
  crashFriction: 25,
  downhillSpeed: 21,
  initialDownhillSpeed: 4.2,
  jumpVelocity: 5.35,
  lateralAcceleration: 34,
  longitudinalAcceleration: 21,
  recoveryDuration: 0.42,
  recoveryGraceSeconds: 0.32,
  turnRepeatSeconds: 0.14,
  turboAccelerationMultiplier: 1.3,
  turboSpeedMultiplier: 1.72,
  tuckSpeed: 27.5,
});

const FULL_TRICK_ROTATION = Math.PI * 2;

interface MutablePlayerState extends Omit<
  PlayerSnapshot,
  "speedMetersPerSecond"
> {
  airPitchTarget: number;
  airRotationClicks: number;
  airVelocity: number;
  crashRemaining: number;
  lastSteerDirection: -1 | 1;
  recoveryRemaining: number;
  turnChargeSeconds: number;
}

interface TargetVelocity {
  x: number;
  y: number;
}

function initialState(runNumber: number): MutablePlayerState {
  return {
    airHeight: 0,
    airPitch: 0,
    airPitchTarget: 0,
    airRotationClicks: 0,
    airSpin: 0,
    airTilt: 0,
    airVelocity: 0,
    crashKind: "impact",
    crashCount: 0,
    crashRemaining: 0,
    heading: "downhill",
    jumpCount: 0,
    lastLanding: "none",
    lastSteerDirection: -1,
    motion: "grounded",
    paused: false,
    recoveryGraceSeconds: 0,
    recoveryRemaining: 0,
    runNumber,
    simulationSeconds: 0,
    trickPose: "none",
    tucking: false,
    turbo: false,
    turnChargeSeconds: 0,
    velocityX: 0,
    velocityY: PLAYER_TUNING.initialDownhillSpeed,
    worldX: 0,
    worldY: 0,
  };
}

function moveToward(
  current: number,
  target: number,
  maximumDelta: number,
): number {
  if (Math.abs(target - current) <= maximumDelta) return target;
  return current + Math.sign(target - current) * maximumDelta;
}

function clampSteer(steer: number): number {
  if (!Number.isFinite(steer)) return 0;
  return Math.max(-1, Math.min(1, steer));
}

export const PLAYER_HEADINGS = Object.freeze([
  "left-stop",
  "left-60",
  "left-30",
  "downhill",
  "right-30",
  "right-60",
  "right-stop",
] as const satisfies readonly PlayerHeading[]);

function headingIndex(heading: PlayerHeading): number {
  return PLAYER_HEADINGS.indexOf(heading);
}

function headingForAim(steer: number): PlayerHeading {
  const normalized = (clampSteer(steer) + 1) * 0.5;
  return PLAYER_HEADINGS[Math.round(normalized * 6)]!;
}

function targetForHeading(
  heading: PlayerHeading,
  tucking: boolean,
): TargetVelocity {
  const index = headingIndex(heading);
  if (index === 0 || index === 6) return { x: 0, y: 0 };
  const angleFromDownhill = ((index - 3) * 30 * Math.PI) / 180;
  const speed =
    tucking && heading === "downhill"
      ? PLAYER_TUNING.tuckSpeed
      : PLAYER_TUNING.downhillSpeed;
  return {
    x: Math.sin(angleFromDownhill) * speed,
    y: Math.cos(angleFromDownhill) * speed,
  };
}

/** Deterministic, engine-independent skier state machine. World values are meters. */
export class PlayerSimulation {
  private state = initialState(1);
  private events: PlayerEvent[] = [];

  getSnapshot(): PlayerSnapshot {
    return {
      airHeight: this.state.airHeight,
      airPitch: this.state.airPitch,
      airSpin: this.state.airSpin,
      airTilt: this.state.airTilt,
      crashKind: this.state.crashKind,
      crashCount: this.state.crashCount,
      heading: this.state.heading,
      jumpCount: this.state.jumpCount,
      lastLanding: this.state.lastLanding,
      motion: this.state.motion,
      paused: this.state.paused,
      recoveryGraceSeconds: this.state.recoveryGraceSeconds,
      runNumber: this.state.runNumber,
      simulationSeconds: this.state.simulationSeconds,
      speedMetersPerSecond: Math.hypot(
        this.state.velocityX,
        this.state.velocityY,
      ),
      trickPose: this.state.trickPose,
      tucking: this.state.tucking,
      turbo: this.state.turbo,
      velocityX: this.state.velocityX,
      velocityY: this.state.velocityY,
      worldX: this.state.worldX,
      worldY: this.state.worldY,
    };
  }

  drainEvents(): PlayerEvent[] {
    return this.events.splice(0);
  }

  reset(): void {
    const runNumber = this.state.runNumber + 1;
    this.state = initialState(runNumber);
    this.emit("reset", `run-${runNumber}`);
  }

  togglePause(): void {
    this.state.paused = !this.state.paused;
    this.emit(
      this.state.paused ? "paused" : "resumed",
      this.state.paused ? "on" : "off",
    );
  }

  toggleTurbo(): void {
    this.state.turbo = !this.state.turbo;
    this.emit(
      this.state.turbo ? "turbo-on" : "turbo-off",
      this.state.turbo ? "on" : "off",
    );
  }

  reposition(
    worldX: number,
    worldY: number,
    velocityX: number = 0,
    velocityY: number = PLAYER_TUNING.initialDownhillSpeed,
  ): void {
    if (![worldX, worldY, velocityX, velocityY].every(Number.isFinite))
      throw new RangeError("reposition values must be finite");
    this.state.worldX = worldX;
    this.state.worldY = worldY;
    this.state.velocityX = velocityX;
    this.state.velocityY = velocityY;
    this.state.motion = "grounded";
    this.state.airHeight = 0;
    this.state.airVelocity = 0;
    this.state.airPitch = 0;
    this.state.airPitchTarget = 0;
    this.state.airRotationClicks = 0;
    this.state.airSpin = 0;
    this.state.airTilt = 0;
    this.state.trickPose = "none";
    this.state.tucking = false;
    this.state.lastLanding = "none";
    this.state.recoveryGraceSeconds = 0;
    this.emit("repositioned", `${worldX.toFixed(2)},${worldY.toFixed(2)}`);
  }

  launch(source: string, verticalVelocity: number): boolean {
    if (
      this.state.motion !== "grounded" ||
      !Number.isFinite(verticalVelocity) ||
      verticalVelocity <= 0
    ) {
      return false;
    }
    this.beginJump(verticalVelocity, source);
    return true;
  }

  tryCrash(reason: string, kind: PlayerCrashKind = "impact"): boolean {
    if (
      this.state.motion === "crashed" ||
      this.state.motion === "recovering" ||
      this.state.recoveryGraceSeconds > 0
    ) {
      return false;
    }
    this.state.motion = "crashed";
    this.state.crashKind = kind;
    this.state.lastLanding = "crash";
    this.state.crashCount += 1;
    this.state.crashRemaining = PLAYER_TUNING.crashDuration;
    this.state.velocityX *= 0.5;
    this.state.velocityY *= 0.4;
    this.emit("crashed", reason);
    return true;
  }

  applySpeedMultiplier(multiplier: number): void {
    if (!Number.isFinite(multiplier) || multiplier < 0 || multiplier > 1) {
      throw new RangeError("multiplier must be between zero and one");
    }
    this.state.velocityX *= multiplier;
    this.state.velocityY *= multiplier;
  }

  step(input: Readonly<PlayerInputFrame>, deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      throw new RangeError("deltaSeconds must be finite and positive");
    }
    if (this.state.paused) return;

    this.state.simulationSeconds += deltaSeconds;
    this.state.recoveryGraceSeconds = Math.max(
      0,
      this.state.recoveryGraceSeconds - deltaSeconds,
    );
    if (this.state.motion === "crashed") {
      this.stepCrash(deltaSeconds);
      return;
    }
    if (this.state.motion === "recovering") {
      this.stepRecovery(deltaSeconds);
      return;
    }
    if (this.state.motion === "airborne") {
      this.stepAir(input, deltaSeconds);
      return;
    }

    this.updateHeading(input, deltaSeconds);
    if (input.jumpPressed) {
      this.beginJump(PLAYER_TUNING.jumpVelocity, "manual");
      this.stepAir({ ...input, jumpPressed: false }, deltaSeconds);
      return;
    }
    this.stepGround(deltaSeconds);
  }

  private updateHeading(
    input: Readonly<PlayerInputFrame>,
    deltaSeconds: number,
  ): void {
    const turn = Math.sign(clampSteer(input.turn)) as -1 | 0 | 1;
    let nextHeading = this.state.heading;
    this.state.tucking = input.tuck;

    if (input.brake) {
      nextHeading =
        this.state.lastSteerDirection < 0 ? "left-stop" : "right-stop";
      this.state.tucking = false;
      this.state.turnChargeSeconds = 0;
    } else if (input.tuck) {
      nextHeading = "downhill";
      this.state.turnChargeSeconds = 0;
    } else if (turn !== 0) {
      const changedDirection = turn !== this.state.lastSteerDirection;
      const turnStarted = this.state.turnChargeSeconds === 0;
      if (changedDirection) this.state.turnChargeSeconds = 0;
      this.state.lastSteerDirection = turn;
      this.state.turnChargeSeconds += deltaSeconds;
      if (
        turnStarted ||
        changedDirection ||
        this.state.turnChargeSeconds >= PLAYER_TUNING.turnRepeatSeconds
      ) {
        const nextIndex = Math.max(
          0,
          Math.min(6, headingIndex(this.state.heading) + turn),
        );
        nextHeading = PLAYER_HEADINGS[nextIndex]!;
        this.state.turnChargeSeconds = Number.EPSILON;
      }
    } else if (input.aiming) {
      nextHeading = headingForAim(input.steer);
      if (input.steer !== 0)
        this.state.lastSteerDirection = input.steer < 0 ? -1 : 1;
      this.state.turnChargeSeconds = 0;
    } else {
      // Digital steering selects a discrete heading. Keep that heading after
      // release until another key or an active absolute-aim source changes it.
      this.state.turnChargeSeconds = 0;
    }

    if (nextHeading !== this.state.heading) {
      this.state.heading = nextHeading;
      this.emit("heading-changed", nextHeading);
    }
  }

  private stepGround(deltaSeconds: number): void {
    if (this.state.heading.endsWith("stop")) {
      this.state.velocityX = 0;
      this.state.velocityY = 0;
      return;
    }
    const target = targetForHeading(this.state.heading, this.state.tucking);
    const speedScale = this.state.turbo
      ? PLAYER_TUNING.turboSpeedMultiplier
      : 1;
    const accelerationScale = this.state.turbo
      ? PLAYER_TUNING.turboAccelerationMultiplier
      : 1;
    this.state.velocityX = moveToward(
      this.state.velocityX,
      target.x * speedScale,
      PLAYER_TUNING.lateralAcceleration * accelerationScale * deltaSeconds,
    );
    this.state.velocityY = moveToward(
      this.state.velocityY,
      target.y * speedScale,
      PLAYER_TUNING.longitudinalAcceleration * accelerationScale * deltaSeconds,
    );
    this.integrateWorld(deltaSeconds);
  }

  private beginJump(verticalVelocity: number, source: string): void {
    this.state.motion = "airborne";
    this.state.airHeight = 0;
    this.state.airPitch = 0;
    this.state.airPitchTarget = 0;
    this.state.airRotationClicks = 0;
    this.state.airSpin = 0;
    this.state.airTilt = 0;
    this.state.trickPose = "none";
    this.state.tucking = false;
    this.state.airVelocity = verticalVelocity;
    this.state.jumpCount += 1;
    this.emit("jumped", `${source}-${this.state.jumpCount}`);
  }

  private stepAir(
    input: Readonly<PlayerInputFrame>,
    deltaSeconds: number,
  ): void {
    const steer = clampSteer(input.steer);
    if (input.jumpPressed) {
      this.state.airRotationClicks += 1;
      this.state.airPitchTarget =
        this.state.airRotationClicks * (FULL_TRICK_ROTATION / 2);
      const targetClicks = Math.ceil(this.state.airRotationClicks / 2) * 2;
      this.emit(
        "rotation-clicked",
        `${this.state.airRotationClicks}-of-${targetClicks}`,
      );
    }
    // Pointer/keyboard steering changes the flight line but must not silently
    // turn into a failed aerial trick. Landing tilt is reserved for explicit
    // trick rotation, matching the click-driven classic control contract.
    this.state.airTilt = moveToward(
      this.state.airTilt,
      0,
      PLAYER_TUNING.airTiltRate * deltaSeconds,
    );
    this.state.airSpin = Math.max(
      -FULL_TRICK_ROTATION,
      Math.min(
        FULL_TRICK_ROTATION,
        this.state.airSpin +
          clampSteer(input.trickSpin) *
            PLAYER_TUNING.airTrickRotationRate *
            deltaSeconds,
      ),
    );
    this.state.airPitch = moveToward(
      this.state.airPitch,
      this.state.airPitchTarget,
      PLAYER_TUNING.airClickRotationRate * deltaSeconds,
    );
    this.state.trickPose =
      input.trickSpin < 0
        ? "twist-left"
        : input.trickSpin > 0
          ? "twist-right"
          : input.trickFlip < 0
            ? "spread"
            : input.trickFlip > 0
              ? "daffy"
              : "none";
    this.state.velocityX +=
      steer * PLAYER_TUNING.airControlAcceleration * deltaSeconds;
    this.state.airVelocity -= PLAYER_TUNING.airGravity * deltaSeconds;
    this.state.airHeight += this.state.airVelocity * deltaSeconds;
    this.integrateWorld(deltaSeconds);

    if (this.state.airHeight > 0 || this.state.airVelocity >= 0) return;
    this.state.airHeight = 0;
    this.state.airVelocity = 0;
    const landingSpin = wrappedRotation(this.state.airSpin);
    const landingPitch = wrappedRotation(this.state.airPitch);
    if (
      Math.abs(this.state.airTilt) <= PLAYER_TUNING.cleanLandingTilt &&
      Math.abs(landingSpin) <= PLAYER_TUNING.cleanLandingTilt &&
      Math.abs(landingPitch) <= PLAYER_TUNING.cleanLandingTilt
    ) {
      this.state.airTilt = 0;
      this.state.motion = "grounded";
      this.state.lastLanding = "clean";
      this.emit("landed-clean", this.state.heading);
      return;
    }

    this.tryCrash(
      `landing-${this.state.airTilt.toFixed(2)}-${landingSpin.toFixed(2)}-${landingPitch.toFixed(2)}`,
      "landing",
    );
  }

  private stepCrash(deltaSeconds: number): void {
    this.state.velocityX = moveToward(
      this.state.velocityX,
      0,
      PLAYER_TUNING.crashFriction * deltaSeconds,
    );
    this.state.velocityY = moveToward(
      this.state.velocityY,
      0,
      PLAYER_TUNING.crashFriction * deltaSeconds,
    );
    this.integrateWorld(deltaSeconds);
    this.state.crashRemaining -= deltaSeconds;
    if (this.state.crashRemaining > 0) return;
    this.state.motion = "recovering";
    this.state.recoveryRemaining = PLAYER_TUNING.recoveryDuration;
    this.state.velocityX = 0;
    this.state.velocityY = 0;
    this.emit("recovery-started", `crash-${this.state.crashCount}`);
  }

  private stepRecovery(deltaSeconds: number): void {
    this.state.recoveryRemaining -= deltaSeconds;
    if (this.state.recoveryRemaining > 0) return;
    this.state.motion = "grounded";
    this.state.heading = "downhill";
    this.state.airPitch = 0;
    this.state.airPitchTarget = 0;
    this.state.airRotationClicks = 0;
    this.state.airSpin = 0;
    this.state.airTilt = 0;
    this.state.trickPose = "none";
    this.state.tucking = false;
    this.state.recoveryGraceSeconds = PLAYER_TUNING.recoveryGraceSeconds;
    this.state.velocityY = PLAYER_TUNING.initialDownhillSpeed;
    this.emit("recovered", `crash-${this.state.crashCount}`);
  }

  private integrateWorld(deltaSeconds: number): void {
    this.state.worldX += this.state.velocityX * deltaSeconds;
    this.state.worldY += this.state.velocityY * deltaSeconds;
  }

  private emit(type: PlayerEventType, detail: string): void {
    this.events.push({ atSeconds: this.state.simulationSeconds, detail, type });
  }
}

function wrappedRotation(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
