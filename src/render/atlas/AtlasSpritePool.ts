import type Phaser from "phaser";

export const PRODUCTION_ATLAS_KEY = "freeski-production-atlas";
export const PRODUCTION_ATLAS_IMAGE = "/assets/production/freeski-atlas.png";
export const PRODUCTION_ATLAS_DATA = "/assets/production/freeski-atlas.json";

export interface AtlasDrawOptions {
  readonly alpha?: number;
  readonly depth?: number;
  readonly displayHeight: number;
  readonly displayWidth?: number;
  readonly flipX?: boolean;
  readonly originX?: number;
  readonly originY?: number;
  readonly rotation?: number;
  readonly tint?: number;
}

/** A bounded render-only pool for the production atlas. */
export class AtlasSpritePool {
  static readonly MAX_SPRITES = 512;

  private readonly images: Phaser.GameObjects.Image[] = [];
  private cursor = 0;
  private capacityFallbacksValue = 0;
  private frameFallbacksValue = 0;
  private missingFrameFallbacksValue = 0;
  private peakActiveValue = 0;
  private totalFallbacksValue = 0;

  constructor(private readonly scene: Phaser.Scene) {}

  beginFrame(): void {
    this.cursor = 0;
    this.frameFallbacksValue = 0;
  }

  draw(
    frameName: string,
    x: number,
    y: number,
    options: Readonly<AtlasDrawOptions>,
  ): Phaser.GameObjects.Image | null {
    if (
      !this.scene.textures.exists(PRODUCTION_ATLAS_KEY) ||
      !this.scene.textures.get(PRODUCTION_ATLAS_KEY).has(frameName)
    ) {
      this.recordFallback("missing");
      return null;
    }
    if (this.cursor >= AtlasSpritePool.MAX_SPRITES) {
      this.recordFallback("capacity");
      return null;
    }
    const image =
      this.images[this.cursor] ??
      this.scene.add.image(x, y, PRODUCTION_ATLAS_KEY, frameName);
    if (!this.images[this.cursor]) this.images.push(image);
    this.cursor += 1;
    this.peakActiveValue = Math.max(this.peakActiveValue, this.cursor);
    if (
      image.texture.key !== PRODUCTION_ATLAS_KEY ||
      image.frame.name !== frameName
    )
      image.setTexture(PRODUCTION_ATLAS_KEY, frameName);
    if (image.x !== x || image.y !== y) image.setPosition(x, y);
    const originX = options.originX ?? 0.5;
    const originY = options.originY ?? 0.92;
    if (image.originX !== originX || image.originY !== originY)
      image.setOrigin(originX, originY);
    const depth = options.depth ?? 5;
    if (image.depth !== depth) image.setDepth(depth);
    const alpha = options.alpha ?? 1;
    if (image.alpha !== alpha) image.setAlpha(alpha);
    const rotation = options.rotation ?? 0;
    if (image.rotation !== rotation) image.setRotation(rotation);
    const flipX = options.flipX ?? false;
    if (image.flipX !== flipX) image.setFlipX(flipX);
    if (!image.visible) image.setVisible(true);
    if (options.tint !== undefined) image.setTint(options.tint);
    else if (image.isTinted) image.clearTint();
    const frame = image.frame;
    const ratio = frame.realWidth / Math.max(1, frame.realHeight);
    const displayWidth = options.displayWidth ?? options.displayHeight * ratio;
    if (
      Math.abs(image.displayWidth - displayWidth) > 0.01 ||
      Math.abs(image.displayHeight - options.displayHeight) > 0.01
    )
      image.setDisplaySize(displayWidth, options.displayHeight);
    return image;
  }

  endFrame(): void {
    for (let index = this.cursor; index < this.images.length; index += 1)
      if (this.images[index]!.visible) this.images[index]!.setVisible(false);
  }

  get activeCount(): number {
    return this.cursor;
  }

  get capacity(): number {
    return AtlasSpritePool.MAX_SPRITES;
  }

  get capacityFallbacks(): number {
    return this.capacityFallbacksValue;
  }

  get fallbackDraws(): number {
    return this.totalFallbacksValue;
  }

  get frameFallbacks(): number {
    return this.frameFallbacksValue;
  }

  get missingFrameFallbacks(): number {
    return this.missingFrameFallbacksValue;
  }

  get peakActiveCount(): number {
    return this.peakActiveValue;
  }

  destroy(): void {
    for (const image of this.images) image.destroy();
    this.images.length = 0;
  }

  private recordFallback(kind: "capacity" | "missing"): void {
    this.frameFallbacksValue += 1;
    this.totalFallbacksValue += 1;
    if (kind === "capacity") this.capacityFallbacksValue += 1;
    else this.missingFrameFallbacksValue += 1;
  }
}
