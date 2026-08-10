# Gate 7 attempt 2 executor notes

This is executor evidence, not a verdict. The orchestrator froze the completed product work as candidate revision `ad5562e2ba43f17e636814ee8e2801e29536d5cb`. No attempt-1 artifact, Gate 7 judge verdict, or `docs/BUILD_GAUNTLET.md` entry was modified.

## Public findings addressed

Attempt 1 failed G7.4 because a fresh valid 60.00 FPS host calibration produced a 34.99 ms game p99 against the unchanged `≤34 ms` policy. G7.8 consequently failed because the production matrix was not completely green.

Attempt 2 changes the runtime rather than the policy. Every threshold, sample window, ordering rule, rounding rule, skip, and assertion in `tests/e2e/performance.spec.ts` is unchanged.

## Runtime stabilization

- `ChunkDeltaStore` now freezes deltas when they mutate and returns stable immutable references. Rendering no longer clones/freezes one delta per object query. A monotonic revision invalidates dependent caches after mutations.
- `MountainStream` now reuses its immutable snapshot and active-chunk list while chunk X/Y, direction, and viewport chunk radius remain unchanged. It still rebuilds immediately on every meaningful streaming transition.
- `AlpineScene` reuses the hot projection tuple and contour/groomer points, uses one frozen empty interaction list in training, and replaces per-frame chunk-key string creation with numeric tracking.
- Living-slope ramp discovery is cached by the stable active-chunk list, scenario-array identity, and chunk-delta revision. Any stream, scenario, or delta change recomputes and freezes the sorted ramp list.
- Focused tests cover stable frozen delta identity, mutation invalidation/revision, stable stream-window identity, and direction-change invalidation.

These changes preserve seeded simulation, viewport/world behavior, art, 48 px player-state presentation, bounded pools, accessibility, input, lifecycle, and replay APIs.

## Qualification outcome

- Four retained unchanged-policy profiles passed: three consecutive dedicated valid-calibration runs and the performance case inside the full production matrix. Each measured a 60.00 FPS empty ceiling, 60.00 game FPS, 16.67 ms p95, 16.68 ms p99, zero rolling long frames, and zero debt/fallback/error failures.
- The complete functional matrix passed 16/16. The production matrix passed 5/5: performance plus all four release cases.
- Static/build qualification passed formatting, types, lint, 21 files/107 units, 112-frame atlas integrity, production build, clean-room audit, and whitespace checks.
- Current desktop, 768×600, representative player-state, and forced-touch evidence was recaptured and inspected after the runtime changes.
- A brand-new exact soak passed with 1,200,019 ms of measurement and 40 samples. It covered all modes, 2,100.253 m/33 rows, Yeti/reset, resize/visibility/focus transitions, replay eviction, pool bounds, heap trend, audio-context bound, and post-soak input.

## Infrastructure disclosure

One initial performance command could not bind localhost inside the filesystem/network sandbox (`EPERM`) and produced no calibration. It was rerun with approved localhost access and passed.

The first new-soak wrapper was externally reaped before producing a report or test verdict and left its preview server behind; no partial duration was reused. A heartbeat restart then stopped before measurement because that exact stale server still owned port 4174. The stale PIDs were resolved and terminated, the port was verified clear, and the authoritative soak restarted from zero with a 30-second terminal heartbeat. Only the complete passing report from `2026-08-10T13:39:13.441Z` through `2026-08-10T13:59:13.755Z` is submitted.
