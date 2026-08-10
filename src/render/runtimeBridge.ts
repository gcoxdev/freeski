import type { InputTelemetryEvent } from "../input/browserInput";
import type { PlayerEvent, PlayerSnapshot } from "../simulation/player";
import type {
  FeedbackEvent,
  InteractionEvent,
  InteractionSnapshot,
} from "../simulation/slopeInteractions";
import type { StyleEvent } from "../simulation/style";
import type {
  EventModeId,
  MarkerState,
  ModeEvent,
  ModeSnapshot,
} from "../simulation/modes";
import type { RecordBook } from "../simulation/recordBook";
import type {
  LivingActorEvent,
  LivingSlopeSnapshot,
} from "../simulation/livingSlope";
import type { AlpineAudioSnapshot } from "../audio/AlpineAudio";
import type { AlpineVfxSnapshot } from "./vfx/AlpineVfx";
import type { YetiEvent, YetiSnapshot } from "../simulation/yeti";
import type { ObjectDelta } from "../world/chunkDeltas";

export type GateThreeScenario =
  | "burning-clear"
  | "burning-ignite"
  | "crash-recovery"
  | "mushroom"
  | "none"
  | "ramp-trick";

export type CourseCrossingTarget = "finish" | "start" | number;

export type GateFiveScenario =
  | "chair-drop"
  | "dog-contact"
  | "foreshadow"
  | "none"
  | "population"
  | "yeti-bottom"
  | "yeti-contact";

export interface DescentAuditReport {
  corridorBlockers: number;
  endY: number;
  fixedSteps: number;
  missingChunks: number;
  passed: boolean;
  visitedRows: number;
}

export interface TelemetrySample {
  airHeight: number;
  fixedStep: number;
  heading: string;
  motion: string;
  paused: boolean;
  simulationSeconds: number;
  turbo: boolean;
  velocityX: number;
  velocityY: number;
  worldX: number;
  worldY: number;
}

export interface FreeSkiRuntime {
  art: {
    atlasFrameCount: number;
    atlasLoaded: boolean;
    capacityFallbacks: number;
    fallbackDraws: number;
    frameFallbacks: number;
    missingFrameFallbacks: number;
    peakPooledSprites: number;
    playerRenderedHeight: number;
    pooledSprites: number;
    spriteCapacity: number;
    statusLabelDepth: number;
  };
  audio: AlpineAudioSnapshot;
  camera: {
    playerScreenRatio: number;
    playerScreenX: number;
    playerScreenY: number;
  };
  engine: "phaser-3";
  generatorVersion: string;
  lastInput: string;
  interactions: {
    deltas: Readonly<Record<string, Readonly<ObjectDelta>>>;
    feedbackEvents: FeedbackEvent[];
    interactionEvents: InteractionEvent[];
    scenario: GateThreeScenario;
    snapshot: InteractionSnapshot;
    styleEvents: StyleEvent[];
  };
  modes: {
    events: ModeEvent[];
    records: RecordBook;
    snapshot: ModeSnapshot;
    storageAvailable: boolean;
  };
  livingSlope: {
    events: LivingActorEvent[];
    scenario: GateFiveScenario;
    snapshot: LivingSlopeSnapshot;
  };
  player: PlayerSnapshot;
  ready: boolean;
  seed: string;
  seedHash: number;
  settings: {
    debugVisible: boolean;
    pointerSteeringEnabled: boolean;
    trainingMode: boolean;
  };
  telemetry: {
    droppedSeconds: number;
    fixedSteps: number;
    inputEvents: InputTelemetryEvent[];
    playerEvents: PlayerEvent[];
    renderFrames: number;
    samples: TelemetrySample[];
    worldTransitions: number;
  };
  vfx: AlpineVfxSnapshot;
  world: {
    activeChunks: number;
    aheadRows: readonly number[];
    cachedChunks: number;
    chunkSizeMeters: number;
    corridorWidthMeters: number;
    currentChunk: string;
    generatedSignature: string;
    missingRequiredChunks: number;
    overlaySignature: string;
    visibleObjects: number;
  };
  yeti: {
    events: YetiEvent[];
    snapshot: YetiSnapshot;
  };
}

declare global {
  interface Window {
    __FREE_SKI__?: FreeSkiRuntime;
    __FREE_SKI_DEBUG__?: {
      runAutomatedDescent: (distanceMeters?: number) => DescentAuditReport;
      stageInteractionScenario: (scenario: GateThreeScenario) => boolean;
      stageCourseCrossing: (
        mode: EventModeId,
        target: CourseCrossingTarget,
        outcome?: Exclude<MarkerState, "pending">,
      ) => boolean;
      stageLivingScenario: (scenario: GateFiveScenario) => boolean;
      setVisible: (visible: boolean) => void;
    };
  }
}
