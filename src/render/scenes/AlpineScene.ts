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
  NEUTRAL_PLAYER_INPUT,
  PlayerSimulation,
  type PlayerEvent,
  type PlayerSnapshot,
} from "../../simulation/player";
import {
  CLASSIC_COURSES,
  CLASSIC_LIFT,
  classicOverlaySignature,
} from "../../world/classicMountain";
import {
  blocksGuaranteedCorridor,
  CORRIDOR_WIDTH_METERS,
  corridorCenterX,
  isBlockingType,
} from "../../world/corridor";
import { WorldGenerator } from "../../world/generator";
import { GENERATOR_VERSION } from "../../world/generatorVersion";
import { MountainStream } from "../../world/mountainStream";
import { hashSeed } from "../../world/seed";
import { CHUNK_SIZE_METERS, type GeneratedObject } from "../../world/types";
import type {
  DescentAuditReport,
  FreeSkiRuntime,
  TelemetrySample,
} from "../runtimeBridge";

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
  spruce: 0x174f45,
  stone: 0x71858a,
  white: 0xffffff,
} as const;

export class AlpineScene extends Phaser.Scene {
  private readonly worldSeed: string;
  private readonly generator: WorldGenerator;
  private readonly stream: MountainStream;
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
  private debugVisible = false;
  private previousChunk = "";
  private visibleObjects = 0;
  private worldTransitions = 0;

  constructor(seed: string) {
    super("alpine-baseline");
    this.worldSeed = seed;
    this.generator = new WorldGenerator(seed);
    this.stream = new MountainStream(this.generator);
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
    this.debugVisible =
      new URLSearchParams(window.location.search).get("debug") === "1";
    this.setPointerSteering(pointerFromUrl);
    const pointerToggle =
      document.querySelector<HTMLButtonElement>("#pointer-toggle");
    pointerToggle?.addEventListener("click", () =>
      this.setPointerSteering(!(this.inputAdapter?.isPointerEnabled ?? false)),
    );
    const debugToggle = document.querySelector<HTMLButtonElement>(
      "#world-debug-toggle",
    );
    debugToggle?.addEventListener("click", () =>
      this.setDebugVisible(!this.debugVisible),
    );

    const player = this.simulation.getSnapshot();
    this.refreshWorldStream(player);
    const stream = this.stream.getSnapshot();
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
      settings: {
        debugVisible: this.debugVisible,
        pointerSteeringEnabled: pointerFromUrl,
      },
      telemetry: {
        droppedSeconds: 0,
        fixedSteps: 0,
        inputEvents: this.inputEvents,
        playerEvents: this.playerEvents,
        renderFrames: 0,
        samples: this.samples,
        worldTransitions: 0,
      },
      world: {
        activeChunks: stream.activeKeys.length,
        aheadRows: stream.aheadRows,
        cachedChunks: stream.cachedKeys.length,
        chunkSizeMeters: CHUNK_SIZE_METERS,
        corridorWidthMeters: CORRIDOR_WIDTH_METERS,
        currentChunk: `${stream.currentX},${stream.currentY}`,
        generatedSignature: hashSeed(
          this.generator.snapshotChunk(stream.currentX, stream.currentY),
        ).toString(16),
        missingRequiredChunks: stream.missingRequiredKeys.length,
        overlaySignature: hashSeed(classicOverlaySignature()).toString(16),
        visibleObjects: 0,
      },
    };
    window.__FREE_SKI__ = this.runtime;
    window.__FREE_SKI_DEBUG__ = {
      runAutomatedDescent: (distanceMeters = 2_100) =>
        this.runAutomatedDescent(distanceMeters),
      setVisible: (visible) => this.setDebugVisible(visible),
    };

    const shell = document.querySelector<HTMLElement>("#game-shell");
    const status = document.querySelector<HTMLElement>("#system-label");
    shell?.setAttribute("data-game-ready", "true");
    if (status) status.textContent = "Alpine systems online";
    this.setDebugVisible(this.debugVisible);
    this.renderState(player);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.inputAdapter?.destroy();
      delete window.__FREE_SKI_DEBUG__;
    });
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
        if (actions.debugPressed) this.setDebugVisible(!this.debugVisible);
        this.simulation.step(actions.player, deltaSeconds);
        this.fixedSteps += 1;
        this.capturePlayerEvents();
        if (this.fixedSteps % 6 === 0) this.captureSample();
      },
    );

    this.droppedSeconds += result.droppedSeconds;
    this.renderFrames += 1;
    const player = this.simulation.getSnapshot();
    this.refreshWorldStream(player);
    this.renderState(player);
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
    this.drawWorld(player, width, height);
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

  private drawWorld(
    player: PlayerSnapshot,
    width: number,
    height: number,
  ): void {
    if (!this.background) return;
    this.drawClassicCourses(player, width, height);
    this.drawClassicLift(player, width, height);
    this.visibleObjects = 0;
    for (const chunk of this.stream.getActiveChunks()) {
      for (const object of chunk.objects) {
        const [screenX, screenY] = this.toScreen(object.x, object.y, player);
        if (
          screenX < -28 ||
          screenX > width + 28 ||
          screenY < -28 ||
          screenY > height + 28
        ) {
          continue;
        }
        this.visibleObjects += 1;
        this.drawGeneratedObject(object, screenX, screenY);
      }
    }
    this.drawYetiBoundary(player, width, height);
    if (this.debugVisible) this.drawWorldDiagnostics(player, width, height);
  }

  private drawClassicCourses(
    player: PlayerSnapshot,
    width: number,
    height: number,
  ): void {
    if (!this.background) return;
    for (const course of CLASSIC_COURSES) {
      const [left, startY] = this.toScreen(
        course.centerX - course.halfWidth,
        course.startGate.y,
        player,
      );
      const [right, finishY] = this.toScreen(
        course.centerX + course.halfWidth,
        course.finishGate.y,
        player,
      );
      if (
        finishY >= -30 &&
        startY <= height + 30 &&
        right >= 0 &&
        left <= width
      ) {
        const courseColor =
          course.id === "slalom"
            ? COLORS.signal
            : course.id === "tree-slalom"
              ? COLORS.spruce
              : COLORS.blueSuit;
        this.background.fillStyle(courseColor, 0.045);
        this.background.fillRect(left, startY, right - left, finishY - startY);
        this.background.lineStyle(1, courseColor, 0.17);
        this.background.lineBetween(left, startY, left, finishY);
        this.background.lineBetween(right, startY, right, finishY);
      }
      this.drawCourseGate(
        course.startGate.leftX,
        course.startGate.rightX,
        course.startGate.y,
        COLORS.ink,
        player,
        width,
        height,
      );
      this.drawCourseGate(
        course.finishGate.leftX,
        course.finishGate.rightX,
        course.finishGate.y,
        COLORS.signal,
        player,
        width,
        height,
      );
      for (const marker of course.markers) {
        const [x, y] = this.toScreen(marker.x, marker.y, player);
        if (x < -20 || x > width + 20 || y < -25 || y > height + 25) continue;
        const color = marker.color === "red" ? COLORS.signal : COLORS.blueSuit;
        this.background.lineStyle(2, COLORS.ink, 0.38);
        this.background.lineBetween(x, y - 10, x, y + 9);
        this.background.fillStyle(color, 0.92);
        this.background.fillTriangle(x, y - 10, x + 10, y - 6, x, y - 2);
      }
    }
  }

  private drawCourseGate(
    leftX: number,
    rightX: number,
    worldY: number,
    color: number,
    player: PlayerSnapshot,
    width: number,
    height: number,
  ): void {
    if (!this.background) return;
    const [left, y] = this.toScreen(leftX, worldY, player);
    const [right] = this.toScreen(rightX, worldY, player);
    if (right < -20 || left > width + 20 || y < -20 || y > height + 20) return;
    this.background.lineStyle(2, COLORS.ink, 0.48);
    this.background.lineBetween(left, y - 13, left, y + 10);
    this.background.lineBetween(right, y - 13, right, y + 10);
    this.background.lineStyle(2, color, 0.75);
    this.background.lineBetween(left, y - 13, right, y - 13);
    this.background.fillStyle(color, 0.9);
    this.background.fillTriangle(left, y - 13, left + 11, y - 8, left, y - 3);
    this.background.fillTriangle(
      right,
      y - 13,
      right - 11,
      y - 8,
      right,
      y - 3,
    );
  }

  private drawClassicLift(
    player: PlayerSnapshot,
    width: number,
    height: number,
  ): void {
    if (!this.background) return;
    const [cableX, topY] = this.toScreen(CLASSIC_LIFT.towerX, -64, player);
    const [, bottomY] = this.toScreen(CLASSIC_LIFT.towerX, 1_472, player);
    if (
      cableX >= -30 &&
      cableX <= width + 30 &&
      bottomY >= -30 &&
      topY <= height + 30
    ) {
      this.background.lineStyle(1, COLORS.ink, 0.35);
      this.background.lineBetween(cableX - 5, topY, cableX - 5, bottomY);
      this.background.lineBetween(cableX + 5, topY, cableX + 5, bottomY);
    }
    for (const tower of CLASSIC_LIFT.towers) {
      const [x, y] = this.toScreen(tower.x, tower.y, player);
      if (x < -30 || x > width + 30 || y < -30 || y > height + 30) continue;
      this.background.lineStyle(3, COLORS.ink, 0.62);
      this.background.lineBetween(x, y - 14, x, y + 15);
      this.background.lineBetween(x - 12, y - 12, x + 12, y - 12);
      this.background.lineStyle(2, COLORS.signal, 0.75);
      this.background.lineBetween(x - 9, y + 14, x + 9, y + 14);
    }
    for (const chair of CLASSIC_LIFT.chairs) {
      for (let y = -64 + chair.phaseY; y <= 1_472; y += 128) {
        const [x, screenY] = this.toScreen(chair.laneX, y, player);
        if (x < -20 || x > width + 20 || screenY < -20 || screenY > height + 20)
          continue;
        this.background.lineStyle(1, COLORS.ink, 0.5);
        this.background.lineBetween(x, screenY - 8, x, screenY + 2);
        this.background.lineStyle(2, COLORS.blueSuit, 0.8);
        this.background.lineBetween(x - 5, screenY + 2, x + 5, screenY + 2);
        this.background.lineBetween(x - 5, screenY + 2, x - 5, screenY + 7);
      }
    }
  }

  private drawGeneratedObject(
    object: GeneratedObject,
    x: number,
    y: number,
  ): void {
    if (!this.background) return;
    const scale = Math.max(0.75, object.footprintRadius * 0.75);
    if (object.type === "tree" || object.type === "walking-tree") {
      this.background.fillStyle(COLORS.ink, 0.2);
      this.background.fillEllipse(x + 2, y + 8, 14 * scale, 5 * scale);
      this.background.fillStyle(0x5d3c2d, 0.9);
      this.background.fillRect(x - 2, y, 4, 10 * scale);
      this.background.fillStyle(
        object.type === "walking-tree" ? COLORS.blueSuit : COLORS.spruce,
        0.95,
      );
      this.background.fillTriangle(
        x,
        y - 13 * scale,
        x - 9 * scale,
        y + 4,
        x + 9 * scale,
        y + 4,
      );
      return;
    }
    if (object.type === "rock" || object.type === "stump") {
      this.background.fillStyle(
        object.type === "rock" ? COLORS.stone : 0x79513a,
        0.9,
      );
      this.background.fillTriangle(
        x - 7 * scale,
        y + 5,
        x,
        y - 6 * scale,
        x + 8 * scale,
        y + 5,
      );
      return;
    }
    if (object.type === "ramp") {
      this.background.fillStyle(COLORS.blueSuit, 0.23);
      this.background.fillTriangle(x - 11, y + 7, x + 10, y - 7, x + 10, y + 7);
      this.background.lineStyle(2, COLORS.blueSuit, 0.72);
      this.background.lineBetween(x - 11, y + 7, x + 10, y - 7);
      return;
    }
    if (
      object.type === "bump-small" ||
      object.type === "bump-large" ||
      object.type === "mogul"
    ) {
      this.background.fillStyle(COLORS.glacierShadow, 0.8);
      this.background.fillEllipse(x, y + 2, 12 * scale, 6 * scale);
      this.background.lineStyle(1, COLORS.ink, 0.22);
      this.background.strokeEllipse(x, y, 12 * scale, 6 * scale);
      return;
    }
    this.background.fillStyle(
      object.type === "dog" ? 0xb96d35 : COLORS.signal,
      0.9,
    );
    this.background.fillCircle(x, y, object.type === "dog" ? 4 : 5);
    this.background.lineStyle(2, COLORS.ink, 0.55);
    this.background.lineBetween(x - 4, y + 5, x - 6, y + 10);
    this.background.lineBetween(x + 4, y + 5, x + 6, y + 10);
  }

  private drawYetiBoundary(
    player: PlayerSnapshot,
    width: number,
    height: number,
  ): void {
    if (!this.background) return;
    const [, bottomY] = this.toScreen(0, 2_000, player);
    if (bottomY >= -20 && bottomY <= height + 20) {
      this.background.lineStyle(4, COLORS.signal, 0.7);
      this.background.lineBetween(0, bottomY, width, bottomY);
    }
  }

  private drawWorldDiagnostics(
    player: PlayerSnapshot,
    width: number,
    height: number,
  ): void {
    if (!this.background) return;
    this.background.lineStyle(1, COLORS.signal, 0.34);
    for (const chunk of this.stream.getActiveChunks()) {
      const [left, top] = this.toScreen(
        chunk.bounds.minX,
        chunk.bounds.minY,
        player,
      );
      const [right, bottom] = this.toScreen(
        chunk.bounds.maxX,
        chunk.bounds.maxY,
        player,
      );
      if (right < 0 || left > width || bottom < 0 || top > height) continue;
      this.background.strokeRect(left, top, right - left, bottom - top);
    }
    const topWorldY =
      player.worldY - (height * PLAYER_SCREEN_RATIO) / PIXELS_PER_METER;
    const bottomWorldY =
      player.worldY + (height * (1 - PLAYER_SCREEN_RATIO)) / PIXELS_PER_METER;
    const leftEdge: Phaser.Geom.Point[] = [];
    const rightEdge: Phaser.Geom.Point[] = [];
    for (let y = topWorldY; y <= bottomWorldY + 4; y += 4) {
      const center = corridorCenterX(this.worldSeed, y);
      const halfWidth = CORRIDOR_WIDTH_METERS / 2;
      const [left, screenY] = this.toScreen(center - halfWidth, y, player);
      const [right] = this.toScreen(center + halfWidth, y, player);
      leftEdge.push(new Phaser.Geom.Point(left, screenY));
      rightEdge.push(new Phaser.Geom.Point(right, screenY));
    }
    this.background.lineStyle(2, 0x3dbfa6, 0.72);
    this.background.strokePoints(leftEdge, false, false);
    this.background.strokePoints(rightEdge, false, false);
  }

  private toScreen(
    worldX: number,
    worldY: number,
    player: PlayerSnapshot,
  ): [number, number] {
    return [
      this.scale.width * 0.5 + (worldX - player.worldX) * PIXELS_PER_METER,
      this.scale.height * PLAYER_SCREEN_RATIO +
        (worldY - player.worldY) * PIXELS_PER_METER,
    ];
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
    const stream = this.stream.getSnapshot();
    this.runtime.player = player;
    this.runtime.camera.playerScreenX = this.scale.width * 0.5;
    this.runtime.camera.playerScreenY = this.scale.height * PLAYER_SCREEN_RATIO;
    this.runtime.settings.pointerSteeringEnabled =
      this.inputAdapter?.isPointerEnabled ?? false;
    this.runtime.telemetry.droppedSeconds = this.droppedSeconds;
    this.runtime.telemetry.fixedSteps = this.fixedSteps;
    this.runtime.telemetry.renderFrames = this.renderFrames;
    this.runtime.telemetry.worldTransitions = this.worldTransitions;
    this.runtime.world.activeChunks = stream.activeKeys.length;
    this.runtime.world.aheadRows = stream.aheadRows;
    this.runtime.world.cachedChunks = stream.cachedKeys.length;
    const currentChunk = `${stream.currentX},${stream.currentY}`;
    if (currentChunk !== this.runtime.world.currentChunk) {
      this.runtime.world.currentChunk = currentChunk;
      this.runtime.world.generatedSignature = hashSeed(
        this.generator.snapshotChunk(stream.currentX, stream.currentY),
      ).toString(16);
    }
    this.runtime.world.missingRequiredChunks =
      stream.missingRequiredKeys.length;
    this.runtime.world.visibleObjects = this.visibleObjects;

    const chunk = document.querySelector<HTMLElement>("#world-debug-chunk");
    const streamLabel = document.querySelector<HTMLElement>(
      "#world-debug-stream",
    );
    const ahead = document.querySelector<HTMLElement>("#world-debug-ahead");
    if (chunk)
      chunk.textContent = `CHUNK ${stream.currentX},${stream.currentY}`;
    if (streamLabel) {
      streamLabel.textContent = `ACTIVE ${stream.activeKeys.length} · CACHE ${stream.cachedKeys.length} · OBJ ${this.visibleObjects}`;
    }
    if (ahead) {
      ahead.textContent = `AHEAD ${stream.aheadRows.join("/")} · CORRIDOR ${CORRIDOR_WIDTH_METERS.toFixed(1)}M`;
    }
  }

  private refreshWorldStream(player: PlayerSnapshot): void {
    const snapshot = this.stream.update({
      velocityY: player.velocityY,
      viewportWidthMeters: this.scale.width / PIXELS_PER_METER,
      worldX: player.worldX,
      worldY: player.worldY,
    });
    const currentChunk = `${snapshot.currentX},${snapshot.currentY}`;
    if (currentChunk !== this.previousChunk) {
      this.previousChunk = currentChunk;
      this.worldTransitions += 1;
    }
  }

  private setDebugVisible(visible: boolean): void {
    this.debugVisible = visible;
    const panel = document.querySelector<HTMLElement>("#world-debug");
    const button = document.querySelector<HTMLButtonElement>(
      "#world-debug-toggle",
    );
    if (panel) panel.hidden = !visible;
    button?.setAttribute("aria-pressed", visible.toString());
    if (button) button.textContent = visible ? "GRID ON" : "WORLD GRID";
    if (this.runtime) this.runtime.settings.debugVisible = visible;
  }

  private runAutomatedDescent(distanceMeters: number): DescentAuditReport {
    const target = Number.isFinite(distanceMeters)
      ? Math.max(64, Math.min(10_000, distanceMeters))
      : 2_100;
    const simulation = new PlayerSimulation();
    simulation.toggleTurbo();
    const stream = new MountainStream(new WorldGenerator(this.worldSeed));
    const visitedRows = new Set<number>();
    const corridorBlockers = new Set<string>();
    let missingChunks = 0;
    let fixedSteps = 0;

    while (simulation.getSnapshot().worldY < target && fixedSteps < 60_000) {
      simulation.step(
        { ...NEUTRAL_PLAYER_INPUT, tuck: true },
        SIMULATION_STEP_SECONDS,
      );
      fixedSteps += 1;
      const player = simulation.getSnapshot();
      const snapshot = stream.update({
        velocityY: player.velocityY,
        viewportWidthMeters: this.scale.width / PIXELS_PER_METER,
        worldX: player.worldX,
        worldY: player.worldY,
      });
      visitedRows.add(snapshot.currentY);
      missingChunks += snapshot.missingRequiredKeys.length;
      for (const chunk of stream.getActiveChunks()) {
        for (const object of chunk.objects) {
          if (
            isBlockingType(object.type) &&
            blocksGuaranteedCorridor(
              this.worldSeed,
              object,
              object.footprintRadius,
            )
          ) {
            corridorBlockers.add(object.id);
          }
        }
      }
    }
    const endY = simulation.getSnapshot().worldY;
    return {
      corridorBlockers: corridorBlockers.size,
      endY,
      fixedSteps,
      missingChunks,
      passed:
        endY >= target && missingChunks === 0 && corridorBlockers.size === 0,
      visitedRows: visitedRows.size,
    };
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
