const BURNING_TREE_FRAMES = [
  "terrain/burning-tree-a",
  "terrain/burning-tree-b",
  "terrain/burning-tree-c",
] as const;

export function burningTreeFrame(
  simulationSeconds: number,
  objectId: string,
): (typeof BURNING_TREE_FRAMES)[number] {
  const idPhase = [...objectId].reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );
  return BURNING_TREE_FRAMES[
    (Math.floor(simulationSeconds * 8) + idPhase) % BURNING_TREE_FRAMES.length
  ]!;
}
