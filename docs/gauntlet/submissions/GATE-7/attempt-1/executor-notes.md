# Gate 7 executor notes

This is executor evidence, not a verdict. The orchestrator froze candidate `421aab1b522523ec44ffe379f415ed498b85f1ac`; no Gate 7 judge verdict or `BUILD_GAUNTLET.md` entry is included.

## Implemented release hardening

- Central actions now aggregate remappable keyboard bindings, standard-layout gamepads, pointer input, and semantic multi-touch buttons without changing simulation APIs.
- Accessibility settings cover reduced motion, screen shake, impact flash, master volume, and a gentle Yeti presentation. Settings persist locally, seed reduced-motion defaults from `prefers-reduced-motion`, and are exposed through a keyboard-accessible modal with focus trapping.
- Automatic pause tracks settings, blur, and hidden-document reasons independently; input sources are released on lifecycle boundaries and resize recovery is observable.
- Production rendering uses bounded atlas/VFX/actor pools, cached snapshots, and staggered DOM diagnostics. Performance evidence reports raw distributions and explicitly limits its hardware claim.
- Replay export stores seed, generator version, fixed-step action frames, a digest, and bounded-capacity metadata with no DOM snapshot.
- The fixed release soak covers all event modes, a 2,100 m corridor/Yeti run, resize, hidden/visible, blur/focus, bounded pools, replay eviction, heap trend, one gesture-created audio context, and post-soak input.
- Static clean-room auditing inventories shipping files by SHA-256, checks provenance declarations and historical-format/source markers, and publishes honest limitations.
- README now documents install, development, production preview, controls, gamepad/touch mappings, browser/device/API certification caveats, accessibility, replay/debug output, performance interpretation, soak execution, and the clean-room audit.

## Timing-sensitive test correction

The first soak invocation never entered its measurement loop because it waited for an exact `worldY === 0` value after reset. Full runtime telemetry is intentionally published at 2 Hz, while simulation resumes immediately, so the reset occurred but the exact origin was not observable. The corrected proof requires a larger run number, grounded motion, simulation time below two seconds, and world Y in `[0, 10)`. A focused production test exercises the full 2,100 m → bottom-Yeti → keyboard-reset path.

The same publication cadence exposed an old absolute `<5 m` post-capture assertion at `5.1975 m`. That check now records the reset baseline and proves that held recovery input advances the skier by more than one meter. The focused living-slope test then passed twice consecutively, followed by a green full sequential matrix.

## Design review influence

The frontend-design and web-interface review guidance shaped the compact accessibility modal, explicit focus treatment, semantic touch controls, minimum-viewport behavior, reduced-motion support, and the documented UI audit in `docs/WEB_UI_AUDIT.md`.

The orchestrator's final interface audit added a first-focus skip link, one descriptive h1, an h1→h2 hierarchy, a focusable play-region destination, and explicit 768×600 browser coverage. The focused test passed. No simulation or Phaser render-loop code changed, so the successful soak was not repeated. Performance follow-ups included invalid and non-passing host-contended samples, followed by an unchanged 5/5 production-matrix pass; every result is disclosed without relaxing policy.
