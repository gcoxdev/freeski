# FreeSki research and design brief

Prepared August 9, 2026. This document distinguishes three kinds of statements:

- **Verified** — supported by the creator's site, the shipped 1.04 resources, or the byte-oriented decompilation.
- **Reconstructed** — a direct interpretation of the decompiled rules or resource order.
- **Recommendation** — a proposed FreeSki modernization, not a claim about the original.

## Executive direction

FreeSki should be a fast, top-down/three-quarter 2D arcade game, not a ski simulator. The durable identity of *SkiFree* is its immediate steering, continuous downward travel, three adjacent event lanes, slapstick collisions, small systemic secrets, and the tonal shock of a Yeti chase after the formal courses are over.

The strongest modernization is therefore:

- retain the readable orthographic camera and compact one-more-run loop;
- use pre-rendered ultra-realistic sprites, powder VFX, tracks, shadows, modern lighting, and good sound;
- keep movement exaggerated and legible rather than physically exact;
- replace screen-edge randomness with deterministic seeded chunks while preserving the original zone weights;
- keep Slalom, Tree Slalom, Free Style, open skiing, Turbo, and the Yeti;
- use wholly new art, audio, UI, and implementation code.

## Research basis

The creator, Chris Pirih, describes building the Windows version in C in 1991, its earlier VAX/VMS inspiration, the Windows Entertainment Pack license, its sprite renderer, and the 2005 releases on [the official SkiFree site](https://ski.ihoc.net/). The same page states that the creator retained rights while Microsoft licensed the game, so FreeSki should be treated as a clean-room homage rather than an asset-level remake.

The most precise mechanical evidence is Eric Fry's [SkiFree 1.04 decompilation](https://github.com/yuv422/skifree_decomp). It reconstructs all game code and data to C and documents the 89 embedded bitmap resources. The relevant files are [the actor/type definitions](https://raw.githubusercontent.com/yuv422/skifree_decomp/main/types.h), [movement and frame tables](https://raw.githubusercontent.com/yuv422/skifree_decomp/main/data.h), and [gameplay implementation](https://raw.githubusercontent.com/yuv422/skifree_decomp/main/skifree_decomp.c).

Course lengths and the general three-mode description are independently summarized by [RGB Classic Games](https://www.classicdosgames.com/game/SkiFree.html). The most complete period-style object/secret catalog I found is the [2003 GameFAQs FAQ](https://gamefaqs.gamespot.com/pc/578119-skifree/faqs/26408). It is secondary evidence, so source-level behavior wins if they disagree.

For this brief I also inspected the 89 bitmaps embedded in the creator-hosted `ski32.zip`. Those original bitmaps were used only to inventory states; they are not included in this repository or used as image-generation inputs.

## Original game: player experience

### Camera and coordinate model

**Verified:** the skier remains at the horizontal center and roughly one-third of the way down the viewport while the world scrolls. Downhill is positive world Y. The original uses 16 internal units per displayed meter and a 40 ms update interval, i.e. a 25 Hz simulation tick. The status panel reports elapsed time, distance, speed, and Style.

**Recommendation:** run gameplay on a deterministic fixed timestep (60 or 120 Hz) with render interpolation. Keep the player at 33–38% of viewport height and expose `metersToWorldUnits` as data so the feel can be tuned without rewriting content.

### Controls

The original control surface is broader than most memories of it:

| Input | Original behavior | FreeSki mapping |
|---|---|---|
| Left/right arrows or numpad 4/6 | Step through left/right facing states; while airborne, rotate/spin | Left/right or A/D; left stick |
| Down or numpad 2 | Point downhill on snow | Down or S |
| Up or numpad 8 | Jump; while airborne, advance the rotation stage | Up, W, Space, or gamepad south button |
| Numpad 1/3 | Direct down-left/down-right headings | Legacy diagonal aliases |
| Insert or numpad 0 | Manual jump | Optional legacy binding |
| Mouse movement | Aim relative to the skier | Optional pointer-steering mode |
| Mouse click | Jump; while airborne, advance trick pose | Pointer/touch action |
| `F` | Toggle Turbo/Fast mode | Retain `F`; also a settings toggle |
| F2 / F3 | New game / pause | R or F2 / Escape or F3 |

Turbo is not merely a cosmetic speed modifier in 1.04: the source performs an extra position and air-progress update, effectively doubling actor movement. FreeSki can preserve that result while implementing it as a named multiplier.

### Movement feel

The player is a direction/state-driven kinematic actor rather than a rigid-body skier. Facing determines target downhill speed and lateral sign. The seven legal headings are spaced at 30-degree intervals across the downhill half-plane. Straight descent builds the highest normal speed; the exact left/right endpoints are stationary; player input never produces negative/downhill-axis velocity.

**Recommendation:** reproduce the state targets first and layer presentation on top:

- seven grounded headings: stationary left, 60° and 30° down-left, downhill, 30° and 60° down-right, and stationary right;
- acceleration toward heading-specific target velocity;
- speed-dependent steering authority so a fast line has weight without feeling sluggish;
- short skid/brake states for hockey stops;
- coyote time of 80–120 ms for manual jumps and buffered jump input of roughly 100 ms;
- forgiving aerial landing cones and explicit crash states.

Do not add stamina, gear stats, edge-temperature simulation, or realistic injury systems to the initial build.

### Jumping and tricks

Jumps come from manual input, small/large snow bumps, rocks/stumps when cleared, and the rainbow ramp. A ground click starts a manual jump; each of the next two airborne clicks queues half a somersault, producing one complete rotation across eight readable phases. Separate held inputs select spread, daffy, and left/right twist poses. Style accrues from completed rotations and sustained trick poses, not from a large combo system.

Source-level scoring details worth retaining as tuning anchors:

- small terrain/ramp interactions add a token point;
- advanced airborne poses add points per update, with higher-risk frames worth more;
- a failed aerial landing costs 64 Style;
- a normal obstacle crash generally costs 32 Style;
- cleanly clearing a tall obstacle adds a small bonus;
- the stump-to-mushroom secret yields 100 Style when the mushroom is jumped;
- clearing/extinguishing a burning dead tree yields a very large 1,000-point secret bonus;
- yellow snow costs Style.

**Recommendation:** keep those numbers in a `classic` score preset, but present tricks as named events and award once per completed rotation/landing in the default modern preset. This avoids frame-rate-dependent scoring while retaining the original risk hierarchy.

### Collisions and recovery

Collision uses overlapping sprite rectangles plus a simple vertical/air-height comparison. Outcomes are object-specific:

- bumps pop the skier into a short hop;
- mogul clusters slow a straight descent but can be cut diagonally;
- rocks, stumps, trees, lift structures, beginners, and snowboarders can crash the player;
- tall hazards can be cleared if the player's air height is sufficient;
- dogs are knocked over but do not normally make the player fall;
- beginning skiers can fall forward or backward;
- snowboarders are fast, can jump ramps, tumble, and can drop from a chairlift;
- a crashed skier decelerates toward rest before recovery/reset logic resumes.

**Recommendation:** use two colliders per object: a small ground-contact footprint and a clearance height. The visible sprite should never be the collision rectangle. Add 250–350 ms of input grace after recovery so chain collisions do not feel arbitrary.

### Modes

The three modes are selected diegetically: the player skis through one of three start gates on the same mountain.

#### Slalom

- Timed 540 m event.
- Alternating red and blue directional markers.
- Crossing a marker on the wrong side adds five seconds.
- A correct marker becomes a happy marker; a miss becomes a sad marker.
- Course completion records a top-ten time.

#### Tree Slalom

- Timed 1,040 m event.
- Same five-second marker penalty.
- Longer, narrower lane with dense trees and occasional dogs.
- Course completion records a top-ten time.

#### Free Style

- Untimed 1,040 m event.
- Style score from jumps, aerial states, clean clears, and secrets.
- Crashes and poor landings reduce Style.
- Course completion records a top-ten score.

#### Open skiing

The player may ignore every start gate, traverse laterally within the seven-heading downhill fan, leave event lanes, or continue below the formal finishes. Player input never creates upward movement. This freedom is essential: the mountain is a toybox, while the events are optional score structures layered onto it.

### Yeti endgame

Four persistent Yeti controllers guard the world boundaries. They activate beyond roughly 125 m uphill, 2,000 m downhill, or 1,000 m to either side. Once active, the relevant Yeti is repositioned near the viewport when necessary and steers toward the player with capped horizontal/downhill/uphill velocities. Contact removes the skier and plays a staged eat/chew/recovery animation.

The familiar 2,000 m appearance is therefore one face of a four-boundary system. Turbo can let the player evade the creature for a while. This should remain a surprising escalation rather than be advertised as an ordinary boss fight.

**Recommendation:** preserve the classic chase as the default. Add an accessibility setting that replaces being eaten with a comic rescue, but do not weaken the standard mode.

### Small systems and secrets

These details create much of the game's personality and should be deliberately supported rather than left as bugs:

- reverse into a stump to transform it into a mushroom; jump the mushroom for 100 Style;
- a dead tree can ignite during a low jump; clearing the burning tree produces a large bonus and extinguishes it;
- dogs may leave a yellow patch after being hit;
- walking trees occasionally awaken and move laterally;
- snowboarders can appear from the top of the screen or drop from chairlifts;
- standing under/near a chairlift can generate Style in the original, an exploitable secret noted by the FAQ;
- the mountain horizontally wraps in the restored 1.04 behavior, as noted by the creator on the official site.

For FreeSki, implement these as named, tested interactions. Keep the chairlift bonus as an Easter egg but cap it or make it pulse-based so it cannot dominate the leaderboard.

## Original mountain reconstruction

The original is **hybrid**: fixed permanent course objects plus stochastic screen-edge scenery. It is not a pre-authored tile map and it is not deterministic chunk generation.

### Fixed layout

Coordinates below are reconstructed from 1.04 source values using 16 units = 1 meter. The player starts at `(0 m, 0 m)`.

| Feature | X range/position | Y span | Layout |
|---|---:|---:|---|
| Slalom start gate | -36 m to -20 m | 40 m | Entering this lane starts the timer |
| Slalom markers | -31 m / -25 m alternating | 60–520 m | 24 markers, one every 20 m |
| Slalom finish | -36 m to -20 m | 540 m | Two finish halves |
| Free Style start gate | -10 m to +10 m | 40 m | Entering starts score mode |
| Free Style finish | -10 m to +10 m | 1,040 m | Two finish halves |
| Tree Slalom start gate | +20 m to +32 m | 40 m | Entering starts timer |
| Tree Slalom markers | about +25 m / +27 m alternating | 65–1,015 m | 39 markers, one every 25 m; trees interleave |
| Tree Slalom finish | +20 m to +32 m | 1,040 m | Two finish halves |
| Lift towers | -8 m | -64–1,472 m | One every 128 m |
| Uphill chairs | -7 m | looping | Move at 2 units/tick |
| Downhill chairs | -9 m | looping | Move at 2 units/tick; may drop riders |
| Top Yeti threshold | any X | -125 m | Controller starts just beyond threshold |
| Bottom Yeti threshold | any X | 2,000 m | The famous post-run chase |
| Side Yeti thresholds | ±1,000 m | any Y | Left/right boundary chasers |

The placement is intentionally compact: Slalom sits left of the lift, Free Style is central, and Tree Slalom is to the right. A player can see multiple choices near the start and simply steer into one.

### Stochastic scenery generation

The source accumulates player movement. Each time the player has moved another 60 internal units (3.75 m) on an axis, it attempts to spawn an object just outside the corresponding viewport edge. It uses the sampled world position to choose one of four zone tables and applies an approximate sprite-area density cap.

#### General/open-slope weights

| Result | Probability |
|---|---:|
| Walking tree | 5% |
| Ordinary/dead tree | 45% |
| Small/large bump | 20% |
| Mogul cluster | 5% |
| Rock or stump | 20% |
| Rainbow ramp | 2% |
| Beginner skier | 2% |
| Dog | 1% |

#### Free Style lane weights

| Result | Probability |
|---|---:|
| Walking tree | 2% |
| Tree | 18% |
| Bump | 30% |
| Mogul cluster | 10% |
| Rock or stump | 20% |
| Ramp | 20% |

#### Tree Slalom lane weights

- Tree: 63/64 (98.4375%).
- Dog: 1/64 (1.5625%).

#### Slalom lane weights

- Mogul cluster when the stricter density cap permits it.
- Otherwise no random obstacle, keeping the short racing lane relatively clear.

Variant selection further biases ordinary trees toward evergreen, rocks over stumps (3:1), and small bumps over large ones (2:1). Independently, a fast snowboarder has a 1/666 update chance to enter from the top while play is active.

### FreeSki map-generation specification

Screen-edge spawning produces different terrain when a player backtracks and makes replay/test reproduction hard. FreeSki should preserve the statistical texture while moving generation to deterministic world chunks.

#### World structure

1. Use 64 m × 64 m chunks addressed by signed `(chunkX, chunkY)`.
2. Hash `worldSeed + chunkX + chunkY + generatorVersion` into a local PRNG.
3. Define the fixed course/lift splines first. They are authored overlays, not random content.
4. Create exclusion masks for gate approach, gate crossing, jump takeoff, and landing areas.
5. Populate remaining space with Poisson-disc samples, then choose an object from the zone weight table.
6. Save only mutable deltas: burned trees, consumed mushrooms, knocked NPC state, and broken/changed markers.
7. Generate a two-chunk lookahead and retain a one-chunk rear cache so fast traversal never exposes pop-in.

#### Recommended lane model

- Preserve the original left/center/right start layout and exact classic lengths.
- Make each event a `CourseDefinition` containing a center spline, half-width, start/finish, gates, exclusions, and spawn profile.
- Keep the classic fixed layout as seed `classic-1991`.
- Allow daily/seeded runs to perturb gate X, tree pockets, and ramp placements within validated limits.
- Guarantee a navigable corridor at least 2.5 player widths wide through all randomly decorated regions.
- Reserve 12–18 m of clear landing space after a large ramp.
- Reject any placement whose footprint overlaps a gate line, lift tower clearance, another blocking footprint, or a Yeti entry corridor.

#### Difficulty curve

- 0–200 m: low density, generous tutorial sightlines.
- 200–540 m: classic Slalom pressure and moderate traffic.
- 540–1,040 m: denser open slope, longer trick lines, Tree Slalom pressure.
- 1,040–1,800 m: freeride escalation, more moving traffic, no new mechanics without telegraphing.
- 1,800–2,000 m: subtle audio/weather foreshadowing.
- Beyond 2,000 m: Yeti chase; procedural obstacles remain fair but become urgent.

#### Determinism contract

Given the same seed, generator version, viewport-independent world coordinates, and difficulty preset, every blocking object and course marker must be identical. Cosmetic particles and ambient audio may remain nondeterministic. Record the seed in replays and leaderboard submissions.

## Complete sprite inventory

### The original 89 bitmap resources

This is the parity inventory, in embedded resource order. It is useful as a completeness checklist, not as permission to reuse the bitmaps.

| IDs | Count | Content |
|---|---:|---|
| 1–22 | 22 | Player headings, tuck, jump/flip/spin states, crash and wipeout |
| 23–26 | 4 | Red-left marker, blue-right marker, correct/happy marker, missed/sad marker |
| 27 | 1 | Mogul cluster |
| 28–32 | 5 | Beginner straight/turn states and two falls |
| 33–36 | 4 | Dog movement, hit/bark/`WOOF` reaction states |
| 37–44 | 8 | Snowboarder carve, jump and tumble states |
| 45–46 | 2 | Rock and stump |
| 47–48 | 2 | Small and large bump |
| 49–51 | 3 | Evergreen/dead/large tree variants |
| 52 | 1 | Rainbow ramp |
| 53–56 | 4 | Title/version and two in-world instruction signs |
| 57–60 | 4 | Left/right halves of Start and Finish gates |
| 61–63 | 3 | Slalom, Tree Slalom and Free-style lane signs |
| 64 | 1 | Lift tower/pole |
| 65–67 | 3 | Occupied, dismounting and empty chairlift states |
| 68–81 | 14 | Yeti directional locomotion, pounce/eat/chew/recovery |
| 82 | 1 | Yellow snow |
| 83–85 | 3 | Burning dead-tree animation images |
| 86 | 1 | Mushroom |
| 87–89 | 3 | Walking-tree animation images |

### FreeSki production atlas groups

The review sheets cover the visual direction. A shippable atlas should be cut and expanded into these groups:

#### Player

- grounded headings: stationary left, two down-left angles, downhill, two down-right angles, stationary right;
- tuck and manual jump takeoff;
- neutral air and seven intermediate 45° somersault phases;
- spread, daffy, twist-left and twist-right trick poses;
- clean landing, prone ordinary crash, distinct prone run-over, and recovery;
- Yeti grab/eaten silhouette if the interaction is composited rather than Yeti-only;
- optional outfit color masks or two additional bodies, but only after the core feel is approved.

#### Moving population

- beginner: straight, left/right, wobble, forward/backward falls, recover;
- snowboarder: straight, left/right, jump, grab, landing, four tumble phases;
- gray dog: two-to-four run frames, idle, bark, knocked-over, recover;
- chairlift: empty, one rider, two riders, skier drop, snowboarder drop;
- Yeti: two-frame cycles in four directions, windup, pounce, grab, chew, belly-pat, roar, idle;
- walking tree: idle plus at least three walking frames.

#### Static and interactive mountain objects

- evergreen small/medium/large, dead tree, stump, rock;
- small bump, large bump, mogul field, rainbow ramp;
- mushroom, yellow snow, three-frame burning tree;
- lift tower, cable connector, safety fence;
- at least four cosmetic variants per common tree/rock once gameplay is stable.

#### Course and UI props

- red-left and blue-right slalom markers;
- happy/correct and sad/missed marker states;
- Start left/right, Finish left/right;
- Slalom, Tree Slalom and Free Style entrance signs;
- controls, restart, pause signs;
- code-rendered HUD icons for time, meters, speed, Style, Turbo, seed and pause.

Use code/SDF text on modern signs where practical. Do not bake leaderboard names or localized copy into atlases.

#### VFX/decal sprites

- ski-edge spray in three sizes;
- left/right carve fans;
- landing plume and crash burst;
- short/long parallel tracks plus track fade mask;
- impact ice spark and speed streaks;
- breath mist, ramp glint, trick sparkle;
- flame/embers and scuffed-snow crash decal;
- scalable oval/blob shadows for all actors.

#### Ground materials (not sprites)

- tileable groomed snow albedo/normal/roughness;
- powder and wind-crust variants;
- subtle slope-gradient and blue ambient-shadow overlays;
- optional groomer lines and wind ripple masks.

## Non-visual asset inventory

The original loads nine sound resources corresponding to crash, small jump/bump, dog hit, landing/trick, snowboard jump, beginner fall, Yeti eat, dog/yellow-snow event, and Yeti chase/voice. FreeSki should replace them with new recordings plus ski glide loops, carve layers, wind by speed, lift ambience, gate feedback, UI sounds, and a restrained post-1,800 m warning layer.

## Art-production notes

The six generated sheets in `assets/sprite-sheets/` are transparent review atlases created with the built-in image-generation path and local chroma-key removal. They establish camera, materials, palette, and silhouette. They are not yet final production atlases because generated cells vary in local bounds and have not been given pivots, hit footprints, trim rectangles, or animation timing.

Production conversion should:

1. slice cells according to `manifest.json`;
2. normalize scale within each actor family;
3. place the ground-contact pivot at `(0.5, 0.9–0.98)` depending on sprite;
4. retouch pole/branch/fur edges at 200% zoom;
5. add per-frame footprint and clearance metadata;
6. pack losslessly with 2–4 px extruded padding;
7. test every sprite against bright and dark snow, not only a checkerboard.

## Architecture recommendation

For an empty repository and a browser-first 2D game, the default build stack should be TypeScript, Phaser 3, and Vite, with Vitest for deterministic logic tests and Playwright for end-to-end playthroughs/screenshots. Keep gameplay logic engine-light:

- `simulation/` — fixed-step player, actors, collisions, score, events;
- `world/` — coordinate hash, chunks, course definitions, spawn profiles;
- `render/` — Phaser scenes, sprite adapters, VFX, camera;
- `input/` — keyboard, pointer, gamepad, touch mapped to actions;
- `content/` — JSON/data definitions, no hard-coded course arrays in scenes;
- `test/` — seed snapshots, collision cases, mode timing and Yeti thresholds.

If another engine is selected later, preserve these boundaries.

## Acceptance checklist before build

- [ ] Approve the ultra-realistic pre-rendered 2D art direction.
- [ ] Approve the blue-suit/red-helmet player identity.
- [ ] Approve the more naturalistic but still comic Yeti.
- [ ] Approve the original three-lane start layout and classic distances.
- [ ] Approve deterministic seeded chunks instead of transient screen-edge randomness.
- [ ] Approve browser-first TypeScript + Phaser 3 + Vite as the initial stack.
- [ ] Decide whether the default score preset is `modern` (event-based) or `classic` (frame/state-based).
- [ ] Decide whether the title is final and whether a trademark clearance search is required before public release.

## Clean-room/IP boundary

Mechanics, broad genre ideas, and independently created art can be studied and reimplemented, but the original bitmap/audio files, exact copied source, logos, and distinctive presentation should not ship in FreeSki. The creator's own history says Microsoft licensed the game from him and that he retained rights. This brief is practical product guidance, not legal advice; obtain counsel before commercial release or marketing that leans heavily on the original name/history.
