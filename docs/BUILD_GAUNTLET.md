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
| Gate 3 — Collisions, air and Style |                          — | NOT STARTED         | —         |
| Gate 4 — Event modes and records   |                          — | NOT STARTED         | —         |
| Gate 5 — Living slope and Yeti     |                          — | NOT STARTED         | —         |
| Gate 6 — Art, VFX, UI and audio    |                          — | NOT STARTED         | —         |
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
