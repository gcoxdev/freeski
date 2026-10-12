# FreeSki sprite-sheet review package

These PNGs are visual-direction sheets generated with a locked orthographic three-quarter camera, ultra-realistic pre-rendered materials, and a magenta removal matte. Each final PNG has an alpha channel and transparent corners.

Open `review-contact-sheet.png` for a single-page overview on a neutral gray background, then inspect the individual alpha sheets at full resolution.

For the lateral contact pairs, `gait-proof/*-review-a-b-proof.png` shows contact A, contact B, then color-coded A and B anatomy proofs. Red tracks the near leg from forward in A to rear in B; blue tracks the far leg from rear in A to forward in B. The proof files are review artifacts only and are not packed into the runtime atlas.

The current review pass includes a front-facing downhill tuck plus complete whole-body lateral contact pairs for the Yeti and walking tree. A and B change the arms, hips and legs together, both feet stay grounded, and near/far depth grading keeps the separate leg paths readable. The burning-tree sequence uses its three complete terrain frames without a separate static flame overlay.

| Sheet | Grid | Purpose |
|---|---:|---|
| `01-player-skier.png` | 6 × 4 | Seven audited 30° headings, eight-step rotation, tricks and two prone crash poses |
| `02-hill-population.png` | 5 × 4 | Beginner, snowboarder, dog and chairlift traffic |
| `03-yeti.png` | 4 × 4 | Directional chase and eat/recovery sequence |
| `04-terrain.png` | 5 × 4 | Trees, rock/stump, bumps, moguls, ramp, secrets and lift tower |
| `05-course-props.png` | 4 × 4 | Markers, start/finish, mode signs and resort props |
| `06-vfx.png` | 4 × 4 | Powder, tracks, impact, speed, mist, shadow, sparkle, flame and decals |
| `07-downhill-ramp.png` | 1 × 1 | Large vertically aligned downhill red, white, and blue kicker with smooth sidewalls |
| `08-yeti-lateral-run.png` | 4 × 1 | Four-frame lateral yeti run |
| `09-walking-tree-cycle.png` | 4 × 1 | Four-frame walking tree with alternating contact and passing poses |

Cell order is documented in `manifest.json`. The magenta-key sources are retained under `source-chroma/` for re-matting.

## Review criteria

- Camera angle: can every pose/object be read instantly while moving downhill?
- Player identity: blue suit, red helmet, yellow skis.
- Scale: Yeti must feel threatening without obscuring too much of the course.
- Contrast: dark equipment, saturated gates and actor silhouettes must remain readable on snow.
- Tone: realistic materials with absurd systemic moments, not grim realism.
- Consistency: flag any cell whose actor identity, gear, camera or proportions drift.

## Production status

These remain the immutable **concept atlases**. Gate 6 derives the runtime atlas
non-destructively with `npm run assets:build`: deterministic fractional-grid
slicing, adjacent-cell bleed isolation, alpha trim, actor-family scale
normalization, residual key/speck cleanup, 4 px extruded packing, and per-frame
pivot/footprint/clearance metadata.
Generated outputs live under `public/assets/production/`; this review package
and every `source-chroma/` original remain unchanged.

## Generation method

- Built-in image generation, one prompt per distinct sheet.
- The revised player and downhill ramp used the prior local FreeSki player and
  terrain sheets only as style/camera references; all rendered poses and the new
  ramp are newly generated.
- Flat `#ff00ff` background with no outside or original-game imagery used as a
  generation reference.
- Background removed locally with the image-generation skill's soft-matte/despill helper.
- Generated output is wholly new; original SkiFree bitmaps were inspected only to compile the state inventory.

The full normalized prompt set is in `PROMPTS.md`.

## Lateral yeti run revision

`08-yeti-lateral-run.png` is a four-cell, left-facing run cycle created with
the built-in imagegen tool. The runtime mirrors this cycle for rightward travel.
The manifest records explicit crop regions to retain the full extended feet.
All cells share their vertical source scale and canvas anchor; contact and passing poses
therefore retain a consistent body size, including the airborne fourth phase.
The earlier `03-yeti.png` sheet is retained. Rebuild with `npm run assets:build`.

Generation prompt: Preserve the reference yeti's realistic painted white fur,
dark face, muscular hunched body and proportions. Produce four full-body,
left-facing running poses in equal horizontal cells on transparent background:
contact, bent-knee passing, opposite contact, and airborne passing. Keep head
size, body scale and baseline consistent. Make passing silhouettes visibly
narrower than contact poses. No labels, scenery or shadows.

Frame three was subsequently corrected with imagegen to place the near/left leg
behind and the far/right leg forward, with the opposite arm swing. Frames one,
two, and four retain their original pixels. The [edit prompt and source](gait-proof/yeti-contact-c-prompt.md)
record the correction and its alignment to the existing canvas.

The walking tree's second contact pose also now places the near leg behind and
the far leg forward. Only terrain cell 17 was replaced, retaining the existing
scale and ground line. See the [imagegen prompt and source](gait-proof/tree-opposite-contact-prompt.md).

The four-frame walking tree is `09-walking-tree-cycle.png`: left contact, right passing, right contact, left passing. All cells share a 307 × 256 canvas and ground baseline. `terrain/rainbow-ramp` remains the stable internal frame name for the red, white, and blue ramp.

The built-in imagegen tool supplied the new artwork. Source outputs and exact prompts are retained in `gait-proof/tree-four-frame-*.png`, `gait-proof/tree-four-frame*-prompt.md`, and `gait-proof/ramp-red-white-blue-{generated.png,prompt.md}`. The generated opposite contact and passing poses replace the repeated contacts in the initial generated sheet. Only the central ramp stripe region was composited so the original rails and silhouette remain intact.

Current assets: [tree cycle](09-walking-tree-cycle.png) and [ramp](07-downhill-ramp.png). Built-in imagegen prompts: [tree cycle](gait-proof/tree-four-frame-prompt.md), [opposite contact](gait-proof/tree-four-frame-contact-prompt.md), [opposite passing](gait-proof/tree-four-frame-passing-prompt.md), and [ramp recolor](gait-proof/ramp-red-white-blue-prompt.md).

## Lift terminal

[`10-lift-terminal.png`](10-lift-terminal.png) is the dedicated return-wheel station, with exposed wheel, motor, braced mast, ladder, and yellow padding. The built-in imagegen [prompt](gait-proof/lift-terminal-prompt.md) and [original output](gait-proof/lift-terminal-generated.png) are retained. It replaces the first and last standard tower; wheel contact points calibrate both chair hangers and the projected cable curve.

The mogul patch now shares its draw size and traced snow outline through `src/world/mogulPatchGeometry.json`. Runtime collision and atlas metadata use that same polygon. The world generator version is v4 because its larger terrain footprint also changes placement spacing.
