# FreeSki preproduction kit

This workspace contains the research and approval package for **FreeSki**, a clean-room, modern 2D reimagining of the 1991 game _SkiFree_.

## Review order

1. Read [the research and design brief](docs/SKIFREE_RESEARCH_AND_DESIGN.md).
2. Review the six transparent PNG sheets in [assets/sprite-sheets](assets/sprite-sheets/README.md).
3. Approve or amend the decisions in the brief's approval checklist.
4. Paste [the gauntlet-loop prompt](docs/GAUNTLET_LOOP_PROMPT.md) into a new build session.

The generated art is a visual-direction package. It is intentionally separated from the original game's copyrighted bitmap resources and is not yet a production-cut atlas with per-frame pivots and collision metadata.

## Run FreeSki

FreeSki requires Node.js 22.12 or newer. Install and launch the browser build:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite and ski immediately.

Cross one of the three start gates on the mountain to enter Slalom, Free Style,
or Tree Slalom. There is no mode-selection menu: gates, markers, penalties, and
finish lines are part of the skiable world, and open skiing remains available
between them. The browser keeps a local top ten for every event, with separate
leaderboards for the classic mountain and generated seeds.

The slope is live around the courses: beginners fall and recover, fast
snowboarders enter from above or the lift, dogs and walking trees react to the
player, and occupied chairs loop continuously. The weather begins to turn
after 1,800 m; what happens beyond the formal mountain is intentionally left as
a surprise, and Turbo may buy some breathing room.

| Action              | Keyboard                                           |
| ------------------- | -------------------------------------------------- |
| Carve left/right    | Left/right arrows or A/D; hold to deepen the carve |
| Traverse/ski uphill | Up arrow or W                                      |
| Point downhill/tuck | Down arrow or S                                    |
| Brake               | Shift or B                                         |
| Jump                | Space                                              |
| Spin left/right     | Q/E while airborne                                 |
| Back/front flip     | Z/X while airborne                                 |
| Turbo               | F                                                  |
| Pause               | Escape or F3                                       |
| Reset run           | R or F2                                            |

Optional pointer steering and click-to-jump are disabled by default. Enable them with the **POINTER OFF** control below the game or add `?pointer=1` to the URL.

Terrain interactions use small ground footprints and independent air-clearance heights rather than visible sprite rectangles. Press **G** to inspect those footprints, chunk bounds, and the guaranteed corridor during development.

Project checks are available as separate CI-friendly scripts:

```bash
npm run format:check
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

`src/render/` is the Phaser boundary. Deterministic, engine-independent code lives in `src/simulation/` and `src/world/`.

## Contents

- `docs/SKIFREE_RESEARCH_AND_DESIGN.md` — mechanics, map reconstruction, procedural-generation proposal, asset inventory, and acceptance targets.
- `docs/GAUNTLET_LOOP_PROMPT.md` — copy/paste implementation prompt with iterative quality gates.
- `assets/sprite-sheets/*.png` — alpha-processed ultra-realistic concept sheets.
- `assets/sprite-sheets/manifest.json` — cell order, intended states, and atlas-production notes.
- `assets/sprite-sheets/source-chroma/` — unprocessed magenta-key generation outputs retained for review and future re-matting.
