export type ScorePresetName = "classic" | "modern";

export type StyleEventType =
  | "back-flip"
  | "burning-tree-clear"
  | "bump-hop"
  | "clean-landing"
  | "failed-landing"
  | "front-flip"
  | "mushroom-jump"
  | "obstacle-clear"
  | "obstacle-crash"
  | "ramp-takeoff"
  | "spin-left-360"
  | "spin-right-360"
  | "yellow-snow";

/** Source-level values retained as tuning anchors, never sampled per frame. */
export const CLASSIC_SCORE_ANCHORS = Object.freeze({
  advancedAirPosePerTick: 2,
  burningTreeClear: 1_000,
  failedLanding: -64,
  mushroomJump: 100,
  obstacleClear: 4,
  obstacleCrash: -32,
  terrainInteraction: 1,
  yellowSnow: -16,
});

/** Approved default: named, once-per-event awards. */
export const MODERN_EVENT_AWARDS: Readonly<Record<StyleEventType, number>> =
  Object.freeze({
    "back-flip": 200,
    "burning-tree-clear": 1_000,
    "bump-hop": 10,
    "clean-landing": 40,
    "failed-landing": -125,
    "front-flip": 200,
    "mushroom-jump": 100,
    "obstacle-clear": 35,
    "obstacle-crash": -100,
    "ramp-takeoff": 25,
    "spin-left-360": 150,
    "spin-right-360": 150,
    "yellow-snow": -25,
  });

export interface StyleEvent {
  readonly atSeconds: number;
  readonly id: string;
  readonly points: number;
  readonly total: number;
  readonly type: StyleEventType;
}

export class StyleScoring {
  private readonly awarded = new Set<string>();
  private readonly events: StyleEvent[] = [];
  private totalValue = 0;

  constructor(readonly preset: ScorePresetName = "modern") {}

  get total(): number {
    return this.totalValue;
  }

  award(
    type: StyleEventType,
    eventId: string,
    atSeconds: number,
  ): StyleEvent | undefined {
    if (this.awarded.has(eventId)) return undefined;
    this.awarded.add(eventId);
    const points =
      this.preset === "modern"
        ? MODERN_EVENT_AWARDS[type]
        : classicPointsFor(type);
    this.totalValue = Math.max(0, this.totalValue + points);
    const event = Object.freeze({
      atSeconds,
      id: eventId,
      points,
      total: this.totalValue,
      type,
    });
    this.events.push(event);
    return event;
  }

  drainEvents(): StyleEvent[] {
    return this.events.splice(0);
  }

  reset(): void {
    this.awarded.clear();
    this.events.length = 0;
    this.totalValue = 0;
  }
}

function classicPointsFor(type: StyleEventType): number {
  if (type === "burning-tree-clear")
    return CLASSIC_SCORE_ANCHORS.burningTreeClear;
  if (type === "mushroom-jump") return CLASSIC_SCORE_ANCHORS.mushroomJump;
  if (type === "failed-landing") return CLASSIC_SCORE_ANCHORS.failedLanding;
  if (type === "obstacle-crash") return CLASSIC_SCORE_ANCHORS.obstacleCrash;
  if (type === "obstacle-clear") return CLASSIC_SCORE_ANCHORS.obstacleClear;
  if (type === "yellow-snow") return CLASSIC_SCORE_ANCHORS.yellowSnow;
  if (type === "bump-hop" || type === "ramp-takeoff")
    return CLASSIC_SCORE_ANCHORS.terrainInteraction;
  return CLASSIC_SCORE_ANCHORS.advancedAirPosePerTick;
}
