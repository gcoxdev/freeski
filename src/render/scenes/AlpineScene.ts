import Phaser from "phaser";
import {
  BrowserInputAdapter,
  type InputTelemetryEvent,
} from "../../input/browserInput";
import {
  FixedStepClock,
  SIMULATION_STEP_SECONDS,
} from "../../simulation/fixedStep";
import {
  PlayerSimulation,
  type PlayerEvent,
  type PlayerSnapshot,
} from "../../simulation/player";
import { GENERATOR_VERSION } from "../../world/generatorVersion";
import { hashSeed } from "../../world/seed";
import type { FreeSkiRuntime, TelemetrySample } from "../runtimeBridge";

const PLAYER_SCREEN_RATIO = 0.35;
const PIXELS_PER_METER = 7.5;
const MAX_TELEMETRY_EVENTS = 240;
const MAX_TELEMETRY_SAMPLES = 600;

const COLORS = {
  blueSuit: 0x1d5b85,
  glacier: 0xdbe9e9,
  glacierShadow: 0xc3dadc,
  ink: 0x102933,
  powder: 0xf7f9f5,
  redHelmet: 0xe84d2a,
  signal: 0xe84d2a,
  skiYellow: 0xf5c844,
  white: 0xffffff,
} as const;

export class AlpineScene extends Phaser.Scene {
  private readonly worldSeed: string;
  private readonly clock = new FixedStepClock(SIMULATION_STEP_SECONDS, 30);
  private readonly simulation = new PlayerSimulation();
  private background?: Phaser.GameObjects.Graphics;
  private skier?: Phaser.GameObjects.Container;
  private skierShadow?: Phaser.GameObjects.Ellipse;
  private locationLabel?: Phaser.GameObjects.Text;
  private runLabel?: Phaser.GameObjects.Text;
  private inputAdapter?: BrowserInputAdapter;
  private runtime?: FreeSkiRuntime;
  private readonly inputEvents: InputTelemetryEvent[] = [];
  private readonly playerEvents: PlayerEvent[] = [];
  private readonly samples: TelemetrySample[] = [];
  private fixedSteps = 0;
  private renderFrames = 0;
  private droppedSeconds = 0;

  constructor(seed: string) {
    super("alpine-baseline");
    this.worldSeed = seed;
  }

  create(): void {
    this.background = this.add.graphics();
    this.createSkier();
    this.createLabels();

    this.inputAdapter = new BrowserInputAdapter(
      this.game.canvas,
      () => ({
        x: this.scale.width * 0.5,
        y: this.scale.height * PLAYER_SCREEN_RATIO,
      }),
      (event) => this.recordInput(event),
    );

    const pointerFromUrl =
      new URLSearchParams(window.location.search).get("pointer") === "1";
    this.setPointerSteering(pointerFromUrl);
    const pointerToggle =
      document.querySelector<HTMLButtonElement>("#pointer-toggle");
    pointerToggle?.addEventListener("click", () =>
      this.setPointerSteering(!(this.inputAdapter?.isPointerEnabled ?? false)),
    );

    const player = this.simulation.getSnapshot();
    this.runtime = {
      camera: {
        playerScreenRatio: PLAYER_SCREEN_RATIO,
        playerScreenX: this.scale.width * 0.5,
        playerScreenY: this.scale.height * PLAYER_SCREEN_RATIO,
      },
      engine: "phaser-3",
      generatorVersion: GENERATOR_VERSION,
      lastInput: "none",
      player,
      ready: true,
      seed: this.worldSeed,
      seedHash: hashSeed(this.worldSeed),
      settings: { pointerSteeringEnabled: pointerFromUrl },
      telemetry: {
        droppedSeconds: 0,
        fixedSteps: 0,
        inputEvents: this.inputEvents,
        playerEvents: this.playerEvents,
        renderFrames: 0,
        samples: this.samples,
      },
    };
    window.__FREE_SKI__ = this.runtime;

    const shell = document.querySelector<HTMLElement>("#game-shell");
    const status = document.querySelector<HTMLElement>("#system-label");
    shell?.setAttribute("data-game-ready", "true");
    if (status) status.textContent = "Alpine systems online";
    this.renderState(player);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      this.inputAdapter?.destroy(),
    );
  }

  update(_time: number, deltaMilliseconds: number): void {
    if (!this.inputAdapter || !this.runtime) return;
    const result = this.clock.advance(
      Math.min(deltaMilliseconds / 1000, 0.25),
      (deltaSeconds) => {
        const actions = this.inputAdapter?.sample();
        if (!actions) return;

        if (actions.resetPressed) this.simulation.reset();
        if (actions.pausePressed) this.simulation.togglePause();
        if (actions.turboPressed) this.simulation.toggleTurbo();
        this.simulation.step(actions.player, deltaSeconds);
        this.fixedSteps += 1;
        this.capturePlayerEvents();
        if (this.fixedSteps % 6 === 0) this.captureSample();
      },
    );

    this.droppedSeconds += result.droppedSeconds;
    this.renderFrames += 1;
    this.renderState(this.simulation.getSnapshot());
  }

  private createSkier(): void {
    this.skierShadow = this.add.ellipse(0, 0, 43, 14, COLORS.ink, 0.15);

    const figure = this.add.graphics();
    figure.lineStyle(3, COLORS.skiYellow, 1);
    figure.lineBetween(-6, -18, -6, 23);
    figure.lineBetween(6, -18, 6, 23);
    figure.lineStyle(2, COLORS.ink, 0.75);
    figure.lineBetween(-8, -7, -18, 17);
    figure.lineBetween(8, -7, 18, 17);
    figure.fillStyle(COLORS.blueSuit, 1);
    figure.fillRoundedRect(-10, -11, 20, 27, 7);
    figure.fillStyle(0x123f61, 1);
    figure.fillTriangle(-9, 10, -2, 12, -8, 25);
    figure.fillTriangle(9, 10, 2, 12, 8, 25);
    figure.fillStyle(COLORS.redHelmet, 1);
    figure.fillCircle(0, -15, 8);
    figure.fillStyle(COLORS.white, 0.9);
    figure.fillRect(-5, -18, 10, 2);

    this.skier = this.add.container(0, 0, [figure]);
  }

  private createLabels(): void {
    this.locationLabel = this.add.text(28, 25, "OPEN SLOPE / 0000 M", {
      color: "#102933",
      fontFamily: "Courier New, monospace",
      fontSize: "11px",
      fontStyle: "bold",
      letterSpacing: 2,
    });
    this.locationLabel.setAlpha(0.78);

    this.add
      .text(28, 45, "FIXED-STEP DESCENT RANGE", {
        color: "#536d75",
        fontFamily: "Courier New, monospace",
        fontSize: "9px",
        letterSpacing: 1.5,
      })
      .setAlpha(0.9);

    this.runLabel = this.add
      .text(0, 25, "RUN 01\nDOWNHILL", {
        align: "right",
        color: "#102933",
        fontFamily: "Courier New, monospace",
        fontSize: "10px",
        fontStyle: "bold",
        lineSpacing: 4,
      })
      .setOrigin(1, 0);
  }

  private renderState(player: PlayerSnapshot): void {
    this.drawSnowfield(player);
    this.updateSkier(player);
    this.updateHud(player);
    this.updateRuntime(player);
  }

  private drawSnowfield(player: PlayerSnapshot): void {
    if (!this.background) return;
    const width = this.scale.width;
    const height = this.scale.height;
    const anchorY = height * PLAYER_SCREEN_RATIO;
    this.background.clear();
    this.background.fillStyle(COLORS.glacier);
    this.background.fillRect(0, 0, width, height);

    this.background.fillStyle(COLORS.powder);
    this.background.fillTriangle(0, 0, width * 0.72, 0, 0, height);
    this.background.fillTriangle(
      width * 0.13,
      height,
      width,
      height * 0.08,
      width,
      height,
    );
    this.background.fillStyle(COLORS.glacierShadow, 0.28);
    this.background.fillTriangle(
      width * 0.76,
      0,
      width,
      0,
      width,
      height * 0.22,
    );

    const contourSpacing = 76;
    const verticalOffset = -(
      (player.worldY * PIXELS_PER_METER) %
      contourSpacing
    );
    const horizontalOffset = -player.worldX * PIXELS_PER_METER * 0.16;
    this.background.lineStyle(1, COLORS.ink, 0.09);
    for (
      let line = -1;
      line <= Math.ceil(height / contourSpacing) + 1;
      line += 1
    ) {
      const y = line * contourSpacing + verticalOffset;
      const bend = Math.sin((player.worldY + line * 8) * 0.05) * 15;
      this.background.strokePoints(
        [
          new Phaser.Geom.Point(-30, y + bend),
          new Phaser.Geom.Point(width * 0.27 + horizontalOffset, y - 8),
          new Phaser.Geom.Point(width * 0.58 + horizontalOffset, y + 9),
          new Phaser.Geom.Point(width + 30, y - bend),
        ],
        false,
        false,
      );
    }

    this.drawGroomerTracks(player, anchorY, height);
    this.drawRangePoles(player, width, height);
    this.background.fillStyle(COLORS.signal, 0.9);
    this.background.fillRect(width - 15, height * 0.12, 3, height * 0.76);
    this.background.fillStyle(COLORS.ink, 0.9);
    this.background.fillRect(width - 18, anchorY, 9, 2);
  }

  private drawGroomerTracks(
    player: PlayerSnapshot,
    anchorY: number,
    height: number,
  ): void {
    if (!this.background) return;
    const centerX = this.scale.width * 0.5;
    const drift = Math.max(-70, Math.min(70, -player.velocityX * 3.2));
    this.background.lineStyle(1, COLORS.ink, 0.1);
    for (const skiOffset of [-7, 7]) {
      const points = [
        new Phaser.Geom.Point(centerX + skiOffset, anchorY + 13),
        new Phaser.Geom.Point(
          centerX + skiOffset + drift * 0.25,
          anchorY + height * 0.18,
        ),
        new Phaser.Geom.Point(centerX + skiOffset + drift, height + 20),
      ];
      this.background.strokePoints(points, false, false);
    }
  }

  private drawRangePoles(
    player: PlayerSnapshot,
    width: number,
    height: number,
  ): void {
    if (!this.background) return;
    const spacingMeters = 22;
    const startIndex = Math.floor(player.worldY / spacingMeters) - 3;
    const endIndex =
      startIndex + Math.ceil(height / (spacingMeters * PIXELS_PER_METER)) + 7;
    for (let index = startIndex; index <= endIndex; index += 1) {
      const worldY = index * spacingMeters;
      const screenY =
        height * PLAYER_SCREEN_RATIO +
        (worldY - player.worldY) * PIXELS_PER_METER;
      const side = index % 2 === 0 ? -1 : 1;
      const worldX = side * (30 + (Math.abs(index) % 3) * 6);
      const screenX = width * 0.5 + (worldX - player.worldX) * PIXELS_PER_METER;
      if (
        screenY < -30 ||
        screenY > height + 30 ||
        screenX < -30 ||
        screenX > width + 30
      )
        continue;
      this.background.lineStyle(2, COLORS.ink, 0.25);
      this.background.lineBetween(screenX, screenY - 13, screenX, screenY + 13);
      this.background.fillStyle(
        index % 4 < 2 ? COLORS.signal : COLORS.blueSuit,
        0.72,
      );
      this.background.fillTriangle(
        screenX,
        screenY - 12,
        screenX + side * 13,
        screenY - 7,
        screenX,
        screenY - 3,
      );
    }
  }

  private updateSkier(player: PlayerSnapshot): void {
    if (!this.skier || !this.skierShadow) return;
    const anchorX = this.scale.width * 0.5;
    const anchorY = this.scale.height * PLAYER_SCREEN_RATIO;
    const velocityAngle =
      Math.atan2(player.velocityY, player.velocityX) - Math.PI / 2;
    const airOffset = player.airHeight * 19;
    this.skierShadow.setPosition(anchorX, anchorY + 18);
    this.skierShadow.setScale(Math.max(0.62, 1 - player.airHeight * 0.06));
    this.skierShadow.setAlpha(Math.max(0.05, 0.17 - player.airHeight * 0.018));
    this.skier.setPosition(anchorX, anchorY - airOffset);
    this.skier.setRotation(
      player.motion === "crashed"
        ? velocityAngle + Math.PI * 0.55
        : velocityAngle +
            (player.motion === "airborne" ? player.airTilt * 0.45 : 0),
    );
    this.skier.setScale(
      player.motion === "recovering"
        ? 0.88
        : 1 + Math.min(player.airHeight * 0.022, 0.14),
    );
    this.skier.setAlpha(player.motion === "recovering" ? 0.62 : 1);
  }

  private updateHud(player: PlayerSnapshot): void {
    const shell = document.querySelector<HTMLElement>("#game-shell");
    const speed = document.querySelector<HTMLElement>("#speed-label");
    const distance = document.querySelector<HTMLElement>("#distance-label");
    const motion = document.querySelector<HTMLElement>("#motion-label");
    const turbo = document.querySelector<HTMLElement>("#turbo-indicator");
    const pauseCard = document.querySelector<HTMLElement>("#pause-card");
    const status = document.querySelector<HTMLElement>("#system-label");
    if (speed)
      speed.textContent = Math.round(
        player.speedMetersPerSecond * 3.6,
      ).toString();
    if (distance) distance.textContent = Math.floor(player.worldY).toString();
    if (motion)
      motion.textContent = `${player.motion} / ${player.heading}`.toUpperCase();
    if (turbo) turbo.textContent = player.turbo ? "TURBO ON" : "TURBO OFF";
    if (pauseCard) pauseCard.hidden = !player.paused;
    if (status)
      status.textContent = player.paused
        ? "Run suspended"
        : "Alpine systems online";
    shell?.setAttribute("data-turbo", player.turbo.toString());
    shell?.setAttribute("data-paused", player.paused.toString());
    this.locationLabel?.setText(
      `OPEN SLOPE / ${Math.floor(player.worldY).toString().padStart(4, "0")} M`,
    );
    this.runLabel?.setText(
      `RUN ${player.runNumber.toString().padStart(2, "0")}\n${player.motion.toUpperCase()}`,
    );
    this.runLabel?.setPosition(this.scale.width - 31, 25);
  }

  private updateRuntime(player: PlayerSnapshot): void {
    if (!this.runtime) return;
    this.runtime.player = player;
    this.runtime.camera.playerScreenX = this.scale.width * 0.5;
    this.runtime.camera.playerScreenY = this.scale.height * PLAYER_SCREEN_RATIO;
    this.runtime.settings.pointerSteeringEnabled =
      this.inputAdapter?.isPointerEnabled ?? false;
    this.runtime.telemetry.droppedSeconds = this.droppedSeconds;
    this.runtime.telemetry.fixedSteps = this.fixedSteps;
    this.runtime.telemetry.renderFrames = this.renderFrames;
  }

  private setPointerSteering(enabled: boolean): void {
    this.inputAdapter?.setPointerEnabled(enabled);
    const button = document.querySelector<HTMLButtonElement>("#pointer-toggle");
    button?.setAttribute("aria-pressed", enabled.toString());
    if (button) button.textContent = enabled ? "POINTER ON" : "POINTER OFF";
    if (this.runtime) this.runtime.settings.pointerSteeringEnabled = enabled;
  }

  private recordInput(event: InputTelemetryEvent): void {
    this.inputEvents.push(event);
    if (this.inputEvents.length > MAX_TELEMETRY_EVENTS)
      this.inputEvents.shift();
    if (this.runtime) this.runtime.lastInput = event.code;
  }

  private capturePlayerEvents(): void {
    this.playerEvents.push(...this.simulation.drainEvents());
    if (this.playerEvents.length > MAX_TELEMETRY_EVENTS) {
      this.playerEvents.splice(
        0,
        this.playerEvents.length - MAX_TELEMETRY_EVENTS,
      );
    }
  }

  private captureSample(): void {
    const player = this.simulation.getSnapshot();
    this.samples.push({
      airHeight: player.airHeight,
      fixedStep: this.fixedSteps,
      heading: player.heading,
      motion: player.motion,
      paused: player.paused,
      simulationSeconds: player.simulationSeconds,
      turbo: player.turbo,
      velocityX: player.velocityX,
      velocityY: player.velocityY,
      worldX: player.worldX,
      worldY: player.worldY,
    });
    if (this.samples.length > MAX_TELEMETRY_SAMPLES) this.samples.shift();
  }
}
