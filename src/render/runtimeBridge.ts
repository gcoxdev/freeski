import type { InputTelemetryEvent } from "../input/browserInput";
import type { PlayerEvent, PlayerSnapshot } from "../simulation/player";

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
    pointerSteeringEnabled: boolean;
  };
  telemetry: {
    droppedSeconds: number;
    fixedSteps: number;
    inputEvents: InputTelemetryEvent[];
    playerEvents: PlayerEvent[];
    renderFrames: number;
    samples: TelemetrySample[];
  };
}

declare global {
  interface Window {
    __FREE_SKI__?: FreeSkiRuntime;
  }
}
