# FreeSki preproduction kit

This workspace contains the research and approval package for **FreeSki**, a clean-room, modern 2D reimagining of the 1991 game *SkiFree*.

## Review order

1. Read [the research and design brief](docs/SKIFREE_RESEARCH_AND_DESIGN.md).
2. Review the six transparent PNG sheets in [assets/sprite-sheets](assets/sprite-sheets/README.md).
3. Approve or amend the decisions in the brief's approval checklist.
4. Paste [the gauntlet-loop prompt](docs/GAUNTLET_LOOP_PROMPT.md) into a new build session.

The generated art is a visual-direction package. It is intentionally separated from the original game's copyrighted bitmap resources and is not yet a production-cut atlas with per-frame pivots and collision metadata.

## Contents

- `docs/SKIFREE_RESEARCH_AND_DESIGN.md` — mechanics, map reconstruction, procedural-generation proposal, asset inventory, and acceptance targets.
- `docs/GAUNTLET_LOOP_PROMPT.md` — copy/paste implementation prompt with iterative quality gates.
- `assets/sprite-sheets/*.png` — alpha-processed ultra-realistic concept sheets.
- `assets/sprite-sheets/manifest.json` — cell order, intended states, and atlas-production notes.
- `assets/sprite-sheets/source-chroma/` — unprocessed magenta-key generation outputs retained for review and future re-matting.

