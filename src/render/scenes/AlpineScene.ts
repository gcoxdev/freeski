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
  SlopeInteractionSimulation,
  type FeedbackEvent,
  type InteractionEvent,
  type InteractiveWorldObject,
} from "../../simulation/slopeInteractions";
import type { StyleEvent } from "../../simulation/style";
import {
  LivingSlopeSimulation,
  type LivingActorEvent,
  type LivingActorSnapshot,
  type LivingSlopeRamp,
} from "../../simulation/livingSlope";
import {
  YetiSimulation,
  type YetiControllerSnapshot,
  type YetiEvent,
} from "../../simulation/yeti";
import {
  MountainModeSimulation,
  type EventModeId,
  type MarkerState,
  type ModeEvent,
} from "../../simulation/modes";
import {
  addRecord,
  bucketForSeed,
  emptyRecordBook,
  recordFromResult,
  type RecordBook,
} from "../../simulation/recordBook";
import type { ObjectDelta } from "../../world/chunkDeltas";
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
import { interactionFor } from "../../world/interactionCatalog";
import { MountainStream } from "../../world/mountainStream";
import { hashSeed } from "../../world/seed";
import { CHUNK_SIZE_METERS } from "../../world/types";
import { LocalRecordStorage } from "../localRecordStorage";
import type {
  CourseCrossingTarget,
  DescentAuditReport,
  FreeSkiRuntime,
  GateFiveScenario,
  GateThreeScenario,
  TelemetrySample,
} from "../runtimeBridge";

const PLAYER_SCREEN_RATIO = 0.35;
const PIXELS_PER_METER = 7.5;
const MAX_TELEMETRY_EVENTS = 240;
const MAX_TELEMETRY_SAMPLES = 600;
const FEEDBACK_VISIBLE_SECONDS = 1.15;

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
  private readonly interactions = new SlopeInteractionSimulation("modern");
  private readonly modes = new MountainModeSimulation();
  private readonly livingSlope: LivingSlopeSimulation;
  private readonly yeti = new YetiSimulation();
  private background?: Phaser.GameObjects.Graphics;
  private skier?: Phaser.GameObjects.Container;
  private skierShadow?: Phaser.GameObjects.Ellipse;
  private locationLabel?: Phaser.GameObjects.Text;
  private runLabel?: Phaser.GameObjects.Text;
  private inputAdapter?: BrowserInputAdapter;
  private runtime?: FreeSkiRuntime;
  private readonly inputEvents: InputTelemetryEvent[] = [];
  private readonly playerEvents: PlayerEvent[] = [];
  private readonly interactionEvents: InteractionEvent[] = [];
  private readonly feedbackEvents: FeedbackEvent[] = [];
  private readonly styleEvents: StyleEvent[] = [];
  private readonly modeEvents: ModeEvent[] = [];
  private readonly livingEvents: LivingActorEvent[] = [];
  private readonly yetiEvents: YetiEvent[] = [];
  private readonly samples: TelemetrySample[] = [];
  private scenario: GateThreeScenario = "none";
  private livingScenario: GateFiveScenario = "none";
  private scenarioObjects: InteractiveWorldObject[] = [];
  private readonly yellowSnowLocations = new Map<
    string,
    Readonly<{ x: number; y: number }>
  >();
  private feedbackVisibleUntil = 0;
  private feedbackPriorityUntil = 0;
  private trainingMode = false;
  private courseTestMode = false;
  private recordBook: RecordBook = emptyRecordBook();
  private recordStorage?: LocalRecordStorage;
  private storageAvailable = true;
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
    this.livingSlope = new LivingSlopeSimulation(seed);
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
    this.trainingMode =
      new URLSearchParams(window.location.search).get("training") === "1";
    this.courseTestMode =
      new URLSearchParams(window.location.search).get("courseTest") === "1";
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
    this.modes.syncPosition({
      simulationSeconds: player.simulationSeconds,
      style: this.interactions.getSnapshot().style,
      worldX: player.worldX,
      worldY: player.worldY,
    });
    try {
      this.recordStorage = new LocalRecordStorage(window.localStorage);
      this.recordBook = this.recordStorage.load();
    } catch {
      this.storageAvailable = false;
      this.recordBook = emptyRecordBook();
    }
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
      interactions: {
        deltas: this.interactions.deltas.snapshot(),
        feedbackEvents: this.feedbackEvents,
        interactionEvents: this.interactionEvents,
        scenario: this.scenario,
        snapshot: this.interactions.getSnapshot(),
        styleEvents: this.styleEvents,
      },
      lastInput: "none",
      livingSlope: {
        events: this.livingEvents,
        scenario: this.livingScenario,
        snapshot: this.livingSlope.getSnapshot(),
      },
      modes: {
        events: this.modeEvents,
        records: this.recordBook,
        snapshot: this.modes.getSnapshot(),
        storageAvailable: this.storageAvailable,
      },
      player,
      ready: true,
      seed: this.worldSeed,
      seedHash: hashSeed(this.worldSeed),
      settings: {
        debugVisible: this.debugVisible,
        pointerSteeringEnabled: pointerFromUrl,
        trainingMode: this.trainingMode,
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
      yeti: {
        events: this.yetiEvents,
        snapshot: this.yeti.getSnapshot(player.worldY),
      },
    };
    window.__FREE_SKI__ = this.runtime;
    window.__FREE_SKI_DEBUG__ = {
      runAutomatedDescent: (distanceMeters = 2_100) =>
        this.runAutomatedDescent(distanceMeters),
      stageInteractionScenario: (scenario) =>
        this.stageInteractionScenario(scenario),
      stageCourseCrossing: (mode, target, outcome = "correct") =>
        this.stageCourseCrossing(mode, target, outcome),
      stageLivingScenario: (scenario) => this.stageLivingScenario(scenario),
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

        if (actions.resetPressed) {
          this.simulation.reset();
          this.interactions.reset();
          this.modes.reset();
          this.livingSlope.reset(this.worldSeed);
          this.yeti.reset();
          this.scenario = "none";
          this.livingScenario = "none";
          this.scenarioObjects = [];
          this.yellowSnowLocations.clear();
        }
        if (actions.pausePressed) this.simulation.togglePause();
        if (actions.turboPressed) this.simulation.toggleTurbo();
        if (actions.debugPressed) this.setDebugVisible(!this.debugVisible);
        const captureBeforeStep = this.yeti.getSnapshot(
          this.simulation.getSnapshot().worldY,
        );
        const playerInput = captureBeforeStep.capturedBy
          ? NEUTRAL_PLAYER_INPUT
          : actions.player;
        this.simulation.step(playerInput, deltaSeconds);
        if (captureBeforeStep.playerRemoved)
          this.simulation.applySpeedMultiplier(0);
        if (!captureBeforeStep.capturedBy) {
          this.interactions.step(
            this.simulation,
            actions.player,
            this.getInteractiveObjects(),
            deltaSeconds,
          );
        }
        const player = this.simulation.getSnapshot();
        if (!captureBeforeStep.capturedBy) {
          this.modes.step({
            simulationSeconds: player.simulationSeconds,
            style: this.interactions.getSnapshot().style,
            worldX: player.worldX,
            worldY: player.worldY,
          });
        }
        this.livingSlope.step(player, deltaSeconds, this.getLivingSlopeRamps());
        this.yeti.step(player, deltaSeconds);
        this.fixedSteps += 1;
        this.capturePlayerEvents();
        this.captureInteractionEvents();
        this.captureModeEvents();
        this.captureLivingEvents();
        this.captureYetiEvents();
        if (this.yeti.getSnapshot(player.worldY).resetRequested)
          this.resetAfterYetiCapture();
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
    this.drawForeshadow(player, width, height);
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

  private drawForeshadow(
    player: PlayerSnapshot,
    width: number,
    height: number,
  ): void {
    if (!this.background) return;
    const foreshadow = this.yeti.getSnapshot(player.worldY).foreshadow;
    if (foreshadow.intensity <= 0) return;
    this.background.fillStyle(0x5f7d89, foreshadow.intensity * 0.09);
    this.background.fillRect(0, 0, width, height);
    this.background.lineStyle(
      1,
      COLORS.white,
      0.18 + foreshadow.intensity * 0.3,
    );
    const phase = Math.floor(player.worldY * 2.5);
    for (let index = 0; index < foreshadow.windStreaks; index += 1) {
      const x = ((phase * 17 + index * 149) % (width + 160)) - 80;
      const y = (phase * 7 + index * 83) % Math.max(1, height);
      const length = 30 + index * 5;
      this.background.lineBetween(x, y, x + length, y - 9);
    }
    if (foreshadow.breathMist > 0.1) {
      const anchorY = height * PLAYER_SCREEN_RATIO;
      this.background.fillStyle(COLORS.white, foreshadow.breathMist * 0.16);
      this.background.fillEllipse(width * 0.5 + 17, anchorY - 18, 26, 9);
    }
  }

  private drawLivingSlope(
    player: PlayerSnapshot,
    width: number,
    height: number,
  ): void {
    if (!this.background) return;
    for (const location of this.yellowSnowLocations.values()) {
      const [x, y] = this.toScreen(location.x, location.y, player);
      if (x < -20 || x > width + 20 || y < -20 || y > height + 20) continue;
      this.background.fillStyle(0xd8bd3d, 0.48);
      this.background.fillEllipse(x, y + 4, 17, 6);
    }
    for (const actor of this.livingSlope.getSnapshot().actors) {
      if (!actor.active) continue;
      const [x, y] = this.toScreen(actor.worldX, actor.worldY, player);
      if (x < -40 || x > width + 40 || y < -45 || y > height + 45) continue;
      this.visibleObjects += 1;
      this.drawLivingActor(actor, x, y);
    }
  }

  private drawLivingActor(
    actor: Readonly<LivingActorSnapshot>,
    x: number,
    y: number,
  ): void {
    if (!this.background) return;
    this.background.fillStyle(COLORS.ink, 0.15);
    this.background.fillEllipse(
      x + 2,
      y + 7,
      actor.kind === "chairlift" ? 18 : 14,
      5,
    );
    if (actor.kind === "chairlift") {
      this.background.lineStyle(1, COLORS.ink, 0.58);
      this.background.lineBetween(x, y - 9, x, y + 2);
      this.background.lineStyle(2, COLORS.blueSuit, 0.86);
      this.background.lineBetween(x - 7, y + 2, x + 7, y + 2);
      this.background.lineBetween(x - 7, y + 2, x - 7, y + 7);
      for (let rider = 0; rider < actor.riderCount; rider += 1) {
        this.background.fillStyle(
          rider === 0 ? COLORS.signal : COLORS.skiYellow,
          0.95,
        );
        this.background.fillCircle(x - 3 + rider * 7, y, 3);
      }
      return;
    }
    if (actor.kind === "beginner") {
      const fallen = actor.state.startsWith("fallen");
      this.background.lineStyle(2, COLORS.skiYellow, 0.9);
      if (fallen) {
        this.background.lineBetween(x - 12, y + 5, x + 12, y - 3);
        this.background.fillStyle(COLORS.signal, 0.95);
        this.background.fillRoundedRect(x - 7, y - 3, 15, 7, 3);
        this.background.fillCircle(x + 10, y - 1, 4);
      } else {
        this.background.lineBetween(x - 6, y - 5, x - 7, y + 13);
        this.background.lineBetween(x + 6, y - 5, x + 7, y + 13);
        this.background.fillStyle(COLORS.signal, 0.95);
        this.background.fillRoundedRect(x - 6, y - 8, 12, 16, 4);
        this.background.fillStyle(0xf3c6a2, 1);
        this.background.fillCircle(x, y - 12, 4);
      }
      return;
    }
    if (actor.kind === "snowboarder") {
      const tumble = actor.state.startsWith("tumbling");
      const jump = actor.state === "jumping";
      this.background.lineStyle(3, COLORS.signal, 0.95);
      this.background.lineBetween(x - 12, y + 8, x + 12, y + (tumble ? -4 : 6));
      this.background.fillStyle(0x263f4c, 0.98);
      if (tumble) this.background.fillEllipse(x, y - 2, 18, 9);
      else
        this.background.fillRoundedRect(x - 6, y - (jump ? 15 : 10), 12, 17, 4);
      this.background.fillStyle(COLORS.skiYellow, 0.95);
      this.background.fillCircle(x + (tumble ? 8 : 0), y - (jump ? 18 : 12), 4);
      return;
    }
    if (actor.kind === "dog") {
      if (actor.state === "knocked") {
        this.background.fillStyle(0x6e7777, 0.95);
        this.background.fillEllipse(x, y + 1, 17, 7);
      } else {
        this.background.fillStyle(0x7c8584, 0.96);
        this.background.fillRoundedRect(x - 8, y - 4, 15, 8, 3);
        this.background.fillCircle(
          x + (actor.direction < 0 ? -9 : 9),
          y - 5,
          4,
        );
        this.background.lineStyle(2, COLORS.ink, 0.7);
        this.background.lineBetween(x - 5, y + 3, x - 7, y + 9);
        this.background.lineBetween(x + 5, y + 3, x + 7, y + 9);
      }
      return;
    }
    this.background.fillStyle(0x5d3c2d, 0.95);
    this.background.fillRect(x - 3, y - 3, 6, 15);
    this.background.lineStyle(3, 0x5d3c2d, 0.9);
    const stride = actor.state.startsWith("walking")
      ? Math.sin(actor.stateSeconds * 14) * 5
      : 2;
    this.background.lineBetween(x - 1, y + 9, x - 7 - stride, y + 15);
    this.background.lineBetween(x + 1, y + 9, x + 7 + stride, y + 15);
    this.background.fillStyle(COLORS.spruce, 0.96);
    this.background.fillTriangle(x, y - 20, x - 13, y + 4, x + 13, y + 4);
  }

  private drawYetis(
    player: PlayerSnapshot,
    width: number,
    height: number,
  ): void {
    if (!this.background) return;
    for (const controller of this.yeti.getSnapshot(player.worldY).controllers) {
      if (!controller.active) continue;
      const [x, y] = this.toScreen(
        controller.worldX,
        controller.worldY,
        player,
      );
      if (x < -70 || x > width + 70 || y < -80 || y > height + 80) continue;
      this.visibleObjects += 1;
      this.drawYeti(controller, x, y);
    }
  }

  private drawYeti(
    controller: Readonly<YetiControllerSnapshot>,
    x: number,
    y: number,
  ): void {
    if (!this.background) return;
    const pouncing =
      controller.state === "pounce" || controller.state === "grab";
    const chewing = controller.state === "eat" || controller.state === "chew";
    const pulse = Math.sin(controller.stateSeconds * 16) * 2;
    this.background.fillStyle(COLORS.ink, 0.22);
    this.background.fillEllipse(x + 3, y + 16, 34 + pulse, 10);
    this.background.lineStyle(3, 0x58717a, 0.9);
    this.background.strokeEllipse(
      x,
      y,
      pouncing ? 38 : 31,
      chewing ? 34 + pulse : 40,
    );
    this.background.fillStyle(0xdce7e4, 0.98);
    this.background.fillEllipse(
      x,
      y,
      pouncing ? 38 : 31,
      chewing ? 34 + pulse : 40,
    );
    this.background.fillCircle(x, y - 16, 13);
    this.background.fillTriangle(x - 10, y - 22, x - 5, y - 32, x, y - 22);
    this.background.fillTriangle(x + 10, y - 22, x + 5, y - 32, x, y - 22);
    this.background.lineStyle(10, 0x58717a, 0.72);
    this.background.lineBetween(x - 12, y - 2, x - 23, y + (pouncing ? -8 : 7));
    this.background.lineBetween(x + 12, y - 2, x + 23, y + (pouncing ? -8 : 7));
    this.background.lineStyle(6, 0xdce7e4, 0.98);
    this.background.lineBetween(x - 12, y - 2, x - 23, y + (pouncing ? -8 : 7));
    this.background.lineBetween(x + 12, y - 2, x + 23, y + (pouncing ? -8 : 7));
    this.background.fillStyle(COLORS.ink, 0.95);
    this.background.fillCircle(x - 5, y - 18, 2);
    this.background.fillCircle(x + 5, y - 18, 2);
    this.background.fillStyle(chewing ? COLORS.signal : 0x58717a, 0.96);
    this.background.fillEllipse(x, y - 10, chewing ? 12 : 8, chewing ? 7 : 4);
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
        const delta = this.interactions.deltas.get(object.id);
        if (delta?.consumed || delta?.destroyed) continue;
        const [screenX, screenY] = this.toScreen(
          object.x + (delta?.offsetX ?? 0),
          object.y,
          player,
        );
        if (
          screenX < -28 ||
          screenX > width + 28 ||
          screenY < -28 ||
          screenY > height + 28
        ) {
          continue;
        }
        this.visibleObjects += 1;
        this.drawInteractiveObject(object, screenX, screenY, delta);
      }
    }
    for (const object of this.scenarioObjects) {
      const delta = this.interactions.deltas.get(object.id);
      if (delta?.consumed || delta?.destroyed) continue;
      const [screenX, screenY] = this.toScreen(
        object.x + (delta?.offsetX ?? 0),
        object.y,
        player,
      );
      if (
        screenX < -50 ||
        screenX > width + 50 ||
        screenY < -50 ||
        screenY > height + 50
      )
        continue;
      this.visibleObjects += 1;
      this.drawInteractiveObject(object, screenX, screenY, delta);
    }
    this.drawLivingSlope(player, width, height);
    this.drawYetis(player, width, height);
    this.drawYetiBoundary(player, width, height);
    this.drawInteractionFeedback(player);
    if (this.debugVisible) {
      this.drawWorldDiagnostics(player, width, height);
      this.drawCollisionFootprints(player, width, height);
    }
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
      const modeRun =
        this.modes.getSnapshot().courses[course.id as EventModeId];
      for (const marker of course.markers) {
        const [x, y] = this.toScreen(marker.x, marker.y, player);
        if (x < -20 || x > width + 20 || y < -25 || y > height + 25) continue;
        const markerState =
          modeRun?.markers[marker.index - 1]?.state ?? "pending";
        const color =
          markerState === "correct"
            ? 0x3dbfa6
            : markerState === "wrong-side" || markerState === "missed"
              ? COLORS.stone
              : marker.color === "red"
                ? COLORS.signal
                : COLORS.blueSuit;
        this.background.lineStyle(2, COLORS.ink, 0.38);
        this.background.lineBetween(x, y - 10, x, y + 9);
        this.background.fillStyle(color, 0.92);
        this.background.fillTriangle(x, y - 10, x + 10, y - 6, x, y - 2);
        if (markerState !== "pending") {
          this.background.lineStyle(
            2,
            markerState === "correct" ? 0x174f45 : COLORS.signal,
            0.9,
          );
          if (markerState === "correct") {
            this.background.lineBetween(x - 5, y + 2, x - 1, y + 6);
            this.background.lineBetween(x - 1, y + 6, x + 6, y - 4);
          } else {
            this.background.lineBetween(x - 5, y - 4, x + 5, y + 6);
            this.background.lineBetween(x + 5, y - 4, x - 5, y + 6);
          }
        }
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
  }

  private drawInteractiveObject(
    object: Pick<
      InteractiveWorldObject,
      "id" | "interaction" | "type" | "variant" | "x" | "y"
    >,
    x: number,
    y: number,
    delta?: Readonly<ObjectDelta>,
  ): void {
    if (!this.background) return;
    const scale = Math.max(0.75, object.interaction.footprint.radius * 0.75);
    if (delta?.form === "mushroom") {
      this.background.fillStyle(0xf7f0d8, 1);
      this.background.fillRect(x - 2, y, 4, 7);
      this.background.fillStyle(COLORS.signal, 0.96);
      this.background.fillEllipse(x, y - 1, 16, 9);
      this.background.fillStyle(COLORS.powder, 0.92);
      this.background.fillCircle(x - 4, y - 2, 1.5);
      this.background.fillCircle(x + 3, y, 1.5);
      return;
    }
    if (object.type === "tree" || object.type === "walking-tree") {
      this.background.fillStyle(COLORS.ink, 0.2);
      this.background.fillEllipse(x + 2, y + 8, 14 * scale, 5 * scale);
      this.background.fillStyle(0x5d3c2d, 0.9);
      this.background.fillRect(x - 2, y, 4, 10 * scale);
      this.background.fillStyle(
        delta?.burned
          ? COLORS.stone
          : object.variant === "dead-tree"
            ? 0x765443
            : object.type === "walking-tree"
              ? COLORS.blueSuit
              : COLORS.spruce,
        0.95,
      );
      if (object.variant === "dead-tree") {
        this.background.lineStyle(
          3,
          delta?.burned ? COLORS.stone : 0x765443,
          1,
        );
        this.background.lineBetween(x, y + 3, x - 8, y - 11 * scale);
        this.background.lineBetween(x, y - 3, x + 8, y - 13 * scale);
      } else {
        this.background.fillTriangle(
          x,
          y - 13 * scale,
          x - 9 * scale,
          y + 4,
          x + 9 * scale,
          y + 4,
        );
      }
      if (delta?.burning) {
        this.background.fillStyle(0xf5c844, 0.96);
        this.background.fillTriangle(x - 6, y + 4, x, y - 13, x + 6, y + 4);
        this.background.fillStyle(COLORS.signal, 0.92);
        this.background.fillTriangle(x - 4, y + 4, x + 2, y - 8, x + 5, y + 4);
      }
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
    if (object.type === "lift-tower") {
      this.background.lineStyle(4, COLORS.ink, 0.78);
      this.background.lineBetween(x, y - 18, x, y + 14);
      this.background.lineBetween(x - 14, y - 15, x + 14, y - 15);
      this.background.lineStyle(2, COLORS.signal, 0.85);
      this.background.lineBetween(x - 10, y + 13, x + 10, y + 13);
      return;
    }
    if (object.type === "chairlift") {
      this.background.lineStyle(2, COLORS.ink, 0.72);
      this.background.lineBetween(x, y - 10, x, y + 2);
      this.background.lineBetween(x - 7, y + 2, x + 7, y + 2);
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
      object.type === "dog"
        ? delta?.yellowSnow
          ? 0xd9b73d
          : 0xb96d35
        : COLORS.signal,
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

  private drawCollisionFootprints(
    player: PlayerSnapshot,
    width: number,
    height: number,
  ): void {
    if (!this.background) return;
    for (const object of this.getInteractiveObjects()) {
      const delta = this.interactions.deltas.get(object.id);
      if (delta?.consumed || delta?.destroyed) continue;
      const footprint = object.interaction.footprint;
      const [x, y] = this.toScreen(
        object.x + (delta?.offsetX ?? 0) + footprint.offsetX,
        object.y + footprint.offsetY,
        player,
      );
      const radius = footprint.radius * PIXELS_PER_METER;
      if (
        x + radius < 0 ||
        x - radius > width ||
        y + radius < 0 ||
        y - radius > height
      )
        continue;
      this.background.lineStyle(
        2,
        object.interaction.blocksGroundedPlayer ? COLORS.signal : 0x3dbfa6,
        0.82,
      );
      this.background.strokeCircle(x, y, radius);
      this.background.lineStyle(1, COLORS.ink, 0.45);
      this.background.lineBetween(
        x,
        y,
        x,
        y - object.interaction.clearanceHeight * PIXELS_PER_METER,
      );
    }
  }

  private drawInteractionFeedback(player: PlayerSnapshot): void {
    if (!this.background) return;
    const recent = this.feedbackEvents.filter(
      (event) =>
        event.kind === "visual" &&
        player.simulationSeconds - event.atSeconds <= FEEDBACK_VISIBLE_SECONDS,
    );
    for (const [index, event] of recent.entries()) {
      const object = this.getInteractiveObjects().find(
        (candidate) => candidate.id === event.objectId,
      );
      const delta = object
        ? this.interactions.deltas.get(object.id)
        : undefined;
      const [x, y] = object
        ? this.toScreen(object.x + (delta?.offsetX ?? 0), object.y, player)
        : [this.scale.width * 0.5, this.scale.height * PLAYER_SCREEN_RATIO];
      const age = Math.max(0, player.simulationSeconds - event.atSeconds);
      const progress = age / FEEDBACK_VISIBLE_SECONDS;
      const color =
        event.cue.includes("flame") || event.cue.includes("ember")
          ? COLORS.signal
          : event.cue.includes("secret") || event.cue.includes("yellow")
            ? COLORS.skiYellow
            : 0x3dbfa6;
      this.background.lineStyle(3, color, Math.max(0, 0.85 - progress));
      this.background.strokeCircle(x, y - 5, 12 + progress * 34 + index * 3);
      for (let ray = 0; ray < 6; ray += 1) {
        const angle = (ray / 6) * Math.PI * 2;
        const inner = 8 + progress * 12;
        const outer = inner + 8;
        this.background.lineBetween(
          x + Math.cos(angle) * inner,
          y - 5 + Math.sin(angle) * inner,
          x + Math.cos(angle) * outer,
          y - 5 + Math.sin(angle) * outer,
        );
      }
    }
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
    const playerRemoved = this.yeti.getSnapshot(player.worldY).playerRemoved;
    this.skier.setVisible(!playerRemoved);
    this.skierShadow.setVisible(!playerRemoved);
    if (playerRemoved) return;
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
            (player.motion === "airborne"
              ? player.airTilt * 0.45 + player.airSpin
              : 0),
    );
    const skierScale =
      player.motion === "recovering"
        ? 0.88
        : 1 + Math.min(player.airHeight * 0.022, 0.14);
    this.skier.setScale(
      skierScale,
      skierScale *
        (player.motion === "airborne" ? Math.cos(player.airPitch) : 1),
    );
    this.skier.setAlpha(player.motion === "recovering" ? 0.62 : 1);
  }

  private updateHud(player: PlayerSnapshot): void {
    const shell = document.querySelector<HTMLElement>("#game-shell");
    const speed = document.querySelector<HTMLElement>("#speed-label");
    const distance = document.querySelector<HTMLElement>("#distance-label");
    const motion = document.querySelector<HTMLElement>("#motion-label");
    const turbo = document.querySelector<HTMLElement>("#turbo-indicator");
    const style = document.querySelector<HTMLElement>("#style-label");
    const trick = document.querySelector<HTMLElement>("#trick-label");
    const feedback = document.querySelector<HTMLElement>("#feedback-card");
    const pauseCard = document.querySelector<HTMLElement>("#pause-card");
    const status = document.querySelector<HTMLElement>("#system-label");
    const modeName = document.querySelector<HTMLElement>("#mode-name");
    const modeTime = document.querySelector<HTMLElement>("#mode-time");
    const modeMarkers = document.querySelector<HTMLElement>("#mode-markers");
    const modePenalty = document.querySelector<HTMLElement>("#mode-penalty");
    const modeFinal = document.querySelector<HTMLElement>("#mode-final");
    const modeRecord = document.querySelector<HTMLElement>("#mode-record");
    if (speed)
      speed.textContent = Math.round(
        player.speedMetersPerSecond * 3.6,
      ).toString();
    if (distance) distance.textContent = Math.floor(player.worldY).toString();
    if (motion)
      motion.textContent = `${player.motion} / ${player.heading}`.toUpperCase();
    if (turbo) turbo.textContent = player.turbo ? "TURBO ON" : "TURBO OFF";
    const interaction = this.interactions.getSnapshot();
    if (style) style.textContent = interaction.style.toString();
    if (trick)
      trick.textContent =
        interaction.activeTrick === "none"
          ? "LINE READY"
          : interaction.activeTrick.replaceAll("-", " ").toUpperCase();
    if (feedback && player.simulationSeconds > this.feedbackVisibleUntil)
      feedback.hidden = true;
    if (pauseCard) pauseCard.hidden = !player.paused;
    if (status)
      status.textContent = player.paused
        ? "Run suspended"
        : "Alpine systems online";
    const yetiSnapshot = this.yeti.getSnapshot(player.worldY);
    shell?.setAttribute("data-turbo", player.turbo.toString());
    shell?.setAttribute("data-paused", player.paused.toString());
    shell?.setAttribute(
      "data-foreshadow",
      yetiSnapshot.foreshadow.intensity.toFixed(2),
    );
    shell?.setAttribute(
      "data-foreshadowing",
      (yetiSnapshot.foreshadow.intensity > 0).toString(),
    );
    shell?.setAttribute("data-capture-phase", yetiSnapshot.capturePhase);
    const modeSnapshot = this.modes.getSnapshot();
    const lastFinished = [...this.modeEvents]
      .reverse()
      .find((event) => event.type === "mode-finished")?.mode;
    const displayMode = modeSnapshot.activeMode ?? lastFinished ?? null;
    const displayRun = displayMode ? modeSnapshot.courses[displayMode] : null;
    const displayName = displayMode
      ? (CLASSIC_COURSES.find((course) => course.id === displayMode)?.name ??
        displayMode)
      : "OPEN SKIING";
    if (modeName) modeName.textContent = displayName;
    if (modeTime)
      modeTime.textContent = displayRun
        ? `TIME ${displayRun.elapsedSeconds.toFixed(1)}S`
        : "CROSS A START GATE";
    if (modeMarkers)
      modeMarkers.textContent = displayRun?.markers.length
        ? `${displayRun.markers.filter((marker) => marker.state === "correct").length}/${displayRun.markers.length} MARKERS`
        : displayRun
          ? `STYLE ${displayRun.styleEarned}`
          : "3 COURSES OPEN";
    if (modePenalty)
      modePenalty.textContent = `PENALTY +${(displayRun?.penaltySeconds ?? 0).toFixed(1)}S`;
    if (modeFinal)
      modeFinal.textContent = displayRun?.result
        ? displayRun.result.mode === "free-style"
          ? `FINAL STYLE ${displayRun.result.score ?? 0}`
          : `FINAL ${(displayRun.result.adjustedTimeSeconds ?? 0).toFixed(1)}S`
        : displayRun?.lifecycle === "active"
          ? "COURSE LIVE / LEAVE ANY TIME"
          : "NO ACTIVE CLOCK";
    if (modeRecord) {
      const bucket = bucketForSeed(this.worldSeed);
      const leader = displayMode
        ? this.recordBook.buckets[bucket][displayMode][0]
        : undefined;
      const savedRecordCount = Object.values(
        this.recordBook.buckets[bucket],
      ).reduce((total, records) => total + records.length, 0);
      modeRecord.textContent = leader
        ? `${bucket.toUpperCase()} BEST ${leader.value.toFixed(leader.metric === "time" ? 1 : 0)}${leader.metric === "time" ? "S" : ""}`
        : savedRecordCount > 0
          ? `${bucket.toUpperCase()} / ${savedRecordCount} RECORDS SAVED`
          : `${bucket.toUpperCase()} / NO RECORD`;
    }
    shell?.setAttribute("data-mode-state", displayRun?.lifecycle ?? "idle");
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
    this.runtime.interactions.deltas = this.interactions.deltas.snapshot();
    this.runtime.interactions.scenario = this.scenario;
    this.runtime.interactions.snapshot = this.interactions.getSnapshot();
    this.runtime.modes.snapshot = this.modes.getSnapshot();
    this.runtime.modes.records = this.recordBook;
    this.runtime.modes.storageAvailable = this.storageAvailable;
    this.runtime.livingSlope.scenario = this.livingScenario;
    this.runtime.livingSlope.snapshot = this.livingSlope.getSnapshot();
    this.runtime.yeti.snapshot = this.yeti.getSnapshot(player.worldY);

    const chunk = document.querySelector<HTMLElement>("#world-debug-chunk");
    const streamLabel = document.querySelector<HTMLElement>(
      "#world-debug-stream",
    );
    const ahead = document.querySelector<HTMLElement>("#world-debug-ahead");
    const living = document.querySelector<HTMLElement>("#world-debug-living");
    const boundary = document.querySelector<HTMLElement>(
      "#world-debug-boundary",
    );
    if (chunk)
      chunk.textContent = `CHUNK ${stream.currentX},${stream.currentY}`;
    if (streamLabel) {
      streamLabel.textContent = `ACTIVE ${stream.activeKeys.length} · CACHE ${stream.cachedKeys.length} · OBJ ${this.visibleObjects}`;
    }
    if (ahead) {
      ahead.textContent = `AHEAD ${stream.aheadRows.join("/")} · CORRIDOR ${CORRIDOR_WIDTH_METERS.toFixed(1)}M`;
    }
    if (living) {
      const snapshot = this.livingSlope.getSnapshot();
      living.textContent = `POPULATION ${snapshot.actorCount} · WORK ${snapshot.workUnitsLastStep}`;
    }
    if (boundary) {
      const snapshot = this.yeti.getSnapshot(player.worldY);
      boundary.textContent = snapshot.activeBoundaries.length
        ? `BOUNDARY ${snapshot.activeBoundaries.join("/").toUpperCase()} · PHASE ${snapshot.capturePhase.toUpperCase()}`
        : "BOUNDARY CLEAR · PHASE NONE";
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

  private getInteractiveObjects(): readonly InteractiveWorldObject[] {
    if (this.scenario !== "none") return this.scenarioObjects;
    if (this.trainingMode || this.courseTestMode) return [];
    const objects: InteractiveWorldObject[] = [];
    for (const chunk of this.stream.getActiveChunks()) {
      for (const object of chunk.objects) objects.push(object);
    }
    CLASSIC_LIFT.towers.forEach((tower, index) => {
      objects.push({
        id: `lift-tower:${index}`,
        interaction: CLASSIC_LIFT.towerInteraction,
        type: "lift-tower",
        x: tower.x,
        y: tower.y,
      });
    });
    for (const chair of CLASSIC_LIFT.chairs) {
      for (let y = -64 + chair.phaseY; y <= 1_472; y += 128) {
        objects.push({
          id: `chairlift:${chair.laneX}:${y}`,
          interaction: CLASSIC_LIFT.chairInteraction,
          type: "chairlift",
          x: chair.laneX,
          y,
        });
      }
    }
    return objects;
  }

  private getLivingSlopeRamps(): readonly LivingSlopeRamp[] {
    const ramps: LivingSlopeRamp[] = [];
    for (const chunk of this.stream.getActiveChunks()) {
      for (const object of chunk.objects) {
        if (object.type !== "ramp") continue;
        const delta = this.interactions.deltas.get(object.id);
        if (delta?.consumed || delta?.destroyed) continue;
        ramps.push({
          footprintRadius: object.interaction.footprint.radius,
          id: object.id,
          worldX: object.x + (delta?.offsetX ?? 0),
          worldY: object.y,
        });
      }
    }
    for (const object of this.scenarioObjects) {
      if (object.type !== "ramp") continue;
      ramps.push({
        footprintRadius: object.interaction.footprint.radius,
        id: object.id,
        worldX: object.x,
        worldY: object.y,
      });
    }
    return ramps.sort((left, right) => left.id.localeCompare(right.id));
  }

  private stageInteractionScenario(scenario: GateThreeScenario): boolean {
    const valid: readonly GateThreeScenario[] = [
      "none",
      "ramp-trick",
      "crash-recovery",
      "mushroom",
      "burning-ignite",
      "burning-clear",
    ];
    if (!valid.includes(scenario)) return false;
    if (scenario === "none") {
      this.scenario = "none";
      this.scenarioObjects = [];
      return true;
    }

    const preserveBurning =
      scenario === "burning-clear" &&
      this.interactions.deltas.get("scenario-dead-tree")?.burning === true;
    const preserveMushroom =
      scenario === "mushroom" &&
      this.interactions.deltas.get("scenario-stump")?.form === "mushroom";
    if (scenario === "burning-clear" && !preserveBurning) return false;
    if (!preserveBurning && !preserveMushroom) {
      this.simulation.reset();
      this.interactions.reset();
      this.clock.reset();
    }
    const player = this.simulation.getSnapshot();
    const createObject = (
      type: InteractiveWorldObject["type"],
      id: string,
      x: number,
      y: number,
      variant?: InteractiveWorldObject["variant"],
    ): InteractiveWorldObject => ({
      id,
      interaction: interactionFor(type),
      type,
      ...(variant ? { variant } : {}),
      x,
      y,
    });

    if (scenario === "ramp-trick") {
      this.scenarioObjects = [
        createObject("ramp", "scenario-ramp", player.worldX, player.worldY + 5),
      ];
    } else if (scenario === "crash-recovery") {
      this.scenarioObjects = [
        createObject(
          "tree",
          "scenario-crash-tree",
          player.worldX,
          player.worldY + 6,
          "evergreen",
        ),
      ];
    } else if (scenario === "mushroom") {
      if (preserveMushroom) {
        this.interactions.step(
          this.simulation,
          NEUTRAL_PLAYER_INPUT,
          [],
          SIMULATION_STEP_SECONDS,
        );
      }
      this.scenarioObjects = [
        createObject(
          "stump",
          "scenario-stump",
          preserveMushroom ? player.worldX : player.worldX - 9.8,
          preserveMushroom ? player.worldY - 0.15 : player.worldY - 3.5,
        ),
      ];
    } else if (scenario === "burning-ignite") {
      this.scenarioObjects = [
        createObject(
          "tree",
          "scenario-dead-tree",
          player.worldX,
          player.worldY + 5.5,
          "dead-tree",
        ),
      ];
    } else {
      this.scenarioObjects = [
        createObject(
          "ramp",
          "scenario-fire-ramp",
          player.worldX,
          player.worldY + 5,
        ),
        createObject(
          "tree",
          "scenario-dead-tree",
          player.worldX,
          player.worldY + 13,
          "dead-tree",
        ),
      ];
    }
    this.scenario = scenario;
    if (this.runtime) this.runtime.interactions.scenario = scenario;
    return true;
  }

  private stageCourseCrossing(
    mode: EventModeId,
    target: CourseCrossingTarget,
    outcome: Exclude<MarkerState, "pending">,
  ): boolean {
    const course = CLASSIC_COURSES.find((candidate) => candidate.id === mode);
    if (!course) return false;
    const snapshot = this.modes.getSnapshot();
    let x: number;
    let y: number;
    if (target === "start") {
      if (snapshot.courses[mode].lifecycle !== "idle") return false;
      x = course.centerX;
      y = course.startGate.y;
    } else if (target === "finish") {
      if (snapshot.activeMode !== mode) return false;
      x = course.centerX;
      y = course.finishGate.y;
    } else {
      if (snapshot.activeMode !== mode || !Number.isInteger(target))
        return false;
      const marker = course.markers[target - 1];
      if (
        !marker ||
        snapshot.courses[mode].markers[target - 1]?.state !== "pending"
      )
        return false;
      y = marker.y;
      if (outcome === "missed") {
        x = course.centerX + course.halfWidth + 3;
      } else {
        const expectedDirection = marker.color === "red" ? 1 : -1;
        x = marker.x + expectedDirection * (outcome === "correct" ? 1.1 : -1.1);
      }
    }
    this.scenario = "none";
    this.scenarioObjects = [];
    this.simulation.reposition(x, y - 0.7, 0, 6);
    const player = this.simulation.getSnapshot();
    this.modes.syncPosition({
      simulationSeconds: player.simulationSeconds,
      style: this.interactions.getSnapshot().style,
      worldX: player.worldX,
      worldY: player.worldY,
    });
    return true;
  }

  private stageLivingScenario(scenario: GateFiveScenario): boolean {
    const valid: readonly GateFiveScenario[] = [
      "none",
      "population",
      "dog-contact",
      "chair-drop",
      "foreshadow",
      "yeti-bottom",
      "yeti-contact",
    ];
    if (!valid.includes(scenario)) return false;
    if (scenario === "none") {
      this.livingScenario = "none";
      return true;
    }
    const player = this.simulation.getSnapshot();
    const yeti = this.yeti.getSnapshot(player.worldY);
    if (
      (scenario === "foreshadow" || scenario === "yeti-bottom") &&
      (yeti.activeBoundaries.length > 0 || yeti.capturedBy)
    )
      return false;

    if (scenario === "population") {
      this.simulation.reposition(14, 0, 0, 3.5);
      const staged = this.simulation.getSnapshot();
      this.scenario = "none";
      this.scenarioObjects = [
        {
          id: "scenario-living-ramp",
          interaction: interactionFor("ramp"),
          type: "ramp",
          x: staged.worldX + 8,
          y: staged.worldY + 4,
        },
      ];
      this.livingSlope.repositionActor(
        "beginner-0",
        staged.worldX - 10,
        staged.worldY + 7,
      );
      this.livingSlope.repositionActor(
        "snowboarder-top",
        staged.worldX + 11,
        staged.worldY - 10,
      );
      this.livingSlope.repositionActor(
        "dog-0",
        staged.worldX + 15,
        staged.worldY + 16,
      );
      this.livingSlope.repositionActor(
        "walking-tree-0",
        staged.worldX + 8,
        staged.worldY + 10,
      );
      this.livingSlope.repositionActor("chair-up-0", -7, staged.worldY + 3);
      this.livingSlope.repositionActor("chair-down-0", -9, staged.worldY + 24);
      this.syncModesToPlayer();
    } else if (scenario === "dog-contact") {
      this.livingSlope.repositionActor(
        "dog-0",
        player.worldX + 1.05,
        player.worldY,
      );
    } else if (scenario === "chair-drop") {
      for (let index = 0; index < 8; index += 1) {
        this.livingSlope.repositionActor(
          `chair-down-${index}`,
          -9,
          player.worldY + 8 + index * 3,
        );
      }
      this.livingSlope.requestChairDrop();
    } else if (scenario === "foreshadow") {
      this.simulation.reposition(0, 1_798.5, 0, 22);
      this.syncModesToPlayer();
    } else if (scenario === "yeti-bottom") {
      this.simulation.reposition(0, 1_999.35, 0, 8);
      this.syncModesToPlayer();
    } else {
      const chaser = yeti.controllers.find(
        (controller) =>
          controller.boundary === "bottom" &&
          controller.active &&
          controller.state === "chasing" &&
          controller.protectionSeconds <= 0,
      );
      if (!chaser) return false;
      this.simulation.reposition(chaser.worldX, chaser.worldY, 0, 0);
      this.syncModesToPlayer();
    }
    this.livingScenario = scenario;
    if (this.runtime) this.runtime.livingSlope.scenario = scenario;
    return true;
  }

  private syncModesToPlayer(): void {
    const player = this.simulation.getSnapshot();
    this.modes.syncPosition({
      simulationSeconds: player.simulationSeconds,
      style: this.interactions.getSnapshot().style,
      worldX: player.worldX,
      worldY: player.worldY,
    });
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

  private captureInteractionEvents(): void {
    const interactionEvents = this.interactions.drainEvents();
    const feedbackEvents = this.interactions.drainFeedback();
    const styleEvents = this.interactions.drainStyleEvents();
    this.interactionEvents.push(...interactionEvents);
    this.feedbackEvents.push(...feedbackEvents);
    this.styleEvents.push(...styleEvents);
    for (const events of [
      this.interactionEvents,
      this.feedbackEvents,
      this.styleEvents,
    ]) {
      if (events.length > MAX_TELEMETRY_EVENTS)
        events.splice(0, events.length - MAX_TELEMETRY_EVENTS);
    }

    const latestVisual = [...feedbackEvents]
      .reverse()
      .find((event) => event.kind === "visual");
    const latestAudio = [...feedbackEvents]
      .reverse()
      .find((event) => event.kind === "audio");
    if (latestVisual) {
      const priorityUntil = latestVisual.atSeconds + FEEDBACK_VISIBLE_SECONDS;
      this.feedbackVisibleUntil = priorityUntil;
      this.feedbackPriorityUntil = Math.max(
        this.feedbackPriorityUntil,
        priorityUntil,
      );
      const feedback = document.querySelector<HTMLElement>("#feedback-card");
      const label = document.querySelector<HTMLElement>("#feedback-label");
      if (feedback) {
        feedback.hidden = false;
        feedback.dataset.cue = latestVisual.cue;
      }
      if (label) label.textContent = latestVisual.label;
    }
    if (latestAudio) {
      const audio = document.querySelector<HTMLElement>("#audio-cue");
      if (audio) audio.textContent = `AUDIO CUE ${latestAudio.cue}`;
    }
  }

  private captureModeEvents(): void {
    const events = this.modes.drainEvents();
    if (events.length === 0) return;
    this.modeEvents.push(...events);
    if (this.modeEvents.length > MAX_TELEMETRY_EVENTS) {
      this.modeEvents.splice(0, this.modeEvents.length - MAX_TELEMETRY_EVENTS);
    }
    for (const event of events) {
      if (event.type !== "mode-finished") continue;
      const result = this.modes.getSnapshot().courses[event.mode].result;
      if (!result) continue;
      const record = recordFromResult(
        result,
        this.worldSeed,
        Date.now(),
        `${this.worldSeed}:${this.simulation.getSnapshot().runNumber}:${event.mode}:${this.fixedSteps}`,
      );
      this.recordBook = addRecord(this.recordBook, record);
      if (this.recordStorage && !this.recordStorage.save(this.recordBook))
        this.storageAvailable = false;
    }

    const latest = events.at(-1)!;
    const feedback = document.querySelector<HTMLElement>("#feedback-card");
    const label = document.querySelector<HTMLElement>("#feedback-label");
    const audio = document.querySelector<HTMLElement>("#audio-cue");
    const run = this.modes.getSnapshot().courses[latest.mode];
    const text =
      latest.type === "mode-started"
        ? `${latest.mode.replaceAll("-", " ").toUpperCase()} START`
        : latest.type === "mode-finished"
          ? latest.mode === "free-style"
            ? `FINAL STYLE ${run.result?.score ?? 0}`
            : `FINAL ${(run.result?.adjustedTimeSeconds ?? 0).toFixed(1)}S`
          : latest.type === "marker-correct"
            ? `MARKER ${latest.markerIndex} CLEAN`
            : latest.type === "marker-wrong-side"
              ? `MARKER ${latest.markerIndex} WRONG +5S`
              : `MARKER ${latest.markerIndex} MISSED +5S`;
    if (feedback) {
      feedback.hidden = false;
      feedback.dataset.cue = latest.type;
    }
    if (label) label.textContent = text;
    if (audio) audio.textContent = `AUDIO CUE ${latest.type}`;
    this.feedbackVisibleUntil =
      this.simulation.getSnapshot().simulationSeconds +
      FEEDBACK_VISIBLE_SECONDS;
    this.feedbackPriorityUntil = Math.max(
      this.feedbackPriorityUntil,
      this.feedbackVisibleUntil,
    );
  }

  private captureLivingEvents(): void {
    const events = this.livingSlope.drainEvents();
    if (events.length === 0) return;
    this.livingEvents.push(...events);
    if (this.livingEvents.length > MAX_TELEMETRY_EVENTS)
      this.livingEvents.splice(
        0,
        this.livingEvents.length - MAX_TELEMETRY_EVENTS,
      );
    for (const event of events) {
      if (event.type === "dog-hit") {
        this.interactions.deltas.patch(event.actorId, {
          npcState: "knocked",
          yellowSnow: true,
        });
        this.yellowSnowLocations.set(
          event.actorId,
          Object.freeze({ x: event.worldX, y: event.worldY }),
        );
      } else if (event.type === "dog-recovered") {
        this.interactions.deltas.patch(event.actorId, { npcState: "active" });
      }
    }
    const latest = events.at(-1)!;
    const labels: Readonly<Record<LivingActorEvent["type"], string>> = {
      "beginner-fell": "BEGINNER DOWN",
      "beginner-recovered": "BEGINNER BACK UP",
      "chair-looped": "LIFT LOOP",
      "chair-rider-dropped": "RIDER DROPPED IN",
      "dog-hit": "WOOF / YELLOW SNOW",
      "dog-recovered": "DOG BACK ON PAWS",
      "snowboarder-entered": "FAST RIDER ABOVE",
      "snowboarder-jumped": "BOARDER AIR",
      "snowboarder-landed": "BOARDER RECOVERED",
      "snowboarder-tumbled": "BOARDER TUMBLE",
      "walking-tree-moved": "TREE SETTLED",
      "walking-tree-woke": "BRANCHES MOVING",
    };
    if (
      this.simulation.getSnapshot().simulationSeconds >=
      this.feedbackPriorityUntil
    )
      this.showSystemFeedback(labels[latest.type], latest.type);
  }

  private captureYetiEvents(): void {
    const events = this.yeti.drainEvents();
    if (events.length === 0) return;
    this.yetiEvents.push(...events);
    if (this.yetiEvents.length > MAX_TELEMETRY_EVENTS)
      this.yetiEvents.splice(0, this.yetiEvents.length - MAX_TELEMETRY_EVENTS);
    const latest = events.at(-1)!;
    const labels: Readonly<Record<YetiEvent["type"], string>> = {
      "capture-started": "SHADOW CLOSING",
      chewing: "SNOW GOES QUIET",
      eaten: "WHITEOUT",
      grabbed: "PULLED FROM LINE",
      pounced: "IMPACT",
      "reset-requested": "RESCUE TRACK FOUND",
      "turbo-evasion": "WIND GAP / HOLD LINE",
      "yeti-activated": "THE SNOW MOVED",
      "yeti-repositioned": "TRACKS AT THE EDGE",
    };
    this.feedbackPriorityUntil =
      this.simulation.getSnapshot().simulationSeconds + 1.35;
    this.showSystemFeedback(labels[latest.type], latest.type);
  }

  private showSystemFeedback(labelText: string, cue: string): void {
    const feedback = document.querySelector<HTMLElement>("#feedback-card");
    const label = document.querySelector<HTMLElement>("#feedback-label");
    const audio = document.querySelector<HTMLElement>("#audio-cue");
    if (feedback) {
      feedback.hidden = false;
      feedback.dataset.cue = cue;
    }
    if (label) label.textContent = labelText;
    if (audio) audio.textContent = `AUDIO CUE ${cue}`;
    this.feedbackVisibleUntil =
      this.simulation.getSnapshot().simulationSeconds +
      FEEDBACK_VISIBLE_SECONDS;
  }

  private resetAfterYetiCapture(): void {
    this.simulation.reset();
    this.interactions.reset();
    this.modes.reset();
    this.livingSlope.reset(this.worldSeed);
    this.yeti.acknowledgeReset();
    this.scenario = "none";
    this.livingScenario = "none";
    this.scenarioObjects = [];
    this.yellowSnowLocations.clear();
    this.feedbackPriorityUntil = 1.35;
    this.feedbackVisibleUntil = FEEDBACK_VISIBLE_SECONDS;
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
