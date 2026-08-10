export interface ObjectDelta {
  burned?: boolean;
  burning?: boolean;
  consumed?: boolean;
  destroyed?: boolean;
  form?: "mushroom";
  npcState?: "active" | "awake" | "fled" | "finished" | "knocked";
  offsetX?: number;
  yellowSnow?: boolean;
}

export class ChunkDeltaStore {
  private readonly deltas = new Map<string, Readonly<ObjectDelta>>();
  private revisionValue = 0;

  get revision(): number {
    return this.revisionValue;
  }

  get(objectId: string): Readonly<ObjectDelta> | undefined {
    return this.deltas.get(objectId);
  }

  patch(objectId: string, delta: ObjectDelta): void {
    this.deltas.set(
      objectId,
      Object.freeze({ ...this.deltas.get(objectId), ...delta }),
    );
    this.revisionValue += 1;
  }

  clear(): void {
    if (this.deltas.size === 0) return;
    this.deltas.clear();
    this.revisionValue += 1;
  }

  snapshot(): Readonly<Record<string, Readonly<ObjectDelta>>> {
    return Object.freeze(Object.fromEntries(this.deltas.entries()));
  }
}
