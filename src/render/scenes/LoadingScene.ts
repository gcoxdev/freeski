import Phaser from "phaser";
import {
  PRODUCTION_ATLAS_KEY,
  PRODUCTION_ATLAS_IMAGE,
  PRODUCTION_ATLAS_DATA,
} from "../atlas/AtlasSpritePool";

/** Keep gameplay stopped until required assets load; retry only restarts this scene. */
export class LoadingScene extends Phaser.Scene {
  private failed = false;
  constructor() {
    super("loading");
  }

  preload(): void {
    this.failed = false;
    const status = document.getElementById("loading-status");
    const progress = document.getElementById("loading-progress");
    const retry = document.getElementById("loading-retry");
    if (retry) retry.hidden = true;
    if (status) status.textContent = "Loading alpine atlas…";
    this.load.on("progress", (value: number) => {
      if (progress) progress.style.width = `${Math.round(value * 100)}%`;
    });
    this.load.on("loaderror", () => {
      this.failed = true;
    });
    this.load.atlas(
      PRODUCTION_ATLAS_KEY,
      PRODUCTION_ATLAS_IMAGE,
      PRODUCTION_ATLAS_DATA,
    );
  }

  create(): void {
    const texture = this.textures.exists(PRODUCTION_ATLAS_KEY)
      ? this.textures.get(PRODUCTION_ATLAS_KEY)
      : null;
    if (
      !this.failed &&
      texture?.has("player/heading-downhill") &&
      texture.has("terrain/rainbow-ramp")
    ) {
      this.scene.start("alpine-baseline");
      return;
    }
    const status = document.getElementById("loading-status");
    const retry = document.getElementById("loading-retry");
    if (status)
      status.textContent =
        "The slope artwork could not load. Check your connection and try again.";
    if (retry) {
      retry.hidden = false;
      retry.onclick = () => {
        if (this.textures.exists(PRODUCTION_ATLAS_KEY))
          this.textures.remove(PRODUCTION_ATLAS_KEY);
        this.load.off("progress");
        this.load.off("loaderror");
        this.scene.restart();
      };
      retry.focus();
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (retry) retry.onclick = null;
    });
  }
}
