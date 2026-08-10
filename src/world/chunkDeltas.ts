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
  private readonly deltas = new Map<string, ObjectDelta>();

  get(objectId: string): Readonly<ObjectDelta> | undefined {
    const delta = this.deltas.get(objectId);
    return delta ? Object.freeze({ ...delta }) : undefined;
  }

  patch(objectId: string, delta: ObjectDelta): void {
    this.deltas.set(objectId, { ...this.deltas.get(objectId), ...delta });
  }

  clear(): void {
    this.deltas.clear();
  }

  snapshot(): Readonly<Record<string, Readonly<ObjectDelta>>> {
    return Object.freeze(
      Object.fromEntries(
        [...this.deltas.entries()].map(([id, delta]) => [
          id,
          Object.freeze({ ...delta }),
        ]),
      ),
    );
  }
}
