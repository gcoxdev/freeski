# FreeSki

FreeSki is a clean-room, modern 2D downhill skiing game inspired by the feel of early desktop ski games. It combines deterministic fixed-step simulation, a seeded streaming mountain, three in-world events, a living slope, an original Yeti encounter, a production sprite atlas, bounded visual effects, and procedural Web Audio.

The game is playable as a production browser build. The research brief and retained concept sheets remain in the repository so mechanics, visual direction, and asset provenance can be reviewed alongside the implementation.

## Run it

FreeSki requires Node.js 22.12 or newer.

```bash
npm install
npm run dev
```

Open the URL printed by Vite. For a production-equivalent local build:

```bash
npm run build
npm run preview
```

The game starts in open skiing. Cross a start gate on the mountain to enter Slalom, Tree Slalom, or Free Style; there is no separate mode-selection screen.

## Supported browsers and devices

This release packet certifies the production build through automated Chromium testing. Current Firefox and WebKit are intended targets, but they were not independently certified in this environment. The qualified desktop layout is 768×600 or larger; smaller handset layouts are not part of this release claim.

Keyboard is the primary desktop input. Standard-layout gamepads use the browser Gamepad API and its `mapping: "standard"` contract; availability, button labels, hot-plug behavior, and non-standard controllers depend on the browser, operating system, and device driver. Optional mouse or pen steering uses Pointer Events. Coarse-pointer/touch devices receive the same action abstraction through multi-touch controls, but simultaneous-touch behavior still depends on the browser and hardware; use `?touch=1` to expose those controls for review on a fine-pointer device.

Procedural sound requires Web Audio support and a user gesture before the browser may create or resume its single `AudioContext`. Autoplay policy, output routing, and gamepad support can therefore vary by browser or embedded webview. Accessibility and record settings use local storage and remain local to the current browser profile.

## Controls

All gameplay devices feed the same engine-independent action layer. Keyboard bindings are centralized in `src/input/actions.ts` and can be replaced as a complete binding map without changing the simulation. Standard-layout gamepads support both held actions and one-shot button edges. The on-screen touch controls expose the same 14 actions and support simultaneous touches.

| Action              | Keyboard                 | Standard gamepad               |
| ------------------- | ------------------------ | ------------------------------ |
| Carve left/right    | Left/right arrows or A/D | Left stick or D-pad left/right |
| Traverse uphill     | Up arrow or W            | D-pad up                       |
| Point downhill/tuck | Down arrow or S          | D-pad down                     |
| Brake               | Shift or B               | B                              |
| Jump                | Space                    | A                              |
| Spin left/right     | Q/E while airborne       | Left/right shoulder            |
| Back/front flip     | Z/X while airborne       | Left/right trigger             |
| Turbo               | F                        | X                              |
| Pause/resume        | Escape or F3             | Start                          |
| Reset run           | R or F2                  | Y                              |
| World debug         | G                        | Back                           |
| Mute/unmute         | M or **SOUND**           | UI control                     |

Optional pointer steering and click-to-jump are disabled by default. Enable them with **POINTER OFF** below the game or add `?pointer=1` to the URL. Gameplay shortcuts are ignored while a form control or editable element has focus.

## Gameplay

The player can deepen a carve, traverse or climb, tuck for speed, brake, jump, and combine airborne spin/flip input into scored tricks. Terrain uses compact ground footprints and separate air-clearance heights rather than treating visible sprite rectangles as collision boxes. Crashes recover automatically and the run can always be reset.

The three ski-through events share the open mountain:

- **Slalom:** 24 gates, five-second missed/wrong-side penalties, adjusted-time result.
- **Tree Slalom:** 39 markers threaded through a wooded lane, with the same time/penalty rules.
- **Free Style:** ramps and airborne trick input produce a style score before the finish.

Results are stored locally as top-ten tables. The authored classic mountain and arbitrary generated seeds have separate record buckets. Leaving an event lane does not soft-lock or forcibly end open skiing.

The slope population is simulated with a hard actor bound: beginners fall and recover, snowboarders encounter ramps and obstacles, dogs react to contact, walking trees wake, lift chairs circulate, and chair riders can drop onto the slope. Past 1,800 m the weather begins to foreshadow danger. Crossing the formal 2,000 m boundary activates a protected Yeti chase; Turbo can create distance, while capture plays through a bounded sequence and then resets to a playable run.

## Mountain generation

World generation is deterministic for a seed and generator version. The browser streams 64 m chunks around the player, generates extra rows in the direction of travel, and evicts distant chunks. Every required chunk is present before it becomes active. A seeded clear corridor remains traversable through blocking terrain, while an authored overlay supplies the classic lift and event courses.

Use `?seed=<text>` for a repeatable generated mountain. `classic-1991` selects the classic record bucket; it does not load any historical game resource. Useful development-only query switches are:

| Parameter      | Effect                                                      |
| -------------- | ----------------------------------------------------------- |
| `pointer=1`    | Enables pointer steering                                    |
| `touch=1`      | Forces touch controls visible                               |
| `debug=1`      | Opens the world diagnostics panel                           |
| `training=1`   | Suppresses ordinary terrain collisions for controlled tests |
| `courseTest=1` | Enables controlled event-course test conditions             |

The read-only `window.__FREE_SKI__` bridge exposes bounded telemetry for automated verification. `window.__FREE_SKI_DEBUG__` provides deterministic staging helpers used by Playwright; it is not required for normal play.

## Accessibility and lifecycle behavior

Open **ACCESS** for a keyboard-accessible modal with:

- reduced motion;
- screen-shake enable/disable;
- impact-flash enable/disable;
- master volume from 0–100%;
- a gentler Yeti capture presentation.

Settings persist under the versioned `freeski.accessibility.v1` local-storage key. With no saved preference, `prefers-reduced-motion` supplies the initial reduced-motion value. Reduced motion lowers VFX density and suppresses presentation shake and flashes without altering simulation rules. The settings dialog traps focus, closes with Escape, and restores focus to its trigger.

Blur, a hidden document, and the open settings dialog automatically pause simulation and release held input. Focus/visibility return resumes only when every automatic pause reason has cleared; a player-requested pause remains paused. Resize and lifecycle transitions reset the fixed-step clock so background time cannot become a physics jump. Audio creates at most one `AudioContext`, and only after an input gesture.

## Replay export and diagnostics

**EXPORT REPLAY** in the ACCESS panel downloads a bounded `freeski-replay-v1` JSON document. It contains:

- the seed and generator version;
- normalized fixed-step action frames;
- edge actions such as pause, reset, Turbo, and debug;
- capacity and dropped-frame accounting.

The recorder retains the newest 7,200 frames and never grows beyond that cap. Its recorder, normalization, digest, and deterministic tests are engine/DOM independent. This is a diagnostic input trace, not a complete save-game or network replay protocol.

Press **G** to inspect collision footprints, chunk bounds, stream coverage, actor work, and the Yeti boundary state. Runtime performance telemetry retains a 600-frame rolling window with average FPS, p95/p99 frame times, lifecycle-gap accounting, and pool/capacity counts.

## Architecture

`src/simulation/` and `src/world/` are deterministic, renderer-independent TypeScript. `src/input/` converts every device into common actions. `src/render/` is the Phaser/browser adapter and owns atlas presentation, VFX, UI, runtime telemetry, and accessibility wiring. `src/audio/` produces the original procedural sound bank. `src/replay/`, `src/lifecycle/`, and `src/performance/` contain small testable release-support systems.

The renderer uses a production Canvas 2D atlas with bounded sprite and VFX pools. The implementation targets 60 FPS. The repeatable performance test uses a 768×600 production Chromium profile, reports its empty-page rAF ceiling, raw frame percentiles, memory delta, and pool counts, and is described only as an integrated-GPU-class browser proxy—not physical-hardware certification.

## Verification

Run the normal qualification matrix:

```bash
npm run format:check
npm run typecheck
npm run lint
npm test
npm run assets:check
npm run build
npm run test:e2e
npm run test:e2e:production
npm run audit:clean-room
```

`npm run test:e2e` exercises open skiing, deterministic streaming, interactions, all three modes, living actors, the 2,100 m descent/Yeti boundary, atlas presentation, and responsive layouts. The production suite adds input-device equivalence, accessibility persistence, lifecycle recovery, replay export, and the disclosed performance proxy.

The release soak is a dedicated executable with a non-configurable 20 wall-minute measurement window:

```bash
npm run test:soak
npm run test:soak -- --evidence docs/gauntlet/submissions/GATE-7/attempt-1/evidence/soak-report.json
```

It builds first, then exercises all modes, validates a 2,100 m generated descent, activates the bottom Yeti boundary, repeatedly resizes and changes visibility/focus, samples heap/pool/cache/replay trends every 30 seconds, and verifies post-soak input. The harness cannot be shortened through an environment variable.

## Art pipeline and clean-room boundary

The six retained transparent concept sheets in `assets/sprite-sheets/` were generated without reference imagery. `scripts/build_runtime_atlas.py` deterministically derives the runtime PNG, Phaser atlas JSON, and provenance/geometry metadata in `public/assets/production/` without modifying the approved sheets or their source-chroma originals.

The asset pipeline requires Python 3 and Pillow 12.3:

```bash
python3 -m pip install -r requirements-assets.txt
npm run assets:build
npm run assets:check
```

Audio is synthesized at runtime; no historical or recorded WAV/MIDI asset ships. `npm run audit:clean-room` inventories and hashes the shipping/art roots, rejects suspect historical resource formats and text markers, and validates local provenance links. See `docs/CLEAN_ROOM_AUDIT.md` for scope and limitations: the audit is process/static-analysis evidence, not a legal opinion or an exhaustive comparison against every historical release.

## Project references

- `docs/SKIFREE_RESEARCH_AND_DESIGN.md` — researched mechanics, map reconstruction, procedural proposal, sprite inventory, and citations.
- `docs/GAUNTLET_LOOP_PROMPT.md` — authoritative gate criteria, evidence contracts, and the context-separated orchestrator/executor/judge loop.
- `docs/BUILD_GAUNTLET.md` — adjudication log for frozen submissions and independent verdicts.
- `docs/CLEAN_ROOM_AUDIT.md` — repeatable clean-room shipping audit.
- `docs/WEB_UI_AUDIT.md` — browser UI/accessibility guideline review.
- `assets/sprite-sheets/README.md` and `manifest.json` — concept review notes, cell layout, and atlas-production metadata.
