import {
  CLASSIC_COURSES,
  markerExpectedSide,
  type ClassicCourse,
  type CourseMarker,
} from "../world/classicMountain";

export type EventModeId = "free-style" | "slalom" | "tree-slalom";
export type EventMetric = "score" | "time";
export type ModeLifecycle = "active" | "finished" | "idle";
export type MarkerState = "correct" | "missed" | "pending" | "wrong-side";

export interface ModePosition {
  readonly simulationSeconds: number;
  readonly style: number;
  readonly worldX: number;
  readonly worldY: number;
}

export interface MarkerSnapshot extends CourseMarker {
  readonly expectedSide: "left" | "right";
  readonly resolvedAtSeconds: number | null;
  readonly state: MarkerState;
}

export interface ModeResult {
  readonly adjustedTimeSeconds: number | null;
  readonly finishedAtSeconds: number;
  readonly mode: EventModeId;
  readonly penaltySeconds: number;
  readonly rawTimeSeconds: number;
  readonly score: number | null;
}

export function metricForMode(mode: EventModeId): EventMetric {
  return mode === "free-style" ? "score" : "time";
}

export interface ModeSnapshot {
  readonly activeMode: EventModeId | null;
  readonly courses: Readonly<Record<EventModeId, CourseRunSnapshot>>;
  readonly lastEvent: ModeEventType | "none";
}

export interface CourseRunSnapshot {
  readonly elapsedSeconds: number;
  readonly id: EventModeId;
  readonly lifecycle: ModeLifecycle;
  readonly markers: readonly MarkerSnapshot[];
  readonly penaltySeconds: number;
  readonly result: ModeResult | null;
  readonly styleEarned: number;
}

export type ModeEventType =
  | "marker-correct"
  | "marker-missed"
  | "marker-wrong-side"
  | "mode-finished"
  | "mode-started";

export interface ModeEvent {
  readonly atSeconds: number;
  readonly id: string;
  readonly markerIndex: number | null;
  readonly mode: EventModeId;
  readonly penaltySeconds: number;
  readonly type: ModeEventType;
}

interface MutableMarker {
  readonly color: "blue" | "red";
  readonly expectedSide: "left" | "right";
  readonly index: number;
  readonly x: number;
  readonly y: number;
  resolvedAtSeconds: number | null;
  state: MarkerState;
}

interface MutableCourseRun {
  readonly definition: ClassicCourse & { readonly id: EventModeId };
  elapsedSeconds: number;
  lifecycle: ModeLifecycle;
  readonly markers: MutableMarker[];
  penaltySeconds: number;
  result: ModeResult | null;
  startedAtSeconds: number | null;
  styleAtStart: number;
  styleEarned: number;
}

function isEventMode(course: ClassicCourse): course is ClassicCourse & {
  readonly id: EventModeId;
} {
  return course.id !== "open";
}

function newRun(
  definition: ClassicCourse & { readonly id: EventModeId },
): MutableCourseRun {
  return {
    definition,
    elapsedSeconds: 0,
    lifecycle: "idle",
    markers: definition.markers.map((marker) => ({
      ...marker,
      expectedSide: markerExpectedSide(marker),
      resolvedAtSeconds: null,
      state: "pending",
    })),
    penaltySeconds: 0,
    result: null,
    startedAtSeconds: null,
    styleAtStart: 0,
    styleEarned: 0,
  };
}

function crossedDownhill(previousY: number, currentY: number, lineY: number) {
  return previousY < lineY && currentY >= lineY;
}

function crossingX(
  previous: ModePosition,
  current: ModePosition,
  lineY: number,
): number {
  const distanceY = current.worldY - previous.worldY;
  if (Math.abs(distanceY) < Number.EPSILON) return current.worldX;
  const ratio = (lineY - previous.worldY) / distanceY;
  return previous.worldX + (current.worldX - previous.worldX) * ratio;
}

function insideGate(x: number, gate: ClassicCourse["startGate"]): boolean {
  return x >= gate.leftX && x <= gate.rightX;
}

/** Engine-independent lifecycle for the three diegetic mountain events. */
export class MountainModeSimulation {
  private activeMode: EventModeId | null = null;
  private readonly events: ModeEvent[] = [];
  private eventSequence = 0;
  private previous: ModePosition | null = null;
  private runs = this.createRuns();

  step(position: Readonly<ModePosition>): void {
    if (!Number.isFinite(position.simulationSeconds))
      throw new RangeError("simulationSeconds must be finite");
    if (!Number.isFinite(position.worldX) || !Number.isFinite(position.worldY))
      throw new RangeError("world position must be finite");
    if (!Number.isFinite(position.style))
      throw new RangeError("style must be finite");
    const previous = this.previous;
    this.previous = { ...position };
    if (!previous) return;

    if (!this.activeMode) this.detectStart(previous, position);
    const run = this.activeMode ? this.runs[this.activeMode] : null;
    if (!run || run.lifecycle !== "active") return;
    run.elapsedSeconds = Math.max(
      0,
      position.simulationSeconds - (run.startedAtSeconds ?? 0),
    );
    run.styleEarned = Math.max(0, position.style - run.styleAtStart);
    this.resolveMarkers(run, previous, position);
    this.detectFinish(run, previous, position);
  }

  syncPosition(position: Readonly<ModePosition>): void {
    this.previous = { ...position };
  }

  reset(): void {
    this.activeMode = null;
    this.events.length = 0;
    this.eventSequence = 0;
    this.previous = null;
    this.runs = this.createRuns();
  }

  drainEvents(): ModeEvent[] {
    return this.events.splice(0);
  }

  getSnapshot(): ModeSnapshot {
    return Object.freeze({
      activeMode: this.activeMode,
      courses: Object.freeze({
        "free-style": this.snapshotRun(this.runs["free-style"]),
        slalom: this.snapshotRun(this.runs.slalom),
        "tree-slalom": this.snapshotRun(this.runs["tree-slalom"]),
      }),
      lastEvent: this.events.at(-1)?.type ?? "none",
    });
  }

  private createRuns(): Record<EventModeId, MutableCourseRun> {
    const courses = CLASSIC_COURSES.filter(isEventMode);
    return {
      "free-style": newRun(
        courses.find((course) => course.id === "free-style")!,
      ),
      slalom: newRun(courses.find((course) => course.id === "slalom")!),
      "tree-slalom": newRun(
        courses.find((course) => course.id === "tree-slalom")!,
      ),
    };
  }

  private detectStart(previous: ModePosition, current: ModePosition): void {
    for (const course of CLASSIC_COURSES.filter(isEventMode)) {
      const run = this.runs[course.id];
      if (run.lifecycle !== "idle") continue;
      if (!crossedDownhill(previous.worldY, current.worldY, course.startGate.y))
        continue;
      const x = crossingX(previous, current, course.startGate.y);
      if (!insideGate(x, course.startGate)) continue;
      run.lifecycle = "active";
      run.startedAtSeconds = current.simulationSeconds;
      run.styleAtStart = current.style;
      this.activeMode = course.id;
      this.emit("mode-started", run, current.simulationSeconds, null);
      return;
    }
  }

  private resolveMarkers(
    run: MutableCourseRun,
    previous: ModePosition,
    current: ModePosition,
  ): void {
    for (const marker of run.markers) {
      if (marker.state !== "pending") continue;
      if (!crossedDownhill(previous.worldY, current.worldY, marker.y)) continue;
      const x = crossingX(previous, current, marker.y);
      const laneLeft = run.definition.centerX - run.definition.halfWidth;
      const laneRight = run.definition.centerX + run.definition.halfWidth;
      if (x < laneLeft || x > laneRight) {
        marker.state = "missed";
        marker.resolvedAtSeconds = current.simulationSeconds;
        run.penaltySeconds += 5;
        this.emit(
          "marker-missed",
          run,
          current.simulationSeconds,
          marker.index,
        );
        continue;
      }
      const side = x < marker.x ? "left" : "right";
      marker.state = side === marker.expectedSide ? "correct" : "wrong-side";
      marker.resolvedAtSeconds = current.simulationSeconds;
      if (marker.state === "wrong-side") run.penaltySeconds += 5;
      this.emit(
        marker.state === "correct" ? "marker-correct" : "marker-wrong-side",
        run,
        current.simulationSeconds,
        marker.index,
      );
    }
  }

  private detectFinish(
    run: MutableCourseRun,
    previous: ModePosition,
    current: ModePosition,
  ): void {
    const gate = run.definition.finishGate;
    if (!crossedDownhill(previous.worldY, current.worldY, gate.y)) return;
    const x = crossingX(previous, current, gate.y);
    if (!insideGate(x, gate)) return;
    for (const marker of run.markers) {
      if (marker.state !== "pending") continue;
      marker.state = "missed";
      marker.resolvedAtSeconds = current.simulationSeconds;
      run.penaltySeconds += 5;
      this.emit("marker-missed", run, current.simulationSeconds, marker.index);
    }
    const rawTimeSeconds = Math.max(
      0,
      current.simulationSeconds - (run.startedAtSeconds ?? 0),
    );
    run.elapsedSeconds = rawTimeSeconds;
    run.styleEarned = Math.max(0, current.style - run.styleAtStart);
    run.result = Object.freeze({
      adjustedTimeSeconds:
        run.definition.id === "free-style"
          ? null
          : rawTimeSeconds + run.penaltySeconds,
      finishedAtSeconds: current.simulationSeconds,
      mode: run.definition.id,
      penaltySeconds: run.penaltySeconds,
      rawTimeSeconds,
      score: run.definition.id === "free-style" ? run.styleEarned : null,
    });
    run.lifecycle = "finished";
    this.activeMode = null;
    this.emit("mode-finished", run, current.simulationSeconds, null);
  }

  private emit(
    type: ModeEventType,
    run: MutableCourseRun,
    atSeconds: number,
    markerIndex: number | null,
  ): void {
    this.events.push(
      Object.freeze({
        atSeconds,
        id: `mode-event-${this.eventSequence++}`,
        markerIndex,
        mode: run.definition.id,
        penaltySeconds: run.penaltySeconds,
        type,
      }),
    );
  }

  private snapshotRun(run: MutableCourseRun): CourseRunSnapshot {
    return Object.freeze({
      elapsedSeconds: run.elapsedSeconds,
      id: run.definition.id,
      lifecycle: run.lifecycle,
      markers: Object.freeze(
        run.markers.map((marker) => Object.freeze({ ...marker })),
      ),
      penaltySeconds: run.penaltySeconds,
      result: run.result,
      styleEarned: run.styleEarned,
    });
  }
}
