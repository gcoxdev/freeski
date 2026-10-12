import Phaser from "phaser";
import type { InteractiveWorldObject } from "../simulation/slopeInteractions";
import type { ObjectDelta } from "../world/chunkDeltas";
import { MOGUL_PATCH } from "../world/mogulPatch";
import { burningTreeFrame } from "./burningTreePresentation";
import type { AtlasSpritePool } from "./atlas/AtlasSpritePool";
import { COLORS, PIXELS_PER_METER } from "./presentationConstants";
import { worldDepth } from "./worldDepth";

/** Owns terrain art selection and drawing independently of game orchestration. */
export class TerrainRenderer {
  constructor(
    private readonly background: Phaser.GameObjects.Graphics,
    private readonly spritePool: AtlasSpritePool,
  ) {}
  draw(
    object: Pick<
      InteractiveWorldObject,
      "id" | "interaction" | "type" | "variant" | "x" | "y"
    >,
    x: number,
    y: number,
    delta?: Readonly<ObjectDelta>,
    simulationSeconds = 0,
  ): void {
    if (!this.background) return;
    const scale = Math.max(0.75, object.interaction.footprint.radius * 0.75);
    const atlasFrame = this.interactiveAtlasFrame(
      object,
      delta,
      simulationSeconds,
    );
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
        this.spritePool.draw(
          atlasFrame,
          x,
          y +
            (object.type === "mogul"
              ? MOGUL_PATCH.drawOffsetYMeters * PIXELS_PER_METER
              : 7),
          {
            depth: display.depth === 5 ? 5 : worldDepth(y),
            displayHeight: display.height,
            originY: display.originY,
            tint: delta?.burned ? 0x879397 : undefined,
          },
        )
      ) {
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
      this.background.fillTriangle(x - 14, y - 16, x + 14, y - 16, x, y + 18);
      this.background.lineStyle(2, COLORS.blueSuit, 0.72);
      this.background.lineBetween(x - 14, y - 16, x, y + 18);
      this.background.lineBetween(x + 14, y - 16, x, y + 18);
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
      object.type === "mogul" &&
      object.interaction.footprint.shape === "polygon"
    ) {
      this.background.fillStyle(COLORS.glacierShadow, 0.8);
      this.background.fillPoints(
        object.interaction.footprint.points.map(
          (point) =>
            new Phaser.Geom.Point(
              x + point.x * PIXELS_PER_METER,
              y + point.y * PIXELS_PER_METER,
            ),
        ),
        true,
      );
      return;
    }
    if (object.type === "bump-small" || object.type === "bump-large") {
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
    simulationSeconds = 0,
  ): string | null {
    if (delta?.form === "mushroom") return "secret/mushroom";
    if (object.type === "tree") {
      if (delta?.burning) {
        return burningTreeFrame(simulationSeconds, object.id);
      }
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
      mogul: MOGUL_PATCH.heightMeters * PIXELS_PER_METER,
      ramp: 108,
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
        object.type === "mogul"
          ? MOGUL_PATCH.originY
          : object.type === "ramp"
            ? 0.79
            : object.type === "chairlift"
              ? 0.52
              : object.type === "dog"
                ? 0.88
                : 0.94,
      shadowScale: ground ? 1.15 : 0.72,
    };
  }
}
