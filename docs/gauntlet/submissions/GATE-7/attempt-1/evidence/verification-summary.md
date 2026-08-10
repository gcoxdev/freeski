# Gate 7 verification summary

Recorded by the executor and rerun by the orchestrator on 2026-08-10. These are reproducible submission results, not an independent verdict.

## Static and build checks

| Command                | Result                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run format:check` | PASS — all matched files used Prettier formatting before packet creation; rerun after packet creation is required and recorded at handoff. |
| `npm run typecheck`    | PASS — TypeScript build mode exited 0.                                                                                                     |
| `npm run lint`         | PASS — ESLint exited 0.                                                                                                                    |
| `npm test`             | PASS — 21 files, 106 tests.                                                                                                                |
| `npm run assets:check` | PASS — 112 frames; 4 px padding; 448 non-empty bands; zero geometry, extrusion, or overlap mismatches.                                     |
| `npm run build`        | PASS — Vite production build completed; only the disclosed large-chunk advisory remained.                                                  |
| `git diff --check`     | PASS — no whitespace errors.                                                                                                               |

Production artifacts from the passing build:

- JavaScript `dist/assets/index-B6LIQbTE.js`: `2255dc65d49ee7c5852e71b9276034ae7ecde8b0e2b01a0b77845e8436074c55`
- CSS `dist/assets/index-B8ZPa9tO.css`: `416a08922ba53022a0fe7a32ae0111a788d315e9e0bb85d41bcbd4f7319fd4c3`
- Atlas `public/assets/production/freeski-atlas.png`: `45c4307c6618e41ae7823bdcf0330b5c4b2117848f25b5a9f29f33dcbbb6be42`

## Browser checks

| Command                                                                                                                | Result                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `npm run test:e2e -- tests/e2e/livingSlope.spec.ts --repeat-each=2 --workers=1`                                        | PASS — 2/2 in 58.4 s.                                                                                                 |
| `npm run test:e2e -- --workers=1`                                                                                      | PASS — current post-correction matrix: 16 passed in 4.3 min; production performance and fixed soak skipped by design. |
| `FREESKI_GATE7_PERFORMANCE=... npm run test:e2e:production -- tests/e2e/performance.spec.ts tests/e2e/release.spec.ts` | PASS — current post-correction production matrix: 5/5 in 51.5 s.                                                      |
| `npm run test:e2e -- tests/e2e/release.spec.ts -g "skip link" --workers=1`                                             | PASS — post-correction skip link, h1→h2 hierarchy, focus target, and 768×600 canvas in 7.2 s.                         |
| `FREESKI_GATE7_PERFORMANCE=... npm run test:e2e:production -- tests/e2e/performance.spec.ts`                           | PASS — focused post-correction profile: valid 59.60 FPS ceiling; 57.51 game FPS; 7.00% long frames.                   |
| `npm run test:soak -- --evidence docs/gauntlet/submissions/GATE-7/attempt-1/evidence/soak-report.json`                 | PASS — 1/1; fixed measurement elapsed 1,200,072 ms.                                                                   |

The final sequential matrix covered baseline loading, minimum viewport, fixed-step controls, pointer opt-in, interaction secrets, living population/Yeti recovery, all three event modes, records, presentation, all representative player states, keyboard/gamepad/touch actions, accessibility/lifecycle behavior, bottom-Yeti keyboard reset, deterministic streaming, and the 2,100 m corridor audit.

The production release run covered 600 frame samples plus all three then-current Gate 7 release tests. The semantic skip-link/heading correction was added afterward and passed its focused minimum-viewport browser check. The exact soak separately covered 40 samples at 30-second cadence; it was not rerun because the correction changes semantic HTML, focus CSS, tests, and documentation rather than simulation/runtime behavior.

## Dedicated performance snapshot

- The latest complete post-correction production matrix wrote `performance-report.json` and passed 5/5: browser ceiling 59.80 FPS; game 58.83 FPS; 2.83% long frames; 18.34 ms p95; 25.00 ms p99; 26.68 ms maximum. The earlier passing sample remains in `performance-release-pass.json` for variance context: 59.21 FPS ceiling; 59.51 game FPS; 1.67% long frames.
- Latest bounds: actors 21/22; sprites 80/512 with peak 94; VFX effects 4/56; VFX tracks 15/48.
- Missing/capacity/frame fallback counters: 0.
- Console errors and page errors: 0.
- Three initial post-correction quick samples did not produce a complete policy pass: one had an invalid 57.69 FPS host ceiling while its game window passed at 57.42 FPS / 7.33%; the 2 valid-ceiling samples recorded 56.34 FPS / 12.17% and 56.25 FPS / 11.33%. An orchestrator retry was likewise invalidated by a 56.24 FPS ceiling while its game window measured 59.24 FPS / 2.00%. After a focused pass, the first complete-matrix retry missed only p99 at 34.99 ms; the second unchanged matrix produced the passing result above. No assertion was relaxed.

See `performance-report.json`, `performance-release-pass.json`, and `performance-variance.md` for claim boundaries and all observed variance.

## Soak snapshot

- Measurement: `2026-08-10T11:18:17.253Z` through `2026-08-10T11:38:18.965Z`.
- Exact elapsed: 1,200,072 ms; 40 samples.
- Automated descent: 2,100.253 m, 33 visited rows, zero corridor blockers, zero missing chunks.
- All Slalom, Tree Slalom, and Free Style runs finished before measurement.
- Heap: 21,120,644 initial; 50,167,060 peak; 42,641,016 final; 21,520,372 growth.
- Replay: 7,200/7,200 retained; 64,185 old frames evicted; deterministic metadata/digest present.
- Final bounds: actors 21/22; sprites 58/512; VFX effects 2/56; VFX tracks 1/48.
- One AudioContext; input responsive after soak; lifecycle visible/unpaused with no reasons.
- Console errors, page errors, failed requests, fallback draws, missing frames, and missing chunks: 0.
- The soak's final 600-frame rolling window was 50.69 FPS with 28.5% long frames, 28.33 ms p95, and 39.99 ms p99. This heavier in-page workload included polling, periodic resize/visibility/focus cycles, population restaging, replay eviction, and final reset. The soak passed its duration, memory, bounds, error, lifecycle, world, and responsiveness criteria; it is not represented as a steady-state 60 FPS certification.

## Clean-room and prior-gate checks

- `npm run audit:clean-room -- --output docs/gauntlet/submissions/GATE-7/attempt-1/evidence/clean-room-audit.json`: PASS — 78 shipping files, zero findings, all provenance checks true.
- Approved concept-sheet/source-chroma hashes match the Gate 6 approved values; no source art or production atlas file is modified in the Gate 7 diff.
- Latest independent verdicts for Gates 0 through 6 are all PASS. Gate 7 is deliberately not self-adjudicated.
