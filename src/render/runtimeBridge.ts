import type { InputTelemetryEvent } from "../input/browserInput";
import type { PlayerEvent, PlayerSnapshot } from "../simulation/player";

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
  camera: {
    playerScreenRatio: number;
    playerScreenX: number;
    playerScreenY: number;
  };
  engine: "phaser-3";
  generatorVersion: string;
  lastInput: string;
  player: PlayerSnapshot;
  ready: boolean;
  seed: string;
  seedHash: number;
  settings: {
    debugVisible: boolean;
    pointerSteeringEnabled: boolean;
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
}

declare global {
  interface Window {
    __FREE_SKI__?: FreeSkiRuntime;
    __FREE_SKI_DEBUG__?: {
      runAutomatedDescent: (distanceMeters?: number) => DescentAuditReport;
      setVisible: (visible: boolean) => void;
    };
  }
}
