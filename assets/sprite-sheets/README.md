# FreeSki sprite-sheet review package

These PNGs are visual-direction sheets generated with a locked orthographic three-quarter camera, ultra-realistic pre-rendered materials, and a magenta removal matte. Each final PNG has an alpha channel and transparent corners.

Open `review-contact-sheet.png` for a single-page overview on a neutral gray background, then inspect the individual alpha sheets at full resolution.

| Sheet | Grid | Purpose |
|---|---:|---|
| `01-player-skier.png` | 6 × 4 | 24 player headings, jumps, tricks and crash poses |
| `02-hill-population.png` | 5 × 4 | Beginner, snowboarder, dog and chairlift traffic |
| `03-yeti.png` | 4 × 4 | Directional chase and eat/recovery sequence |
| `04-terrain.png` | 5 × 4 | Trees, rock/stump, bumps, moguls, ramp, secrets and lift tower |
| `05-course-props.png` | 4 × 4 | Markers, start/finish, mode signs and resort props |
| `06-vfx.png` | 4 × 4 | Powder, tracks, impact, speed, mist, shadow, sparkle, flame and decals |

Cell order is documented in `manifest.json`. The magenta-key sources are retained under `source-chroma/` for re-matting.

## Review criteria

- Camera angle: can every pose/object be read instantly while moving downhill?
- Player identity: blue suit, red helmet, yellow skis.
- Scale: Yeti must feel threatening without obscuring too much of the course.
- Contrast: dark equipment, saturated gates and actor silhouettes must remain readable on snow.
- Tone: realistic materials with absurd systemic moments, not grim realism.
- Consistency: flag any cell whose actor identity, gear, camera or proportions drift.

## Production status

These are **concept atlases**, not slice-ready runtime atlases. Before integration, cells need manual trim bounds, family scale normalization, ground pivots, collision footprints, edge cleanup and padded packing. The build gauntlet explicitly treats those as an asset-ingestion phase.

## Generation method

- Built-in image generation, one prompt per distinct sheet.
- Flat `#ff00ff` background, no input/reference imagery.
- Background removed locally with the image-generation skill's soft-matte/despill helper.
- Generated output is wholly new; original SkiFree bitmaps were inspected only to compile the state inventory.

The full normalized prompt set is in `PROMPTS.md`.
