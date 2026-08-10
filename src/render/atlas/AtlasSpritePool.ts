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
  static readonly MAX_SPRITES = 196;

  private readonly images: Phaser.GameObjects.Image[] = [];
  private cursor = 0;

  constructor(private readonly scene: Phaser.Scene) {}

  beginFrame(): void {
    this.cursor = 0;
  }

  draw(
    frameName: string,
    x: number,
    y: number,
    options: Readonly<AtlasDrawOptions>,
  ): Phaser.GameObjects.Image | null {
    if (
      !this.scene.textures.exists(PRODUCTION_ATLAS_KEY) ||
      !this.scene.textures.get(PRODUCTION_ATLAS_KEY).has(frameName) ||
      this.cursor >= AtlasSpritePool.MAX_SPRITES
    )
      return null;
    const image =
      this.images[this.cursor] ??
      this.scene.add.image(x, y, PRODUCTION_ATLAS_KEY, frameName);
    if (!this.images[this.cursor]) this.images.push(image);
    this.cursor += 1;
    image
      .setTexture(PRODUCTION_ATLAS_KEY, frameName)
      .setPosition(x, y)
      .setOrigin(options.originX ?? 0.5, options.originY ?? 0.92)
      .setDepth(options.depth ?? 5)
      .setAlpha(options.alpha ?? 1)
      .setRotation(options.rotation ?? 0)
      .setFlipX(options.flipX ?? false)
      .setVisible(true)
      .clearTint();
    if (options.tint !== undefined) image.setTint(options.tint);
    const frame = image.frame;
    const ratio = frame.realWidth / Math.max(1, frame.realHeight);
    image.setDisplaySize(
      options.displayWidth ?? options.displayHeight * ratio,
      options.displayHeight,
    );
    return image;
  }

  endFrame(): void {
    for (let index = this.cursor; index < this.images.length; index += 1)
      this.images[index]!.setVisible(false);
  }

  get activeCount(): number {
    return this.cursor;
  }

  get capacity(): number {
    return AtlasSpritePool.MAX_SPRITES;
  }

  destroy(): void {
    for (const image of this.images) image.destroy();
    this.images.length = 0;
  }
}
