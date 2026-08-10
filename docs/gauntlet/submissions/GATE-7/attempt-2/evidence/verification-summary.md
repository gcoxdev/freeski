# Gate 7 attempt 2 verification summary

Recorded by the executor on 2026-08-10. These are reproducible submission results, not an independent verdict. The orchestrator froze the completed work as candidate `ad5562e2ba43f17e636814ee8e2801e29536d5cb`; the exact base is `456412cf7efbd2ca2bcf0c7e51c7bdd2dc3a5705`.

## Static, unit, asset, and build checks

| Command                                                                             | Result                                                                                                                                                               |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run format:check`                                                              | PASS — all matched files use Prettier. An earlier packet-wide pass flagged only four raw Playwright JSON reports; they were formatted and the check was rerun green. |
| `npm run typecheck`                                                                 | PASS — TypeScript build mode exited 0.                                                                                                                               |
| `npm run lint`                                                                      | PASS — ESLint exited 0.                                                                                                                                              |
| `npm test`                                                                          | PASS — 21 files, 107 tests.                                                                                                                                          |
| `npm run assets:check`                                                              | PASS — 112 frames, 4 px padding, 448 non-empty bands, zero geometry/extrusion/overlap mismatches.                                                                    |
| `npm run build`                                                                     | PASS — Vite production build completed; only the disclosed large-chunk advisory remained.                                                                            |
| `npm run audit:clean-room -- --output .../attempt-2/evidence/clean-room-audit.json` | PASS — 78 shipping files, zero findings, every provenance check true.                                                                                                |
| `git diff --check`                                                                  | PASS — no whitespace errors.                                                                                                                                         |

Production artifacts from the passing build:

- JavaScript `dist/assets/index-DIPyA3G-.js`: `4f73ae7b250125fa541189498aece5895f6011869c2864931427c214417173c0`
- CSS `dist/assets/index-B8ZPa9tO.css`: `416a08922ba53022a0fe7a32ae0111a788d315e9e0bb85d41bcbd4f7319fd4c3`
- Atlas `public/assets/production/freeski-atlas.png`: `45c4307c6618e41ae7823bdcf0330b5c4b2117848f25b5a9f29f33dcbbb6be42`

## Browser and release checks

| Command                                                                                                                                                   | Result                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:e2e -- --workers=1`                                                                                                                         | PASS — 16/16 executable functional tests in 2.7 minutes; the separately opt-in soak and production-performance cases skipped by design. |
| `FREESKI_GATE7_PERFORMANCE=.../performance-valid-01.json npm run test:e2e:production -- tests/e2e/performance.spec.ts`                                    | PASS — fresh valid calibration 1/3.                                                                                                     |
| `FREESKI_GATE7_PERFORMANCE=.../performance-valid-02.json npm run test:e2e:production -- tests/e2e/performance.spec.ts`                                    | PASS — fresh valid calibration 2/3.                                                                                                     |
| `FREESKI_GATE7_PERFORMANCE=.../performance-valid-03.json npm run test:e2e:production -- tests/e2e/performance.spec.ts`                                    | PASS — fresh valid calibration 3/3.                                                                                                     |
| `FREESKI_GATE7_PERFORMANCE=.../performance-production-matrix.json npm run test:e2e:production -- tests/e2e/performance.spec.ts tests/e2e/release.spec.ts` | PASS — 5/5 in 33.7 seconds: performance plus all four production release cases.                                                         |
| `FREESKI_GATE6_EVIDENCE_DIR=.../attempt-2/evidence npm run test:e2e -- tests/e2e/presentation.spec.ts --workers=1`                                        | PASS — 2/2 in 36.2 seconds, producing current desktop, 768×600, dark-snow, and representative-player-state captures.                    |
| `npm run test:soak -- --evidence .../attempt-2/evidence/soak-report.json`                                                                                 | PASS — 1/1; exact measurement elapsed 1,200,019 ms with 40 samples.                                                                     |

The functional matrix covered baseline loading, minimum viewport, fixed-step controls, pointer opt-in, interaction secrets, living population/Yeti recovery, all three event modes, records, presentation, all representative player states, keyboard/gamepad/touch actions, accessibility/lifecycle behavior, bottom-Yeti reset, deterministic streaming, and the 2,100 m corridor audit.

## Dedicated performance stability

The policy in `tests/e2e/performance.spec.ts` is unchanged from attempt 1. Three consecutive retained dedicated runs and the later complete-matrix run all reported:

- valid empty-page ceiling: 60.00 FPS;
- game average: 60.00 FPS;
- p95/p99/maximum: 16.67/16.68/16.68 ms;
- rolling long-frame ratio: 0.00%;
- samples: 600/600; fixed-step dropped seconds: 0;
- actors: 21/22; sprites: 80/512; VFX effects: 4/56; VFX tracks: 15/48 (minor instantaneous counts vary without approaching capacity);
- capacity/missing-frame fallbacks, missing chunks, console errors, and page errors: 0.

An immediately preceding diagnostic probe also produced the same valid passing acceptance metrics. No attempt-2 calibration was invalid and no valid attempt-2 performance run failed. The only pre-probe issue was a sandboxed localhost bind failure that produced no calibration or report. See `performance-variance.md` and the four retained JSON reports.

## New exact soak

- Measurement: `2026-08-10T13:39:13.441Z` through `2026-08-10T13:59:13.755Z`.
- Exact elapsed: 1,200,019 ms; 40 samples at 30-second cadence.
- Automated descent: 2,100.253 m, 33 visited rows, zero corridor blockers, zero missing chunks.
- All Slalom, Tree Slalom, and Free Style runs finished before measurement; bottom-Yeti activation and reset passed.
- Heap: 11,884,284 initial; 45,558,668 peak; 38,945,172 final; 27,060,888 growth.
- Replay: 7,200/7,200 retained; 64,935 old frames evicted; deterministic seed/version/digest metadata present.
- Final bounds: actors 21/22; sprites 89/512; VFX effects 6/56; VFX tracks 16/48. Sample maxima also remained within every asserted capacity.
- One AudioContext; seven resizes; final lifecycle visible, unpaused, with no reasons; post-soak input responsive.
- Console errors, page errors, failed requests, fallback draws, missing frames, and missing chunks: 0.
- Final rolling 600-frame window: 60.00 FPS, 0.00% rolling long frames, 16.67 ms p95, 16.68 ms p99, 16.68 ms maximum.

The passing report was independently queried after process exit: its duration/sample/descent/error/lifecycle/world/fallback predicate evaluated `true`. Two incomplete infrastructure launches are disclosed in the executor notes and were not counted or reused.

## Visual, clean-room, and prior-gate checks

- Current presentation checks passed 2/2, player content remained at least 48 px in every representative state, and all fallback counters remained zero.
- Desktop and 768×600 captures were manually inspected; a new forced-touch 768×600 capture shows all 14 readable action controls clear of the status header, event/feedback cards, and footer.
- Approved concept/source-chroma hashes and the derived atlas hash match Gate 6; the attempt-2 diff changes no file under `assets/sprite-sheets` or `public/assets`.
- Clean-room audit passed 78 files with zero findings and all provenance checks true.
- Latest independent verdicts for Gates 0 through 6 remain PASS. Gate 7 is deliberately not self-adjudicated, and `docs/BUILD_GAUNTLET.md` is unchanged.
