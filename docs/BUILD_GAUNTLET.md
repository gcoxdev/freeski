# FreeSki build gauntlet log

This is the append-only public record for independently judged build gates. Product specifications and criterion text remain authoritative in `docs/GAUNTLET_LOOP_PROMPT.md`.

## Baseline

- Base revision: `e63675c`
- Package manager: npm
- Runtime baseline: Node.js 22.12 or newer
- Approved stack: TypeScript, Phaser 3, Vite, Vitest and Playwright
- World coordinate unit: meters
- Fixed simulation target: 60 Hz
- Default seed: `classic-1991`
- Generator version: `freeski-world-v1`
- Architecture boundary: `src/render` owns Phaser; `src/simulation` and `src/world` are pure TypeScript

## Gate status

| Gate                               | Latest adjudicated attempt | Independent verdict | Candidate |
| ---------------------------------- | -------------------------: | ------------------- | --------- |
| Gate 0 — Repository baseline       |                          1 | PASS                | `602d4c8` |
| Gate 1 — Skiing vertical slice     |                          1 | PASS                | `1d923ed` |
| Gate 2 — Deterministic mountain    |                          2 | PASS                | `0091cbe` |
| Gate 3 — Collisions, air and Style |                          1 | PASS                | `9472d8c` |
| Gate 4 — Event modes and records   |                          1 | PASS                | `f98d0ca` |
| Gate 5 — Living slope and Yeti     |                          2 | PASS                | `9e23730` |
| Gate 6 — Art, VFX, UI and audio    |                          1 | FAIL                | `23348f9` |
| Gate 7 — Release candidate         |                          — | NOT STARTED         | —         |

No gate is accepted by this baseline entry. Only a fresh judge verdict recorded below may change a gate to PASS.

## Adjudications

### Gate 0 — attempt 1

- Candidate revision: `602d4c8bcd1327efdbb9e382eb016a9365bfa85e`
- Evidence commit: `68f0530f1d03d0696018f15441aa2a9d4eedab65`
- Judge isolation: fresh context, detached candidate worktree, read-only source authority
- Independent verdict: **PASS**
- Confidence: `0.99`
- Criteria: G0.1–G0.6 all PASS
- Independent checks: clean install, formatting, typecheck, lint, 7 unit tests, production build, 2 Chromium E2E tests, desktop/minimum-viewport runtime and visual inspection
- Non-blocking note: Vite reports an advisory Phaser chunk-size warning; code splitting remains deferred until later content creates meaningful boundaries.
- Verdict artifact: `docs/gauntlet/submissions/GATE-0/attempt-1/judge-verdict.json`

### Gate 1 — attempt 1

- Candidate revision: `1d923ede81cd2e39bc4e2f9117710fc34d5ac0e7`
- Evidence commit: `888f5055f7efafe3b90dd23546fe9c0d25ad29f4`
- Judge isolation: fresh context, detached candidate worktree, read-only source authority
- Independent verdict: **PASS**
- Confidence: `0.99`
- Criteria: G1.1–G1.6 all PASS
- Independent checks: clean install, formatting, typecheck, lint, 15 unit tests, production build, 4 Chromium E2E tests, direct full-control playthrough, desktop/minimum-viewport runtime and visual inspection
- Non-blocking notes: temporary code-rendered art remains until Gate 6; Phaser's advisory chunk-size warning and deterministic Canvas fallback are disclosed in the submission packet.
- Verdict artifact: `docs/gauntlet/submissions/GATE-1/attempt-1/judge-verdict.json`

### Gate 2 — attempt 1

- Candidate revision: `de8884f65f5e499173e31102e13f23953e09c83a`
- Evidence commit: `e79d5d870cd2a49b1ce7b6d9ae1fd6889843269c`
- Judge isolation: fresh context, detached candidate worktree, read-only source authority
- Independent verdict: **FAIL**
- Confidence: `0.99`
- Criteria: G2.1, G2.2 and G2.4–G2.7 PASS; G2.3 FAIL
- Independent checks: clean install, formatting, typecheck, lint, 24 unit tests, production build, repeated 6-test Chromium E2E, desktop/minimum-viewport inspection, forward/reverse streaming and 2,100 m audit
- Required remediation: set canonical course lengths to the researched `540`, `1,040` and `1,040` meters and update their unit assertions without changing the correct start/finish coordinates.
- Verdict artifact: `docs/gauntlet/submissions/GATE-2/attempt-1/judge-verdict.json`

### Gate 2 — attempt 2

- Candidate revision: `0091cbed01f019b9131c961b379390029e0549d1`
- Evidence commit: `5c4db076949bcce977ea6d6d47c479518eaf4999`
- Judge isolation: new fresh context, detached candidate worktree, read-only source authority
- Independent verdict: **PASS**
- Confidence: `0.995`
- Criteria: G2.1–G2.7 all PASS
- Independent checks: pristine install, formatting, typecheck, lint, 24 unit tests, production build, 6 Chromium E2E tests, direct desktop/minimum-viewport inspection, seed/reload invariants, forward/reverse streaming and 2,100 m audit
- Repair verified: canonical lengths are `540`, `1,040` and `1,040` meters while all researched coordinates remain unchanged.
- Verdict artifact: `docs/gauntlet/submissions/GATE-2/attempt-2/judge-verdict.json`

### Gate 3 — attempt 1

- Candidate revision: `9472d8caff965509e77f7833e2b8566b5b7d80fd`
- Evidence commit: `abbbf42abcbdbaf38ccf0a47ba93a36a7a591be9`
- Judge isolation: fresh context, detached candidate worktree, read-only source authority
- Independent verdict: **PASS**
- Confidence: `0.995`
- Criteria: G3.1–G3.7 all PASS
- Independent checks: pristine install, formatting, typecheck, lint, 53 unit tests, production build, 7 Chromium E2E tests, default collision-enabled descent, natural lift collision, staged trick/crash/mushroom/burning-tree sequences and desktop/minimum-viewport visual inspection
- Non-blocking notes: named audio cues are emitted but final original audio playback/assets remain Gate 6 scope; the disclosed Phaser chunk-size advisory remains.
- Verdict artifact: `docs/gauntlet/submissions/GATE-3/attempt-1/judge-verdict.json`

### Gate 4 — attempt 1

- Candidate revision: `f98d0ca6534b865a12f45f0f6ae4ad26f94b65ff`
- Evidence commit: `991bec969d22cdebf6767b0e4cad9cee480fae94`
- Judge isolation: fresh context, detached candidate worktree, read-only source authority
- Independent verdict: **PASS**
- Confidence: `0.995`
- Criteria: G4.1–G4.7 all PASS
- Independent checks: pristine install, formatting, typecheck, lint, 66 unit tests, production build, 9 Chromium E2E tests, direct physical completion of all modes, open/backtrack behavior, persistence/bucket/malformed-storage checks and desktop/minimum-viewport inspection
- Non-blocking note: final audio assets and production sprite-atlas presentation remain later-gate scope; the Phaser chunk advisory remains disclosed.
- Verdict artifact: `docs/gauntlet/submissions/GATE-4/attempt-1/judge-verdict.json`

### Gate 5 — attempt 1

- Candidate revision: `e16fc2f965247cb73b20c74b00d96393fb401aac`
- Evidence commit: `c014b734e56c8177250f572e22c5e73b5bde9575`
- Judge isolation: fresh context, detached candidate worktree, read-only source authority
- Independent verdict: **FAIL**
- Confidence: `0.99`
- Criteria: G5.1 and G5.3–G5.6 PASS; G5.2 and G5.7 FAIL
- Independent checks: pristine install, formatting, typecheck, lint, 82 unit tests, production build, full and focused Chromium runs, exact four-boundary probes, unstaged default 2,000 m chase/Turbo/capture/reset playthrough, 768×600 layout/error audit and full-resolution artifact inspection
- Required remediation: couple expert snowboarder jump/tumble transitions to deterministic ramp geometry and prove ramp-free travel does not trigger them; give established interaction/mode feedback reliable priority over ambient living-actor notices and demonstrate repeated green full browser suites.
- Verdict artifact: `docs/gauntlet/submissions/GATE-5/attempt-1/judge-verdict.json`

### Gate 5 — attempt 2

- Candidate revision: `9e23730469a5d901ec2cb533987b37e89e3ccd4a`
- Evidence commit: `b1caaa06764fd95c44a0467fd4e1afd84df3bda0`
- Judge isolation: new fresh context, detached candidate worktree, read-only source authority
- Independent verdict: **PASS**
- Confidence: `0.995`
- Criteria: G5.1–G5.7 all PASS
- Independent checks: pristine install, formatting, typecheck, lint, 82 unit tests, production build, focused living/interaction Chromium tests, two independent 10/10 full browser suites, exact four-boundary probes, generated-ramp/ramp-free comparison, natural chair drop, unstaged default 2,000 m chase/Turbo/capture/reset playthrough, 768×600 layout/error audit and full-resolution artifact inspection
- Repair verified: snowboarders jump and tumble only after deterministic ramp contact; equivalent ramp-free travel does not trigger; interaction/mode feedback reliably outranks ambient actor notices across repeated parallel suites.
- Verdict artifact: `docs/gauntlet/submissions/GATE-5/attempt-2/judge-verdict.json`

### Gate 6 — attempt 1

- Candidate revision: `23348f9779e3b6ac57424a3f8bb7f5d973617f5f`
- Evidence commit: `398c38d7c277a591b45397ef41515376c7f37169`
- Judge isolation: fresh context, detached candidate worktree, read-only source authority
- Independent verdict: **FAIL**
- Confidence: `0.99`
- Criteria: G6.2–G6.4 and G6.6 PASS; G6.1, G6.5 and G6.7 FAIL
- Independent checks: deterministic asset rebuild/source hashes, direct 112-frame pixel/metadata audit, pristine install, formatting, typecheck, lint, 87 unit tests, production build, 11 Chromium tests, instrumented desktop/768×600 play, audio lifecycle/mute persistence, atlas/VFX/runtime/error inspection
- Required remediation: implement real 4 px content-edge extrusion and scale-consistent Phaser metadata with pixel tests; make the complete seed readable; suppress every pre-gesture AudioContext including Phaser's; prevent normal/worst-case sprite-pool fallbacks with explicit telemetry/tests; correct silhouette sizing and UI depth/layout at 768×600.
- Verdict artifact: `docs/gauntlet/submissions/GATE-6/attempt-1/judge-verdict.json`
