import Phaser from "phaser";
import {
  AccessibilitySettingsStore,
  defaultAccessibilitySettings,
  type AccessibilitySettings,
} from "../../accessibility/settings";
import { AlpineAudio, type AlpineSoundCue } from "../../audio/AlpineAudio";
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
  LIVING_SLOPE_TUNING,
  LivingSlopeSimulation,
  type LivingActorEvent,
  type LivingActorSnapshot,
  type LivingSlopeRamp,
  type LivingSlopeSnapshot,
} from "../../simulation/livingSlope";
import {
  AutomaticPauseController,
  type AutomaticPauseReason,
} from "../../lifecycle/automaticPause";
import { FramePerformanceMonitor } from "../../performance/frameMonitor";
import { ReplayRecorder, type ReplayExport } from "../../replay/replay";
import {
  YetiSimulation,
  type YetiControllerSnapshot,
  type YetiEvent,
  type YetiSnapshot,
} from "../../simulation/yeti";
import {
  MountainModeSimulation,
  type EventModeId,
  type MarkerState,
  type ModeEvent,
  type ModeResult,
  type ModeSnapshot,
} from "../../simulation/modes";
import {
  addRecord,
  bucketForSeed,
  emptyRecordBook,
  recordFromResult,
  type RecordBook,
  type RunRecord,
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
import { CHUNK_SIZE_METERS, type WorldChunk } from "../../world/types";
import { LocalRecordStorage } from "../localRecordStorage";
import { livingActorPresentation } from "../livingActorPresentation";
import {
  PLAYER_MIN_RENDERED_CONTENT_HEIGHT,
  playerAtlasFrame,
  playerPresentationScale,
} from "../playerPresentation";
import {
  AtlasSpritePool,
  PRODUCTION_ATLAS_DATA,
  PRODUCTION_ATLAS_IMAGE,
  PRODUCTION_ATLAS_KEY,
} from "../atlas/AtlasSpritePool";
import { AccessibilityControls } from "../accessibilityControls";
import { AlpineVfx } from "../vfx/AlpineVfx";
import type {
  CourseCrossingTarget,
  DescentAuditReport,
  FreeSkiRuntime,
  GateFiveScenario,
  GateThreeScenario,
  LifecycleTelemetryEvent,
  TelemetrySample,
} from "../runtimeBridge";

const PLAYER_SCREEN_RATIO = 0.35;
const PIXELS_PER_METER = 7.5;
const MAX_TELEMETRY_EVENTS = 240;
const MAX_TELEMETRY_SAMPLES = 600;
const FEEDBACK_VISIBLE_SECONDS = 1.15;
const PRESENTATION_SYNC_FIXED_STEPS = 30;
export const MAX_VISIBLE_POPULATED_OBJECTS = 20;
const MAX_VISIBLE_TERRAIN_OBJECTS = 10;
const EMPTY_INTERACTIVE_OBJECTS: readonly InteractiveWorldObject[] =
  Object.freeze([]);

const COLORS = {
  blueSuit: 0x1d5b85,
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
  private readonly vfx = new AlpineVfx();
  private readonly performanceMonitor = new FramePerformanceMonitor();
  private readonly replay: ReplayRecorder;
  private readonly automaticPause: AutomaticPauseController;
  private background?: Phaser.GameObjects.Graphics;
  private skier?: Phaser.GameObjects.Image;
  private fallbackSkier?: Phaser.GameObjects.Container;
  private skierShadow?: Phaser.GameObjects.Ellipse | Phaser.GameObjects.Image;
  private spritePool!: AtlasSpritePool;
  private audio!: AlpineAudio;
  private locationLabel?: Phaser.GameObjects.Text;
  private runLabel?: Phaser.GameObjects.Text;
  private inputAdapter?: BrowserInputAdapter;
  private accessibilityControls?: AccessibilityControls;
  private accessibilityStore?: AccessibilitySettingsStore;
  private accessibilitySettings = defaultAccessibilitySettings(false);
  private runtime?: FreeSkiRuntime;
  private renderLivingSnapshot?: LivingSlopeSnapshot;
  private renderModeSnapshot?: ModeSnapshot;
  private renderYetiSnapshot?: YetiSnapshot;
  private readonly inputEvents: InputTelemetryEvent[] = [];
  private readonly playerEvents: PlayerEvent[] = [];
  private readonly interactionEvents: InteractionEvent[] = [];
  private readonly feedbackEvents: FeedbackEvent[] = [];
  private readonly styleEvents: StyleEvent[] = [];
  private readonly modeEvents: ModeEvent[] = [];
  private readonly livingEvents: LivingActorEvent[] = [];
  private readonly yetiEvents: YetiEvent[] = [];
  private readonly lifecycleEvents: LifecycleTelemetryEvent[] = [];
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
  private trickVisibleUntil = 0;
  private trainingMode = false;
  private courseTestMode = false;
  private courseStagingHold = false;
  private recordBook: RecordBook = emptyRecordBook();
  private recordStorage?: LocalRecordStorage;
  private storageAvailable = true;
  private fixedSteps = 0;
  private renderFrames = 0;
  private droppedSeconds = 0;
  private debugVisible = false;
  private previousChunkX: number | undefined;
  private previousChunkY: number | undefined;
  private readonly screenCoordinates: [number, number] = [0, 0];
  private resultCardOpen = false;
  private resultPauseOwned = false;
  private readonly closeResultCard = (): void => {
    this.dismissResultCard(true);
  };
  private livingSlopeRampChunks?: readonly WorldChunk[];
  private livingSlopeRampScenario?: readonly InteractiveWorldObject[];
  private livingSlopeRampDeltaRevision = -1;
  private livingSlopeRampValue: readonly LivingSlopeRamp[] = Object.freeze([]);
  private visibleObjects = 0;
  private worldTransitions = 0;
  private lastReplaySnapshotStep = 0;
  private lastHudSyncFixedStep = -PRESENTATION_SYNC_FIXED_STEPS;
  private lastRuntimeSyncFixedStep = -PRESENTATION_SYNC_FIXED_STEPS / 2;
  private resizeCount = 0;
  private flashActiveUntilMs = 0;
  private flashPresented = false;
  private flashCount = 0;
  private shakeCount = 0;
  private readonly unlockAudio = (): void => {
    void this.audio?.unlock().then(() => this.updateAudioControl());
  };
  private readonly handleAudioKey = (event: KeyboardEvent): void => {
    if (event.key.toLowerCase() !== "m" || event.repeat) return;
    this.audio?.toggleMuted();
    this.audio?.play("ui-toggle");
    this.updateAudioControl();
  };
  private readonly handleWindowBlur = (): void => {
    this.setAutomaticPause("blur", true, "blurred");
  };
  private readonly handleWindowFocus = (): void => {
    this.setAutomaticPause("blur", false, "focused");
  };
  private readonly handleVisibilityChange = (): void => {
    const hidden = document.visibilityState !== "visible";
    this.setAutomaticPause("hidden", hidden, hidden ? "hidden" : "visible");
  };
  private readonly handleWindowResize = (): void => {
    this.resizeCount += 1;
    this.clock.reset();
    this.recordLifecycle("resized");
  };

  constructor(seed: string) {
    super("alpine-baseline");
    this.worldSeed = seed;
    this.generator = new WorldGenerator(seed);
    this.stream = new MountainStream(this.generator);
    this.livingSlope = new LivingSlopeSimulation(seed);
    this.replay = new ReplayRecorder(seed, GENERATOR_VERSION);
    this.automaticPause = new AutomaticPauseController(
      () => this.simulation.getSnapshot().paused,
      (paused) => {
        if (this.simulation.getSnapshot().paused !== paused)
          this.simulation.togglePause();
      },
      () => {
        this.inputAdapter?.releaseAll();
        this.clock.reset();
      },
    );
  }

  preload(): void {
    const status = document.querySelector<HTMLElement>("#loading-status");
    const progress = document.querySelector<HTMLElement>("#loading-progress");
    this.load.on("progress", (value: number) => {
      if (status) status.textContent = "Loading alpine atlas…";
      if (progress) progress.style.width = `${Math.round(58 + value * 38)}%`;
    });
    this.load.once("complete", () => {
      if (status) status.textContent = "Opening the slope…";
      if (progress) progress.style.width = "100%";
    });
    this.load.atlas(
      PRODUCTION_ATLAS_KEY,
      PRODUCTION_ATLAS_IMAGE,
      PRODUCTION_ATLAS_DATA,
    );
  }

  create(): void {
    this.background = this.add.graphics().setDepth(0);
    this.spritePool = new AtlasSpritePool(this);
    try {
      this.audio = new AlpineAudio(window.localStorage);
    } catch {
      this.audio = new AlpineAudio();
    }
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

    const search = new URLSearchParams(window.location.search);
    const pointerFromUrl = search.get("pointer") !== "0";
    const touchFromUrl = search.get("touch") === "1";
    const coarsePointer =
      window.matchMedia("(pointer: coarse)").matches &&
      navigator.maxTouchPoints > 0;
    this.trainingMode = search.get("training") === "1";
    this.courseTestMode = search.get("courseTest") === "1";
    this.debugVisible = search.get("debug") === "1";
    this.game.canvas.tabIndex = 0;
    this.game.canvas.setAttribute("aria-label", "FreeSki downhill playfield");
    this.setPointerSteering(pointerFromUrl);
    this.inputAdapter.setTouchEnabled(touchFromUrl || coarsePointer);

    let settingsStorage: Storage | undefined;
    try {
      settingsStorage = window.localStorage;
    } catch {
      settingsStorage = undefined;
    }
    this.accessibilityStore = new AccessibilitySettingsStore(
      settingsStorage,
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
    this.accessibilityControls = new AccessibilityControls(
      this.accessibilityStore,
      {
        onChange: (settings) => this.applyAccessibilitySettings(settings),
        onExportReplay: () => this.exportReplayDownload(),
        onPanelVisibility: (visible) => {
          this.setAutomaticPause(
            "settings",
            visible,
            visible ? "settings-opened" : "settings-closed",
          );
        },
      },
    );
    this.applyAccessibilitySettings(this.accessibilityControls.settings);
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
    const audioToggle =
      document.querySelector<HTMLButtonElement>("#audio-toggle");
    audioToggle?.addEventListener("click", () => {
      this.audio?.toggleMuted();
      this.audio?.play("ui-toggle");
      this.updateAudioControl();
    });
    document
      .querySelector<HTMLButtonElement>("#result-close")
      ?.addEventListener("click", this.closeResultCard);
    window.addEventListener("pointerdown", this.unlockAudio, { capture: true });
    window.addEventListener("keydown", this.unlockAudio, { capture: true });
    window.addEventListener("keydown", this.handleAudioKey);
    window.addEventListener("blur", this.handleWindowBlur);
    window.addEventListener("focus", this.handleWindowFocus);
    window.addEventListener("resize", this.handleWindowResize);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    this.updateAudioControl();

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
      art: {
        atlasFrameCount: this.textures.get(PRODUCTION_ATLAS_KEY).getFrameNames()
          .length,
        atlasLoaded: this.textures.exists(PRODUCTION_ATLAS_KEY),
        capacityFallbacks: 0,
        fallbackDraws: 0,
        frameFallbacks: 0,
        missingFrameFallbacks: 0,
        peakPooledSprites: 0,
        playerFrame: "player/downhill",
        playerMinimumRenderedHeight: PLAYER_MIN_RENDERED_CONTENT_HEIGHT,
        playerRenderedHeight: 0,
        playerTargetRenderedHeight: 0,
        pooledSprites: 0,
        spriteCapacity: this.spritePool.capacity,
        statusLabelDepth: 90,
      },
      audio: this.audio.getSnapshot(),
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
      lifecycle: {
        autoPaused: false,
        events: this.lifecycleEvents,
        reasons: [],
        resizeCount: 0,
        visibilityState: document.visibilityState,
      },
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
      performance: {
        bounds: {
          actorCapacity: LIVING_SLOPE_TUNING.maximumActors,
          actorCount: this.livingSlope.getSnapshot().actorCount,
          pooledSprites: 0,
          spriteCapacity: this.spritePool.capacity,
          vfxEffects: 0,
          vfxEffectsCapacity: AlpineVfx.MAX_EFFECTS,
          vfxTracks: 0,
          vfxTracksCapacity: AlpineVfx.MAX_TRACKS,
        },
        frame: this.performanceMonitor.getSnapshot(),
      },
      player,
      presentation: {
        flashActive: false,
        flashCount: 0,
        shakeCount: 0,
        yetiPresentation: this.accessibilitySettings.yetiPresentation,
      },
      ready: true,
      replay: this.replay.getSnapshot(),
      seed: this.worldSeed,
      seedHash: hashSeed(this.worldSeed),
      settings: {
        accessibility: this.accessibilitySettings,
        connectedGamepads: 0,
        debugVisible: this.debugVisible,
        heldActions: [],
        pointerSteeringEnabled: pointerFromUrl,
        settingsPanelOpen: false,
        touchControlsEnabled: this.inputAdapter.isTouchEnabled,
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
      vfx: this.vfx.getSnapshot(),
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
      stageCourseCrossings: (mode, targets, outcome = "correct") =>
        this.stageCourseCrossings(mode, targets, outcome),
      stageLivingScenario: (scenario) => this.stageLivingScenario(scenario),
      exportReplay: () => this.replay.export(),
      setVisible: (visible) => this.setDebugVisible(visible),
    };

    const shell = document.querySelector<HTMLElement>("#game-shell");
    const status = document.querySelector<HTMLElement>("#system-label");
    this.renderState(player);
    this.updateRuntime(player);
    shell?.setAttribute("data-game-ready", "true");
    const loadingScreen =
      document.querySelector<HTMLElement>("#loading-screen");
    if (loadingScreen) loadingScreen.hidden = true;
    if (status) status.textContent = "Alpine systems online";
    this.setDebugVisible(this.debugVisible);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.accessibilityControls?.destroy();
      this.inputAdapter?.destroy();
      this.spritePool?.destroy();
      this.audio?.destroy();
      window.removeEventListener("pointerdown", this.unlockAudio, {
        capture: true,
      });
      window.removeEventListener("keydown", this.unlockAudio, {
        capture: true,
      });
      window.removeEventListener("keydown", this.handleAudioKey);
      document
        .querySelector<HTMLButtonElement>("#result-close")
        ?.removeEventListener("click", this.closeResultCard);
      window.removeEventListener("blur", this.handleWindowBlur);
      window.removeEventListener("focus", this.handleWindowFocus);
      window.removeEventListener("resize", this.handleWindowResize);
      document.removeEventListener(
        "visibilitychange",
        this.handleVisibilityChange,
      );
      delete window.__FREE_SKI_DEBUG__;
    });
  }

  update(_time: number, deltaMilliseconds: number): void {
    if (!this.inputAdapter || !this.runtime) return;
    this.performanceMonitor.record(deltaMilliseconds);
    const result = this.clock.advance(
      Math.min(deltaMilliseconds / 1000, 0.25),
      (deltaSeconds) => {
        const actions = this.inputAdapter?.sample();
        if (!actions) return;
        this.replay.record(this.fixedSteps + 1, actions);

        if (actions.resetPressed) {
          this.dismissResultCard(false);
          this.simulation.reset();
          this.interactions.reset();
          this.modes.reset();
          this.livingSlope.reset(this.worldSeed);
          this.yeti.reset();
          this.scenario = "none";
          this.livingScenario = "none";
          this.scenarioObjects = [];
          this.yellowSnowLocations.clear();
          this.vfx.reset();
        }
        if (
          actions.pausePressed &&
          this.automaticPause.getSnapshot().reasons.length === 0
        )
          this.simulation.togglePause();
        if (actions.turboPressed) this.simulation.toggleTurbo();
        if (actions.debugPressed) this.setDebugVisible(!this.debugVisible);
        const captureBeforeStep = this.yeti.getSnapshot(
          this.simulation.getSnapshot().worldY,
        );
        const playerInput = captureBeforeStep.capturedBy
          ? NEUTRAL_PLAYER_INPUT
          : this.courseStagingHold
            ? { ...NEUTRAL_PLAYER_INPUT, brake: true }
            : actions.player;
        this.simulation.step(playerInput, deltaSeconds);
        if (captureBeforeStep.playerRemoved)
          this.simulation.applySpeedMultiplier(0);
        const player = this.simulation.getSnapshot();
        if (player.paused) {
          this.capturePlayerEvents();
          this.updateHud(player);
          this.updateRuntime(player);
          return;
        }
        if (!captureBeforeStep.capturedBy) {
          this.interactions.step(
            this.simulation,
            playerInput,
            this.getInteractiveObjects(),
            deltaSeconds,
          );
        }
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
    if (
      this.textures.exists(PRODUCTION_ATLAS_KEY) &&
      this.textures.get(PRODUCTION_ATLAS_KEY).has("player/downhill")
    ) {
      this.skierShadow = this.add
        .image(0, 0, PRODUCTION_ATLAS_KEY, "vfx/ground-shadow")
        .setOrigin(0.5)
        .setDisplaySize(46, 12)
        .setDepth(38)
        .setAlpha(0.28);
      this.skier = this.add
        .image(0, 0, PRODUCTION_ATLAS_KEY, "player/downhill")
        .setOrigin(0.5, 0.94)
        .setDepth(40)
        .setDisplaySize(54, 64);
      return;
    }
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

    this.fallbackSkier = this.add.container(0, 0, [figure]).setDepth(40);
  }

  private createLabels(): void {
    this.locationLabel = this.add.text(28, 25, "OPEN SLOPE / 0000 M", {
      color: "#102933",
      fontFamily: "Courier New, monospace",
      fontSize: "11px",
      fontStyle: "bold",
      letterSpacing: 2,
    });
    this.locationLabel.setAlpha(0.78).setDepth(90);

    this.add
      .text(28, 45, "FIXED-STEP DESCENT RANGE", {
        color: "#536d75",
        fontFamily: "Courier New, monospace",
        fontSize: "9px",
        letterSpacing: 1.5,
      })
      .setAlpha(0.9)
      .setDepth(90);

    this.runLabel = this.add
      .text(0, 25, "RUN 01\nDOWNHILL", {
        align: "right",
        color: "#102933",
        fontFamily: "Courier New, monospace",
        fontSize: "10px",
        fontStyle: "bold",
        lineSpacing: 4,
      })
      .setOrigin(1, 0)
      .setDepth(90);
  }

  private renderState(player: PlayerSnapshot): void {
    this.renderLivingSnapshot = this.livingSlope.getSnapshot();
    this.renderModeSnapshot = this.modes.getSnapshot();
    this.renderYetiSnapshot = this.yeti.getSnapshot(player.worldY);
    this.spritePool.beginFrame();
    this.drawSnowfield(player);
    const foreshadow = this.renderYetiSnapshot.foreshadow.intensity;
    this.vfx.update(player, foreshadow);
    this.vfx.draw(
      player,
      (worldX, worldY) => this.toScreen(worldX, worldY, player),
      this.spritePool,
    );
    this.updateSkier(player);
    this.spritePool.endFrame();
    this.audio.update(
      player.speedMetersPerSecond,
      player.heading.includes("carve"),
      foreshadow,
      player.paused,
    );
    this.syncImpactPresentation();
    this.updateRuntimeFrame(player);
    if (
      this.fixedSteps - this.lastHudSyncFixedStep >=
      PRESENTATION_SYNC_FIXED_STEPS
    ) {
      this.lastHudSyncFixedStep = this.fixedSteps;
      this.updateHud(player);
    }
    if (
      this.fixedSteps - this.lastRuntimeSyncFixedStep >=
      PRESENTATION_SYNC_FIXED_STEPS
    ) {
      this.lastRuntimeSyncFixedStep = this.fixedSteps;
      this.updateRuntime(player);
    }
  }

  private drawSnowfield(player: PlayerSnapshot): void {
    if (!this.background) return;
    const width = this.scale.width;
    const height = this.scale.height;
    const anchorY = height * PLAYER_SCREEN_RATIO;
    this.background.clear();
    this.background.fillStyle(COLORS.powder);
    this.background.fillRect(0, 0, width, height);
    this.drawForeshadow(player, width, height);
    this.drawWorld(player, width, height);
    this.background.fillStyle(COLORS.signal, 0.9);
    this.background.fillRect(width - 15, height * 0.12, 3, height * 0.76);
    this.background.fillStyle(COLORS.ink, 0.9);
    this.background.fillRect(width - 18, anchorY, 9, 2);
  }

  private drawForeshadow(
    player: PlayerSnapshot,
    width: number,
    height: number,
  ): void {
    if (!this.background) return;
    const foreshadow =
      this.renderYetiSnapshot?.foreshadow ??
      this.yeti.getSnapshot(player.worldY).foreshadow;
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
      if (
        this.spritePool.draw("secret/yellow-snow", x, y + 4, {
          alpha: 0.82,
          depth: 3,
          displayHeight: 16,
          originY: 0.5,
        })
      )
        continue;
      this.background.fillStyle(0xd8bd3d, 0.48);
      this.background.fillEllipse(x, y + 4, 17, 6);
    }
    for (const actor of this.renderLivingSnapshot?.actors ?? []) {
      if (!actor.active) continue;
      if (this.visibleObjects >= MAX_VISIBLE_POPULATED_OBJECTS) break;
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
    if (this.drawLivingAtlasActor(actor, x, y)) return;
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

  private drawLivingAtlasActor(
    actor: Readonly<LivingActorSnapshot>,
    x: number,
    y: number,
  ): boolean {
    const presentation = livingActorPresentation(actor);
    if (
      !this.spritePool.draw("vfx/ground-shadow", x + 2, y + 7, {
        alpha: actor.kind === "chairlift" ? 0.1 : 0.22,
        depth: 4,
        displayHeight: presentation.shadowHeight,
        displayWidth: presentation.shadowWidth,
        originY: 0.5,
      })
    )
      return false;
    this.spritePool.draw(presentation.frame, x, y + 8, {
      depth: actor.kind === "chairlift" ? 12 : 14,
      displayHeight: presentation.displayHeight,
      flipX: presentation.flipX,
      originY: presentation.originY,
    });
    return true;
  }

  private drawYetis(
    player: PlayerSnapshot,
    width: number,
    height: number,
  ): void {
    if (!this.background) return;
    for (const controller of this.renderYetiSnapshot?.controllers ?? []) {
      if (!controller.active) continue;
      if (this.visibleObjects >= MAX_VISIBLE_POPULATED_OBJECTS) break;
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
    const atlasFrame = this.yetiFrame(controller);
    if (
      this.spritePool.draw("vfx/ground-shadow", x + 3, y + 15, {
        alpha: 0.3,
        depth: 16,
        displayHeight: 13,
        displayWidth: 58,
        originY: 0.5,
      })
    ) {
      this.spritePool.draw(atlasFrame, x, y + 14, {
        depth: 17,
        displayHeight:
          controller.state === "pounce" || controller.state === "grab"
            ? 92
            : 84,
        originY: 0.95,
      });
      return;
    }
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

  private yetiFrame(controller: Readonly<YetiControllerSnapshot>): string {
    if (controller.state === "windup") return "yeti/pounce-windup";
    if (controller.state === "pounce") return "yeti/pounce-air";
    if (controller.state === "grab") return "yeti/grab";
    if (controller.state === "eat" || controller.state === "chew")
      return Math.floor(controller.stateSeconds * 7) % 2 === 0
        ? "yeti/chew-a"
        : "yeti/chew-b";
    if (controller.state === "recovery") return "yeti/belly-pat";
    const second = Math.floor(controller.stateSeconds * 8) % 2 === 1;
    if (Math.abs(controller.velocityX) > Math.abs(controller.velocityY))
      return `yeti/run-${controller.velocityX < 0 ? "left" : "right"}-${second ? "b" : "a"}`;
    return `yeti/run-${controller.velocityY < 0 ? "away" : "toward"}-${second ? "b" : "a"}`;
  }

  private drawWorld(
    player: PlayerSnapshot,
    width: number,
    height: number,
  ): void {
    if (!this.background) return;
    this.visibleObjects = 0;
    this.drawClassicCourses(player, width, height);
    this.drawClassicLift(player, width, height);
    const terrainCandidates: Array<{
      readonly delta: Readonly<ObjectDelta> | undefined;
      readonly distanceSquared: number;
      readonly object: InteractiveWorldObject;
      readonly screenX: number;
      readonly screenY: number;
    }> = [];
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
        terrainCandidates.push({
          delta,
          distanceSquared:
            (screenX - width * 0.5) ** 2 +
            (screenY - height * PLAYER_SCREEN_RATIO) ** 2,
          object,
          screenX,
          screenY,
        });
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
      terrainCandidates.push({
        delta,
        distanceSquared:
          (screenX - width * 0.5) ** 2 +
          (screenY - height * PLAYER_SCREEN_RATIO) ** 2,
        object,
        screenX,
        screenY,
      });
    }
    terrainCandidates.sort(
      (left, right) =>
        left.distanceSquared - right.distanceSquared ||
        left.object.id.localeCompare(right.object.id),
    );
    for (const candidate of terrainCandidates.slice(
      0,
      MAX_VISIBLE_TERRAIN_OBJECTS,
    )) {
      this.visibleObjects += 1;
      this.drawInteractiveObject(
        candidate.object,
        candidate.screenX,
        candidate.screenY,
        candidate.delta,
      );
    }
    this.drawLivingSlope(player, width, height);
    this.drawYetis(player, width, height);
    this.drawYetiBoundary(player, width, height);
    if (this.debugVisible) {
      this.drawWorldDiagnostics(player, width, height);
    }
  }

  private drawClassicCourses(
    player: PlayerSnapshot,
    width: number,
    height: number,
  ): void {
    if (!this.background) return;
    for (const course of CLASSIC_COURSES) {
      const [signX, signY] = this.toScreen(
        course.centerX,
        course.startGate.y - 2.8,
        player,
      );
      const signVisible =
        signX >= -50 &&
        signX <= width + 50 &&
        signY >= -45 &&
        signY <= height + 45;
      if (signVisible) {
        const signFrame =
          course.id === "slalom"
            ? "course/slalom-sign"
            : course.id === "tree-slalom"
              ? "course/tree-slalom-sign"
              : "course/free-style-sign";
        this.spritePool.draw(signFrame, signX, signY + 15, {
          depth: 9,
          displayHeight: 62,
          originY: 0.94,
        });
      }
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
        this.renderModeSnapshot?.courses[course.id as EventModeId];
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
        const markerFrame =
          markerState === "correct"
            ? "course/correct-happy-marker"
            : markerState === "wrong-side" || markerState === "missed"
              ? "course/missed-sad-marker"
              : marker.color === "red"
                ? "course/red-left-marker"
                : "course/blue-right-marker";
        if (
          this.spritePool.draw(markerFrame, x, y + 9, {
            depth: 7,
            displayHeight: markerState === "pending" ? 46 : 38,
            originY: 0.94,
          })
        )
          continue;
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
    const gateKind = color === COLORS.signal ? "finish" : "start";
    if (
      this.spritePool.draw(`course/${gateKind}-left`, left, y + 10, {
        depth: 6,
        displayHeight: 46,
        originX: 0.18,
        originY: 0.94,
      })
    ) {
      this.spritePool.draw(`course/${gateKind}-right`, right, y + 10, {
        depth: 6,
        displayHeight: 46,
        originX: 0.82,
        originY: 0.94,
      });
      return;
    }
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
      if (
        this.spritePool.draw("lift/tower", x, y + 13, {
          depth: 8,
          displayHeight: 128,
          originY: 0.94,
        })
      ) {
        this.spritePool.draw("lift/cable-connector", x, y - 102, {
          depth: 9,
          displayHeight: 32,
          originY: 0.5,
        });
        continue;
      }
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
    const atlasFrame = this.interactiveAtlasFrame(object, delta);
    if (atlasFrame) {
      const display = this.interactiveAtlasDisplay(object, delta);
      const shadowWidth = Math.max(18, display.height * display.shadowScale);
      const needsProjectedShadow =
        display.height >= 75 &&
        ["lift-tower", "tree", "walking-tree"].includes(object.type);
      const shadowReady =
        !needsProjectedShadow ||
        Boolean(
          this.spritePool.draw("vfx/ground-shadow", x + 2, y + 7, {
            alpha: 0.2,
            depth: 4,
            displayHeight: Math.max(5, display.height * 0.12),
            displayWidth: shadowWidth,
            originY: 0.5,
          }),
        );
      if (
        shadowReady &&
        this.spritePool.draw(atlasFrame, x, y + 7, {
          depth: display.depth,
          displayHeight: display.height,
          originY: display.originY,
          tint: delta?.burned ? 0x879397 : undefined,
        })
      ) {
        if (delta?.burning)
          this.spritePool.draw("vfx/flame-embers", x, y - 12, {
            alpha: 0.82,
            depth: display.depth + 1,
            displayHeight: 38,
            originY: 0.8,
          });
        return;
      }
    }
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

  private interactiveAtlasFrame(
    object: Pick<
      InteractiveWorldObject,
      "id" | "interaction" | "type" | "variant" | "x" | "y"
    >,
    delta?: Readonly<ObjectDelta>,
  ): string | null {
    if (delta?.form === "mushroom") return "secret/mushroom";
    if (object.type === "tree") {
      if (delta?.burning) return "terrain/burning-tree-b";
      return object.variant === "dead-tree"
        ? "terrain/dead-tree"
        : object.variant === "evergreen-large"
          ? "terrain/evergreen-large"
          : object.variant === "evergreen-medium" ||
              object.variant === "evergreen"
            ? "terrain/evergreen-medium"
            : "terrain/evergreen-small";
    }
    if (object.type === "walking-tree") return "walking-tree/idle";
    if (object.type === "rock") return "terrain/rock";
    if (object.type === "stump") return "terrain/stump";
    if (object.type === "bump-small") return "terrain/bump-small";
    if (object.type === "bump-large") return "terrain/bump-large";
    if (object.type === "mogul") return "terrain/mogul-field";
    if (object.type === "ramp") return "terrain/rainbow-ramp";
    if (object.type === "lift-tower") return "lift/tower";
    if (object.type === "chairlift") return "chairlift/empty";
    if (object.type === "dog")
      return delta?.npcState === "knocked" ? "dog/knocked-over" : "dog/alert";
    if (object.type === "beginner") return "beginner/downhill";
    return null;
  }

  private interactiveAtlasDisplay(
    object: Pick<InteractiveWorldObject, "interaction" | "type" | "variant">,
    delta?: Readonly<ObjectDelta>,
  ): { depth: number; height: number; originY: number; shadowScale: number } {
    if (delta?.form === "mushroom")
      return { depth: 8, height: 30, originY: 0.88, shadowScale: 0.75 };
    const heights: Readonly<
      Partial<Record<InteractiveWorldObject["type"], number>>
    > = {
      beginner: 48,
      "bump-large": 40,
      "bump-small": 28,
      chairlift: 46,
      dog: 30,
      "lift-tower": 128,
      mogul: 52,
      ramp: 58,
      rock: 31,
      stump: 27,
      tree:
        object.variant === "evergreen-small"
          ? 54
          : object.variant === "evergreen-large"
            ? 88
            : object.variant === "dead-tree"
              ? 82
              : 70,
      "walking-tree": 68,
    };
    const ground = ["bump-large", "bump-small", "mogul", "ramp"].includes(
      object.type,
    );
    return {
      depth: ground ? 5 : 8,
      height: heights[object.type] ?? 38,
      originY:
        object.type === "ramp"
          ? 0.79
          : object.type === "chairlift"
            ? 0.52
            : object.type === "dog"
              ? 0.88
              : 0.94,
      shadowScale: ground ? 1.15 : 0.72,
    };
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
    this.screenCoordinates[0] =
      this.scale.width * 0.5 + (worldX - player.worldX) * PIXELS_PER_METER;
    this.screenCoordinates[1] =
      this.scale.height * PLAYER_SCREEN_RATIO +
      (worldY - player.worldY) * PIXELS_PER_METER;
    return this.screenCoordinates;
  }

  private updateSkier(player: PlayerSnapshot): void {
    if ((!this.skier && !this.fallbackSkier) || !this.skierShadow) return;
    const playerRemoved = this.renderYetiSnapshot?.playerRemoved ?? false;
    if (this.skier && this.skier.visible === playerRemoved)
      this.skier.setVisible(!playerRemoved);
    if (this.fallbackSkier && this.fallbackSkier.visible === playerRemoved)
      this.fallbackSkier.setVisible(!playerRemoved);
    if (this.skierShadow.visible === playerRemoved)
      this.skierShadow.setVisible(!playerRemoved);
    if (playerRemoved) return;
    const anchorX = this.scale.width * 0.5;
    const anchorY = this.scale.height * PLAYER_SCREEN_RATIO;
    const velocityAngle =
      Math.atan2(player.velocityY, player.velocityX) - Math.PI / 2;
    const airOffset = player.airHeight * 19;
    if (this.skierShadow.x !== anchorX || this.skierShadow.y !== anchorY + 18)
      this.skierShadow.setPosition(anchorX, anchorY + 18);
    const shadowScale = Math.max(0.62, 1 - player.airHeight * 0.06);
    if (this.skierShadow.scaleX !== shadowScale)
      this.skierShadow.setScale(shadowScale);
    const shadowAlpha = Math.max(0.05, 0.17 - player.airHeight * 0.018);
    if (this.skierShadow.alpha !== shadowAlpha)
      this.skierShadow.setAlpha(shadowAlpha);
    const skier = this.skier ?? this.fallbackSkier!;
    if (skier.x !== anchorX || skier.y !== anchorY - airOffset)
      skier.setPosition(anchorX, anchorY - airOffset);
    if (this.skier) {
      const frameName = playerAtlasFrame(player);
      if (this.skier.frame.name !== frameName)
        this.skier.setTexture(PRODUCTION_ATLAS_KEY, frameName);
      const originY = player.motion === "airborne" ? 0.62 : 0.94;
      if (this.skier.originY !== originY) this.skier.setOrigin(0.5, originY);
    }
    const rotation =
      player.motion === "crashed"
        ? this.skier
          ? 0
          : velocityAngle + Math.PI * 0.55
        : this.skier
          ? player.motion === "airborne"
            ? Math.atan2(Math.sin(player.airSpin), Math.cos(player.airSpin)) +
              player.airTilt * 0.12
            : 0
          : velocityAngle +
            (player.motion === "airborne"
              ? player.airTilt * 0.45 + player.airSpin
              : 0);
    if (skier.rotation !== rotation) skier.setRotation(rotation);
    if (this.skier) {
      const frame = this.skier.frame;
      const presentation = playerPresentationScale(
        String(frame.name),
        frame.width,
        frame.height,
      );
      if (this.skier.scaleX !== presentation.uniformScale)
        this.skier.setScale(presentation.uniformScale);
    } else {
      const skierScale =
        player.motion === "recovering"
          ? 0.88
          : 1 + Math.min(player.airHeight * 0.022, 0.14);
      skier.setScale(
        skierScale,
        skierScale *
          (player.motion === "airborne" ? Math.cos(player.airPitch) : 1),
      );
    }
    const alpha = player.motion === "recovering" ? 0.62 : 1;
    if (skier.alpha !== alpha) skier.setAlpha(alpha);
  }

  private updateHud(player: PlayerSnapshot): void {
    const shell = document.querySelector<HTMLElement>("#game-shell");
    const speed = document.querySelector<HTMLElement>("#speed-label");
    const time = document.querySelector<HTMLElement>("#time-label");
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
    if (time) time.textContent = player.simulationSeconds.toFixed(1);
    if (distance) distance.textContent = Math.floor(player.worldY).toString();
    if (motion)
      motion.textContent = `${player.motion} / ${player.heading}`.toUpperCase();
    if (turbo) turbo.textContent = player.turbo ? "TURBO ON" : "TURBO OFF";
    const interaction = this.interactions.getSnapshot();
    if (style) style.textContent = interaction.style.toString();
    if (trick) {
      if (interaction.activeTrick !== "none")
        trick.textContent = interaction.activeTrick
          .replaceAll("-", " ")
          .toUpperCase();
      else if (player.simulationSeconds > this.trickVisibleUntil)
        trick.textContent = "LINE READY";
    }
    if (feedback && player.simulationSeconds > this.feedbackVisibleUntil)
      feedback.hidden = true;
    if (pauseCard) pauseCard.hidden = !player.paused || this.resultCardOpen;
    if (status)
      status.textContent = this.resultCardOpen
        ? "Course time recorded"
        : player.paused
          ? "Run suspended"
          : "Alpine systems online";
    const yetiSnapshot =
      this.renderYetiSnapshot ?? this.yeti.getSnapshot(player.worldY);
    const flashActive =
      !this.accessibilitySettings.reducedMotion &&
      this.accessibilitySettings.flash &&
      performance.now() < this.flashActiveUntilMs;
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
    shell?.setAttribute("data-flash-active", flashActive.toString());
    const modeSnapshot = this.renderModeSnapshot ?? this.modes.getSnapshot();
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
        ? `FINAL ${(displayRun.result.adjustedTimeSeconds ?? displayRun.result.rawTimeSeconds).toFixed(1)}S`
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
    this.updateRuntimeFrame(player);
    const stream = this.stream.getSnapshot();
    this.runtime.art.atlasLoaded = this.textures.exists(PRODUCTION_ATLAS_KEY);
    this.runtime.art.capacityFallbacks = this.spritePool.capacityFallbacks;
    this.runtime.art.fallbackDraws = this.spritePool.fallbackDraws;
    this.runtime.art.frameFallbacks = this.spritePool.frameFallbacks;
    this.runtime.art.missingFrameFallbacks =
      this.spritePool.missingFrameFallbacks;
    this.runtime.art.peakPooledSprites = this.spritePool.peakActiveCount;
    this.runtime.art.pooledSprites = this.spritePool.activeCount;
    this.runtime.art.statusLabelDepth = Math.min(
      this.locationLabel?.depth ?? 0,
      this.runLabel?.depth ?? 0,
    );
    this.runtime.audio = this.audio.getSnapshot();
    const vfx = this.vfx.getSnapshot();
    this.runtime.vfx = vfx;
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
    this.runtime.modes.snapshot =
      this.renderModeSnapshot ?? this.modes.getSnapshot();
    this.runtime.modes.records = this.recordBook;
    this.runtime.modes.storageAvailable = this.storageAvailable;
    this.runtime.livingSlope.scenario = this.livingScenario;
    const livingSlope =
      this.renderLivingSnapshot ?? this.livingSlope.getSnapshot();
    this.runtime.livingSlope.snapshot = livingSlope;
    this.runtime.yeti.snapshot =
      this.renderYetiSnapshot ?? this.yeti.getSnapshot(player.worldY);
    const lifecycle = this.automaticPause.getSnapshot();
    this.runtime.lifecycle.autoPaused = lifecycle.autoPaused;
    this.runtime.lifecycle.reasons = lifecycle.reasons;
    this.runtime.lifecycle.resizeCount = this.resizeCount;
    this.runtime.lifecycle.visibilityState = document.visibilityState;
    this.runtime.performance.frame = this.performanceMonitor.getSnapshot();
    this.runtime.performance.bounds.actorCount = livingSlope.actorCount;
    this.runtime.performance.bounds.pooledSprites = this.spritePool.activeCount;
    this.runtime.performance.bounds.vfxEffects = vfx.activeEffects;
    this.runtime.performance.bounds.vfxTracks = vfx.activeTracks;
    const flashActive =
      !this.accessibilitySettings.reducedMotion &&
      this.accessibilitySettings.flash &&
      performance.now() < this.flashActiveUntilMs;
    this.runtime.presentation.flashActive = flashActive;
    this.runtime.presentation.flashCount = this.flashCount;
    this.runtime.presentation.shakeCount = this.shakeCount;
    this.runtime.presentation.yetiPresentation =
      this.accessibilitySettings.yetiPresentation;
    if (this.fixedSteps - this.lastReplaySnapshotStep >= 60) {
      this.lastReplaySnapshotStep = this.fixedSteps;
      this.runtime.replay = this.replay.getSnapshot();
    }

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
      const snapshot =
        this.renderLivingSnapshot ?? this.livingSlope.getSnapshot();
      living.textContent = `POPULATION ${snapshot.actorCount} · WORK ${snapshot.workUnitsLastStep}`;
    }
    if (boundary) {
      const snapshot =
        this.renderYetiSnapshot ?? this.yeti.getSnapshot(player.worldY);
      boundary.textContent = snapshot.activeBoundaries.length
        ? `BOUNDARY ${snapshot.activeBoundaries.join("/").toUpperCase()} · PHASE ${snapshot.capturePhase.toUpperCase()}`
        : "BOUNDARY CLEAR · PHASE NONE";
    }
    this.updateAudioControl();
  }

  private updateRuntimeFrame(player: PlayerSnapshot): void {
    if (!this.runtime) return;
    this.runtime.player = player;
    const playerFrame = this.skier ? String(this.skier.frame.name) : "fallback";
    const playerPresentation = this.skier
      ? playerPresentationScale(
          playerFrame,
          this.skier.frame.width,
          this.skier.frame.height,
        )
      : undefined;
    this.runtime.art.playerFrame = playerFrame;
    this.runtime.art.playerMinimumRenderedHeight =
      PLAYER_MIN_RENDERED_CONTENT_HEIGHT;
    this.runtime.art.playerRenderedHeight = this.skier
      ? this.skier.frame.height * Math.abs(this.skier.scaleY)
      : 0;
    this.runtime.art.playerTargetRenderedHeight =
      playerPresentation?.targetContentHeight ?? 0;
    if (this.renderYetiSnapshot)
      this.runtime.yeti.snapshot = this.renderYetiSnapshot;
    this.runtime.camera.playerScreenX = this.scale.width * 0.5;
    this.runtime.camera.playerScreenY = this.scale.height * PLAYER_SCREEN_RATIO;
    this.runtime.settings.pointerSteeringEnabled =
      this.inputAdapter?.isPointerEnabled ?? false;
    this.runtime.settings.connectedGamepads =
      this.inputAdapter?.connectedGamepads ?? 0;
    this.runtime.settings.heldActions = this.inputAdapter?.heldActions ?? [];
    this.runtime.settings.settingsPanelOpen =
      this.accessibilityControls?.isOpen ?? false;
    this.runtime.settings.touchControlsEnabled =
      this.inputAdapter?.isTouchEnabled ?? false;
    this.runtime.telemetry.droppedSeconds = this.droppedSeconds;
    this.runtime.telemetry.fixedSteps = this.fixedSteps;
    this.runtime.telemetry.renderFrames = this.renderFrames;
    this.runtime.telemetry.worldTransitions = this.worldTransitions;
  }

  private refreshWorldStream(player: PlayerSnapshot): void {
    const snapshot = this.stream.update({
      velocityY: player.velocityY,
      viewportWidthMeters: this.scale.width / PIXELS_PER_METER,
      worldX: player.worldX,
      worldY: player.worldY,
    });
    if (
      snapshot.currentX !== this.previousChunkX ||
      snapshot.currentY !== this.previousChunkY
    ) {
      this.previousChunkX = snapshot.currentX;
      this.previousChunkY = snapshot.currentY;
      this.worldTransitions += 1;
    }
  }

  private getInteractiveObjects(): readonly InteractiveWorldObject[] {
    if (this.scenario !== "none")
      return this.scenarioObjects.slice(0, MAX_VISIBLE_POPULATED_OBJECTS);
    if (this.trainingMode || this.courseTestMode)
      return EMPTY_INTERACTIVE_OBJECTS;
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
    const player = this.simulation.getSnapshot();
    return objects
      .sort(
        (left, right) =>
          (left.x - player.worldX) ** 2 +
            (left.y - player.worldY) ** 2 -
            ((right.x - player.worldX) ** 2 + (right.y - player.worldY) ** 2) ||
          left.id.localeCompare(right.id),
      )
      .slice(0, MAX_VISIBLE_POPULATED_OBJECTS);
  }

  private getLivingSlopeRamps(): readonly LivingSlopeRamp[] {
    const activeChunks = this.stream.getActiveChunks();
    const deltaRevision = this.interactions.deltas.revision;
    if (
      activeChunks === this.livingSlopeRampChunks &&
      this.scenarioObjects === this.livingSlopeRampScenario &&
      deltaRevision === this.livingSlopeRampDeltaRevision
    ) {
      return this.livingSlopeRampValue;
    }
    const ramps: LivingSlopeRamp[] = [];
    for (const chunk of activeChunks) {
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
    this.livingSlopeRampChunks = activeChunks;
    this.livingSlopeRampScenario = this.scenarioObjects;
    this.livingSlopeRampDeltaRevision = deltaRevision;
    this.livingSlopeRampValue = Object.freeze(
      ramps.sort((left, right) => left.id.localeCompare(right.id)),
    );
    return this.livingSlopeRampValue;
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
    this.courseStagingHold = false;
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
    let player = this.simulation.getSnapshot();
    if (scenario === "mushroom" && !preserveMushroom) {
      this.simulation.reposition(player.worldX, player.worldY, 0, -6);
      player = this.simulation.getSnapshot();
    }
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
        {
          ...createObject(
            "ramp",
            "scenario-ramp",
            player.worldX,
            player.worldY + 5,
          ),
          rampLaunchVelocity: 9.4,
        },
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
          preserveMushroom ? player.worldX : player.worldX - 0.4,
          preserveMushroom ? player.worldY - 0.15 : player.worldY - 1.8,
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
    publish = true,
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
        const expectedDirection =
          snapshot.courses[mode].markers[target - 1]?.expectedSide === "left"
            ? -1
            : 1;
        x = marker.x + expectedDirection * (outcome === "correct" ? 1.1 : -1.1);
      }
    }
    this.scenario = "none";
    this.scenarioObjects = [];
    this.courseStagingHold = true;
    this.simulation.reposition(x, y - 0.15, 0, 0);
    let player = this.simulation.getSnapshot();
    this.modes.syncPosition({
      simulationSeconds: player.simulationSeconds,
      style: this.interactions.getSnapshot().style,
      worldX: player.worldX,
      worldY: player.worldY,
    });
    this.simulation.reposition(x, y + 0.15, 0, 0);
    player = this.simulation.getSnapshot();
    this.modes.step({
      simulationSeconds: player.simulationSeconds,
      style: this.interactions.getSnapshot().style,
      worldX: player.worldX,
      worldY: player.worldY,
    });
    if (publish) this.publishStagedCourseState();
    return true;
  }

  private stageCourseCrossings(
    mode: EventModeId,
    targets: readonly number[],
    outcome: Exclude<MarkerState, "pending">,
  ): boolean {
    if (targets.length === 0) return false;
    for (const target of targets) {
      if (!this.stageCourseCrossing(mode, target, outcome, false)) {
        this.publishStagedCourseState();
        return false;
      }
    }
    this.publishStagedCourseState();
    return true;
  }

  private publishStagedCourseState(): void {
    this.captureModeEvents();
  }

  private publishCurrentModeState(): void {
    const player = this.simulation.getSnapshot();
    this.renderModeSnapshot = this.modes.getSnapshot();
    this.updateHud(player);
    if (this.runtime) {
      this.runtime.player = player;
      this.runtime.modes.snapshot = this.renderModeSnapshot;
      this.runtime.modes.records = this.recordBook;
      this.runtime.modes.storageAvailable = this.storageAvailable;
    }
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
    this.courseStagingHold = false;
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
      for (let index = 0; index < 3; index += 1) {
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
          controller.protectionSeconds <= 0,
      );
      if (!chaser) return false;
      if (chaser.state === "chasing") {
        this.simulation.reposition(chaser.worldX, chaser.worldY, 0, 0);
        this.syncModesToPlayer();
      } else if (chaser.state !== "windup" || yeti.capturedBy !== chaser.id) {
        return false;
      }
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

  private applyAccessibilitySettings(settings: AccessibilitySettings): void {
    this.accessibilitySettings = settings;
    this.audio?.setVolume(settings.volume);
    this.vfx.setReducedMotion(settings.reducedMotion);
    const shell = document.querySelector<HTMLElement>("#game-shell");
    shell?.setAttribute(
      "data-reduced-motion",
      settings.reducedMotion.toString(),
    );
    shell?.setAttribute("data-flash-enabled", settings.flash.toString());
    shell?.setAttribute(
      "data-screen-shake-enabled",
      settings.screenShake.toString(),
    );
    shell?.setAttribute("data-yeti-presentation", settings.yetiPresentation);
    if (settings.reducedMotion || !settings.flash) {
      this.flashActiveUntilMs = 0;
      this.setFlashPresented(false);
    }
    if (this.runtime) {
      this.runtime.settings.accessibility = settings;
      this.runtime.presentation.yetiPresentation = settings.yetiPresentation;
      this.runtime.audio = this.audio.getSnapshot();
      this.runtime.vfx = this.vfx.getSnapshot();
    }
  }

  private setAutomaticPause(
    reason: AutomaticPauseReason,
    active: boolean,
    eventType: LifecycleTelemetryEvent["type"],
  ): void {
    const wasPaused = this.simulation.getSnapshot().paused;
    this.automaticPause.setReason(reason, active);
    const player = this.simulation.getSnapshot();
    if (player.paused !== wasPaused) this.capturePlayerEvents();
    this.recordLifecycle(eventType);
    this.updateHud(player);
    this.updateRuntime(player);
  }

  private presentModeResult(result: ModeResult, record: RunRecord): void {
    const courseName =
      CLASSIC_COURSES.find((course) => course.id === result.mode)?.name ??
      result.mode.replaceAll("-", " ").toUpperCase();
    const finalSeconds = result.adjustedTimeSeconds ?? result.rawTimeSeconds;
    const leader = this.recordBook.buckets[record.bucket][result.mode][0];
    const card = document.querySelector<HTMLElement>("#result-card");
    const eyebrow = document.querySelector<HTMLElement>("#result-eyebrow");
    const title = document.querySelector<HTMLElement>("#result-title");
    const time = document.querySelector<HTMLElement>("#result-time");
    const summary = document.querySelector<HTMLElement>("#result-summary");
    const best = document.querySelector<HTMLElement>("#result-record");
    if (eyebrow) eyebrow.textContent = `${courseName} / COURSE COMPLETE`;
    if (title) title.textContent = "FINISH TIME";
    if (time) time.textContent = `${finalSeconds.toFixed(1)} S`;
    if (summary)
      summary.textContent =
        result.mode === "free-style"
          ? `STYLE ${result.score ?? 0} · TIME RECORDED AS SCORE`
          : result.penaltySeconds > 0
            ? `RAW ${result.rawTimeSeconds.toFixed(1)} S · PENALTY +${result.penaltySeconds.toFixed(1)} S`
            : "CLEAN RUN · TIME RECORDED AS SCORE";
    if (best)
      best.textContent =
        leader?.id === record.id
          ? "NEW COURSE HIGH SCORE"
          : `COURSE BEST ${(leader?.value ?? finalSeconds).toFixed(1)} S`;
    if (card) {
      card.hidden = false;
      card.setAttribute("aria-hidden", "false");
    }
    this.resultCardOpen = true;
    this.inputAdapter?.releaseAll();
    if (!this.simulation.getSnapshot().paused) {
      this.simulation.togglePause();
      this.resultPauseOwned = true;
    }
    this.clock.reset();
    this.capturePlayerEvents();
    document.querySelector<HTMLButtonElement>("#result-close")?.focus();
  }

  private dismissResultCard(continueSkiing: boolean): void {
    if (!this.resultCardOpen) return;
    const card = document.querySelector<HTMLElement>("#result-card");
    if (card) {
      card.hidden = true;
      card.setAttribute("aria-hidden", "true");
    }
    this.resultCardOpen = false;
    const shouldResume =
      continueSkiing &&
      this.resultPauseOwned &&
      this.automaticPause.getSnapshot().reasons.length === 0 &&
      this.simulation.getSnapshot().paused;
    this.resultPauseOwned = false;
    if (shouldResume) this.simulation.togglePause();
    this.inputAdapter?.releaseAll();
    this.clock.reset();
    this.capturePlayerEvents();
    const player = this.simulation.getSnapshot();
    this.updateHud(player);
    this.updateRuntime(player);
    if (continueSkiing) this.game.canvas.focus();
  }

  private recordLifecycle(type: LifecycleTelemetryEvent["type"]): void {
    this.lifecycleEvents.push(
      Object.freeze({
        fixedStep: this.fixedSteps,
        height: this.scale.height,
        paused: this.simulation.getSnapshot().paused,
        type,
        wallTimeMs: performance.now(),
        width: this.scale.width,
      }),
    );
    if (this.lifecycleEvents.length > MAX_TELEMETRY_EVENTS)
      this.lifecycleEvents.shift();
    if (!this.runtime) return;
    const snapshot = this.automaticPause.getSnapshot();
    this.runtime.lifecycle.autoPaused = snapshot.autoPaused;
    this.runtime.lifecycle.reasons = snapshot.reasons;
    this.runtime.lifecycle.resizeCount = this.resizeCount;
    this.runtime.lifecycle.visibilityState = document.visibilityState;
  }

  private presentImpact(kind: "crash" | "yeti"): void {
    const settings = this.accessibilitySettings;
    const gentleYeti =
      kind === "yeti" && settings.yetiPresentation === "reduced";
    if (settings.reducedMotion || gentleYeti) return;
    if (settings.flash) {
      this.flashActiveUntilMs = performance.now() + 120;
      this.flashCount += 1;
      this.setFlashPresented(true);
    }
    if (settings.screenShake) {
      this.cameras.main.shake(
        kind === "yeti" ? 180 : 125,
        kind === "yeti" ? 0.008 : 0.006,
      );
      this.shakeCount += 1;
    }
    if (this.runtime) {
      this.runtime.presentation.flashActive = this.flashPresented;
      this.runtime.presentation.flashCount = this.flashCount;
      this.runtime.presentation.shakeCount = this.shakeCount;
    }
  }

  private syncImpactPresentation(): void {
    if (!this.flashPresented) return;
    if (performance.now() < this.flashActiveUntilMs) return;
    this.setFlashPresented(false);
    if (this.runtime) this.runtime.presentation.flashActive = false;
  }

  private setFlashPresented(active: boolean): void {
    if (this.flashPresented === active) return;
    this.flashPresented = active;
    document
      .querySelector<HTMLElement>("#game-shell")
      ?.setAttribute("data-flash-active", active.toString());
  }

  private exportReplay(): ReplayExport {
    return this.replay.export();
  }

  private exportReplayDownload(): boolean {
    const replay = this.exportReplay();
    if (replay.frames.length === 0) return false;
    try {
      const blob = new Blob([JSON.stringify(replay, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.download = `freeski-replay-${hashSeed(this.worldSeed).toString(16)}.json`;
      anchor.href = url;
      anchor.click();
      URL.revokeObjectURL(url);
      return true;
    } catch {
      return false;
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

  private updateAudioControl(): void {
    const snapshot = this.audio?.getSnapshot();
    if (!snapshot) return;
    const button = document.querySelector<HTMLButtonElement>("#audio-toggle");
    const shell = document.querySelector<HTMLElement>("#game-shell");
    button?.setAttribute("aria-pressed", snapshot.muted.toString());
    if (button)
      button.textContent = snapshot.muted
        ? "SOUND MUTED"
        : snapshot.unlocked
          ? "SOUND ON"
          : "SOUND ARMED";
    shell?.setAttribute("data-audio-unlocked", snapshot.unlocked.toString());
    shell?.setAttribute("data-audio-muted", snapshot.muted.toString());
  }

  private recordInput(event: InputTelemetryEvent): void {
    this.inputEvents.push(event);
    if (this.inputEvents.length > MAX_TELEMETRY_EVENTS)
      this.inputEvents.shift();
    if (this.runtime) this.runtime.lastInput = event.code;
  }

  private capturePlayerEvents(): void {
    const events = this.simulation.drainEvents();
    const player = this.simulation.getSnapshot();
    this.playerEvents.push(...events);
    const cues: Readonly<Partial<Record<PlayerEvent["type"], AlpineSoundCue>>> =
      {
        crashed: "crash",
        jumped: "jump",
        "landed-clean": "landing",
        paused: "pause",
        recovered: "landing",
        reset: "reset",
        resumed: "resume",
        "turbo-off": "turbo-off",
        "turbo-on": "turbo-on",
      };
    for (const event of events) {
      this.vfx.emitPlayer(event, player);
      if (event.type === "crashed") this.presentImpact("crash");
      const cue = cues[event.type];
      if (cue) this.audio.play(cue);
    }
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
    const player = this.simulation.getSnapshot();
    const interactionCues: Readonly<
      Partial<Record<InteractionEvent["type"], AlpineSoundCue>>
    > = {
      "bump-hop": "bump",
      "burning-tree-cleared": "fire-secret",
      crash: "crash",
      "dead-tree-ignited": "fire-secret",
      "dog-knocked": "dog-bark",
      "landed-clean": "landing",
      "landing-crash": "crash",
      "mushroom-created": "mushroom-secret",
      "mushroom-jumped": "mushroom-secret",
      "ramp-launch": "jump",
      "trick-completed": "landing",
      "walking-tree-awake": "walking-tree",
      "yellow-snow": "yellow-snow",
    };
    for (const event of interactionEvents) {
      const object = this.getInteractiveObjects().find(
        (candidate) => candidate.id === event.objectId,
      );
      this.vfx.emitInteraction(
        event,
        object?.x ?? player.worldX,
        object?.y ?? player.worldY,
      );
      const cue = interactionCues[event.type];
      if (cue) this.audio.play(cue);
    }
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
      if (interactionEvents.some((event) => event.type === "trick-completed")) {
        const trick = document.querySelector<HTMLElement>("#trick-label");
        if (trick) trick.textContent = latestVisual.label;
        this.trickVisibleUntil = priorityUntil;
      }
    }
    if (latestAudio) {
      const audio = document.querySelector<HTMLElement>("#audio-cue");
      if (audio) audio.textContent = `AUDIO CUE ${latestAudio.cue}`;
    }
    if (this.runtime && interactionEvents.length > 0) {
      this.runtime.interactions.deltas = this.interactions.deltas.snapshot();
      this.runtime.interactions.snapshot = this.interactions.getSnapshot();
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
      this.audio.play(
        event.type === "mode-started"
          ? "gate-start"
          : event.type === "mode-finished"
            ? "gate-finish"
            : event.type === "marker-correct"
              ? "gate-correct"
              : "gate-penalty",
      );
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
      this.presentModeResult(result, record);
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
          ? `FINAL ${(run.result?.adjustedTimeSeconds ?? run.result?.rawTimeSeconds ?? 0).toFixed(1)}S`
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
    this.publishCurrentModeState();
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
      const cue: AlpineSoundCue =
        event.type === "beginner-fell"
          ? "beginner-fall"
          : event.type === "snowboarder-jumped" ||
              event.type === "snowboarder-tumbled"
            ? "snowboard-air"
            : event.type === "dog-hit"
              ? "dog-bark"
              : event.type === "chair-looped" ||
                  event.type === "chair-rider-dropped"
                ? "lift-clack"
                : event.type === "walking-tree-woke" ||
                    event.type === "walking-tree-moved"
                  ? "walking-tree"
                  : "landing";
      this.audio.play(cue);
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
    if (this.runtime)
      this.runtime.interactions.deltas = this.interactions.deltas.snapshot();
    if (this.runtime) {
      const snapshot = this.livingSlope.getSnapshot();
      this.runtime.livingSlope.snapshot = snapshot;
      this.runtime.performance.bounds.actorCount = snapshot.actorCount;
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
    for (const event of events) {
      const controller = this.yeti
        .getSnapshot(this.simulation.getSnapshot().worldY)
        .controllers.find((candidate) => candidate.id === event.yetiId);
      const gentleYeti =
        this.accessibilitySettings.yetiPresentation === "reduced";
      if (!gentleYeti)
        this.vfx.emitYeti(
          event,
          controller?.worldX ?? this.simulation.getSnapshot().worldX,
          controller?.worldY ?? this.simulation.getSnapshot().worldY,
        );
      if (event.type === "pounced") this.presentImpact("yeti");
      this.audio.play(
        gentleYeti &&
          ["pounced", "grabbed", "eaten", "chewing"].includes(event.type)
          ? "ui-toggle"
          : event.type === "capture-started" || event.type === "yeti-activated"
            ? "yeti-warning"
            : event.type === "pounced"
              ? "yeti-pounce"
              : event.type === "grabbed"
                ? "yeti-grab"
                : event.type === "eaten" || event.type === "chewing"
                  ? "yeti-eat"
                  : "ui-toggle",
      );
    }
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
    this.vfx.reset();
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
