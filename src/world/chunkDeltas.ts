export interface ObjectDelta {
  consumed?: boolean;
  destroyed?: boolean;
  npcState?: "active" | "fled" | "finished";
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
}
