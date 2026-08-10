# Gate 7 attempt 2 performance stability evidence

The unchanged automated profile is a production Chromium/Canvas2D proxy at 768×600 with one worker and the launch flags recorded in each JSON report. It measures a 300-frame empty-page `requestAnimationFrame` ceiling before a 13-second no-poll game window. It is a repeatable stress proxy, not a certification of a particular physical GPU.

## Remediation

The attempt-1 judge observed a valid 60.00 FPS host calibration but a 34.99 ms game p99 against the unchanged `≤34 ms` policy. Attempt 2 makes no test, threshold, sampling, ordering, rounding, skip, or averaging change. It removes render-loop allocation churn instead:

- `ChunkDeltaStore` stores frozen immutable deltas once per mutation and returns their stable references instead of cloning/freezing on every object query.
- `MountainStream` returns the same frozen snapshot and active-chunk array while chunk coordinates, travel direction, and viewport chunk radius are unchanged.
- `AlpineScene` reuses screen-coordinate and snow-line geometry, uses a stable empty interaction list in training, tracks chunk transitions numerically, and caches living-slope ramps by active chunks, scenario identity, and delta revision.
- Focused unit tests require stable immutable delta/window identities and invalidate them after real mutations or stream-signature changes.

## Fresh unchanged-policy results

| Run                                  | Calibration | Empty ceiling | Game average |      p95 |      p99 | Rolling long frames |  Maximum | Result |
| ------------------------------------ | ----------- | ------------: | -----------: | -------: | -------: | ------------------: | -------: | ------ |
| Diagnostic probe                     | Valid       |     60.00 FPS |    60.00 FPS | 16.67 ms | 16.68 ms |               0.00% | 16.68 ms | PASS   |
| `performance-valid-01.json`          | Valid       |     60.00 FPS |    60.00 FPS | 16.67 ms | 16.68 ms |               0.00% | 16.68 ms | PASS   |
| `performance-valid-02.json`          | Valid       |     60.00 FPS |    60.00 FPS | 16.67 ms | 16.68 ms |               0.00% | 16.68 ms | PASS   |
| `performance-valid-03.json`          | Valid       |     60.00 FPS |    60.00 FPS | 16.67 ms | 16.68 ms |               0.00% | 16.68 ms | PASS   |
| `performance-production-matrix.json` | Valid       |     60.00 FPS |    60.00 FPS | 16.67 ms | 16.68 ms |               0.00% | 16.68 ms | PASS   |

The three retained dedicated files are consecutive fresh valid-calibration passes. The diagnostic probe immediately before them and the performance case inside the subsequent complete production matrix also passed. Every actual attempt-2 calibration was valid; no valid performance failure occurred. All five game windows had 600/600 samples, zero fixed-step debt, bounded actors/sprites/VFX, zero capacity or missing-frame fallback, zero missing chunks, and zero console/page errors.

Before the diagnostic probe, one sandboxed command could not bind the localhost preview port (`EPERM`). It produced no browser calibration, game sample, or JSON report and was rerun with approved localhost access. This infrastructure launch failure is disclosed but is not represented as a performance sample.

No attempt-1 evidence was altered. Its disclosed invalid ceilings, long-frame failures, and 34.99 ms p99 failure remain intact in the attempt-1 packet.
