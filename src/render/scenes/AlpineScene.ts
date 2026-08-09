import Phaser from "phaser";
import { GENERATOR_VERSION } from "../../world/generatorVersion";
import { hashSeed } from "../../world/seed";

declare global {
  interface Window {
    __FREE_SKI__?: {
      engine: "phaser-3";
      generatorVersion: string;
      lastInput: string;
      ready: boolean;
      seed: string;
      seedHash: number;
    };
  }
}

const COLORS = {
  glacier: 0xdbe9e9,
  glacierShadow: 0xc3dadc,
  ink: 0x102933,
  powder: 0xf7f9f5,
  signal: 0xe84d2a,
  white: 0xffffff,
} as const;

export class AlpineScene extends Phaser.Scene {
  private readonly worldSeed: string;
  private backdrop?: Phaser.GameObjects.Graphics;
  private beacon?: Phaser.GameObjects.Container;
  private beaconPosition = new Phaser.Math.Vector2();
  private lastViewport = { width: 0, height: 0 };

  constructor(seed: string) {
    super("alpine-baseline");
    this.worldSeed = seed;
  }

  create(): void {
    this.backdrop = this.add.graphics();
    this.drawMountain(this.scale.width, this.scale.height);
    this.createSurveyBeacon();
    this.createLabels();
    this.input.keyboard?.on("keydown", (event: KeyboardEvent) =>
      this.onKey(event),
    );
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);

    const shell = document.querySelector<HTMLElement>("#game-shell");
    const status = document.querySelector<HTMLElement>("#system-label");
    shell?.setAttribute("data-game-ready", "true");
    if (status) status.textContent = "Alpine systems online";

    window.__FREE_SKI__ = {
      engine: "phaser-3",
      generatorVersion: GENERATOR_VERSION,
      lastInput: "none",
      ready: true,
      seed: this.worldSeed,
      seedHash: hashSeed(this.worldSeed),
    };
  }

  private drawMountain(width: number, height: number): void {
    if (!this.backdrop || width <= 0 || height <= 0) return;
    this.lastViewport = { width, height };
    this.backdrop.clear();

    this.backdrop.fillStyle(COLORS.glacier);
    this.backdrop.fillRect(0, 0, width, height);

    this.backdrop.fillStyle(COLORS.powder);
    this.backdrop.fillTriangle(0, 0, width * 0.68, 0, 0, height * 0.88);
    this.backdrop.fillTriangle(
      width * 0.22,
      height,
      width,
      height * 0.18,
      width,
      height,
    );

    this.backdrop.fillStyle(COLORS.glacierShadow, 0.34);
    this.backdrop.fillTriangle(width * 0.72, 0, width, 0, width, height * 0.2);
    this.backdrop.fillTriangle(0, height * 0.9, width * 0.2, height, 0, height);

    const spacing = Math.max(56, Math.min(92, width / 12));
    this.backdrop.lineStyle(1, COLORS.ink, 0.09);
    for (let y = spacing * 0.45; y < height; y += spacing) {
      const bend = Math.sin(y * 0.018) * 18;
      const points = [
        new Phaser.Geom.Point(-20, y + bend),
        new Phaser.Geom.Point(width * 0.28, y - 9),
        new Phaser.Geom.Point(width * 0.56, y + 11),
        new Phaser.Geom.Point(width + 20, y - bend),
      ];
      this.backdrop.strokePoints(points, false, false);
    }

    this.backdrop.lineStyle(2, COLORS.ink, 0.18);
    this.backdrop.lineBetween(width * 0.18, -10, width * 0.45, height + 10);
    this.backdrop.lineStyle(1, COLORS.white, 0.76);
    this.backdrop.lineBetween(
      width * 0.18 + 5,
      -10,
      width * 0.45 + 5,
      height + 10,
    );

    for (let y = 64; y < height; y += 140) {
      const t = y / height;
      const x = Phaser.Math.Linear(width * 0.18, width * 0.45, t);
      this.drawLiftTower(x, y);
    }

    this.backdrop.fillStyle(COLORS.signal, 0.94);
    this.backdrop.fillRect(width - 16, height * 0.12, 3, height * 0.76);
    this.backdrop.fillStyle(COLORS.ink, 0.92);
    this.backdrop.fillRect(width - 19, height * 0.52, 9, 2);
  }

  private drawLiftTower(x: number, y: number): void {
    if (!this.backdrop) return;
    this.backdrop.lineStyle(2, COLORS.ink, 0.28);
    this.backdrop.lineBetween(x - 10, y, x + 10, y);
    this.backdrop.lineBetween(x, y, x, y + 18);
    this.backdrop.fillStyle(COLORS.signal, 0.65);
    this.backdrop.fillCircle(x, y, 2.5);
  }

  private createSurveyBeacon(): void {
    const shadow = this.add.ellipse(0, 9, 46, 15, COLORS.ink, 0.13);
    const halo = this.add.circle(0, 0, 20, COLORS.white, 0.64);
    halo.setStrokeStyle(1, COLORS.ink, 0.17);
    const pointer = this.add.triangle(
      0,
      0,
      0,
      15,
      8,
      -7,
      -8,
      -7,
      COLORS.signal,
      1,
    );
    pointer.setRotation(Math.PI);
    const pin = this.add.circle(0, 0, 3, COLORS.ink, 1);
    this.beacon = this.add.container(0, 0, [shadow, halo, pointer, pin]);
    this.resetBeaconPosition();
  }

  private createLabels(): void {
    this.add
      .text(28, 28, "BASE CAMP / 0000 M", {
        color: "#102933",
        fontFamily: "Courier New, monospace",
        fontSize: "11px",
        fontStyle: "bold",
        letterSpacing: 2,
      })
      .setAlpha(0.76);

    this.add
      .text(28, 48, "SLOPE CALIBRATION RANGE", {
        color: "#536d75",
        fontFamily: "Courier New, monospace",
        fontSize: "9px",
        letterSpacing: 1.5,
      })
      .setAlpha(0.9);

    const readiness = this.add
      .text(0, 0, "RUN 01\nREADY", {
        align: "right",
        color: "#102933",
        fontFamily: "Courier New, monospace",
        fontSize: "10px",
        fontStyle: "bold",
        lineSpacing: 4,
      })
      .setOrigin(1, 0);
    readiness.setPosition(this.scale.width - 32, 28);
  }

  private onKey(event: KeyboardEvent): void {
    const vectors: Record<string, [number, number]> = {
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      KeyA: [-1, 0],
      KeyD: [1, 0],
      KeyS: [0, 1],
      KeyW: [0, -1],
    };
    const vector = vectors[event.code];
    if (!vector || !this.beacon) return;
    event.preventDefault();
    this.beaconPosition.add(
      new Phaser.Math.Vector2(vector[0] * 10, vector[1] * 10),
    );
    this.beaconPosition.x = Phaser.Math.Clamp(
      this.beaconPosition.x,
      28,
      this.lastViewport.width - 28,
    );
    this.beaconPosition.y = Phaser.Math.Clamp(
      this.beaconPosition.y,
      28,
      this.lastViewport.height - 28,
    );
    this.beacon.setPosition(this.beaconPosition.x, this.beaconPosition.y);
    if (window.__FREE_SKI__) window.__FREE_SKI__.lastInput = event.code;
  }

  private onResize(gameSize: Phaser.Structs.Size): void {
    this.drawMountain(gameSize.width, gameSize.height);
    this.resetBeaconPosition();
  }

  private resetBeaconPosition(): void {
    this.beaconPosition.set(this.scale.width * 0.56, this.scale.height * 0.35);
    this.beacon?.setPosition(this.beaconPosition.x, this.beaconPosition.y);
  }
}
