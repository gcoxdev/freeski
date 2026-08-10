# FreeSki clean-room shipping audit

FreeSki ships original TypeScript, newly generated concept art, a deterministic derived atlas, and procedural Web Audio. The historical game was used as behavioral research only. No historical executable, bitmap, recorded audio, source file, logo, or UI resource is required by the build or included in the audited shipping roots.

## Provenance boundary

- Behavioral research and citations live in `docs/SKIFREE_RESEARCH_AND_DESIGN.md`; runtime code does not import research artifacts.
- The six concept sheets were generated without reference imagery. Their prompts, alpha-matted sheets, source-chroma outputs, manifest, and review notes remain under `assets/sprite-sheets/`.
- `scripts/build_runtime_atlas.py` derives the runtime atlas without modifying those retained sheets. `freeski-atlas.meta.json` records the source manifest hash and per-frame source hashes.
- Audio is synthesized at runtime by `src/audio/AlpineAudio.ts`; the shipping asset roots contain no WAV or MIDI recordings.
- Simulation and world behavior are independently authored TypeScript behind the Phaser adapter boundary.

## Repeatable audit

Run:

```bash
npm run audit:clean-room
```

The audit inventories and hashes `src/`, `index.html`, `assets/sprite-sheets/`, and `public/assets/`; rejects historical Windows/resource formats; scans shipping text for suspect vendor/author/resource markers; and verifies local art/audio provenance assertions. A Gate 7 evidence run may add `-- --output <path>` to retain the complete JSON inventory.

## Result and limitations

The automated audit must report `passed: true` and zero findings before release. It is intentionally scoped to files that ship or directly generate shipping art; research prose is excluded because it must name and cite the inspiration.

This is process and static-analysis evidence, not a legal opinion. No authoritative corpus containing every historical release hash was available, so exhaustive hash comparison is impossible. The scan cannot by itself prove independent authorship or resolve trademark/product-name questions; those require human and, where appropriate, legal review.
