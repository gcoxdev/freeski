# Gate 7 web interface audit

Audit scope: `index.html`, `src/styles.css`, `src/render/accessibilityControls.ts`, and the browser-facing input/lifecycle wiring in `src/render/scenes/AlpineScene.ts`. The review refreshed the [Vercel Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) on 2026-08-10 and used them as a checklist.

## Verified

- Every interactive control is a native button or labeled input; icon-only ambiguity is avoided.
- A keyboard-visible skip link is the first focus stop and moves focus directly to the playable mountain. It stays outside the viewport until focused, respects safe-area insets, and does not cover play during ordinary input.
- The document contains one descriptive, assistive-technology-visible `h1`, followed by the settings dialog `h2`; the heading hierarchy has no skipped level.
- The accessibility panel is a labeled modal dialog, traps Tab/Shift+Tab, closes on Escape, moves focus inside on open, and returns focus to its trigger on close.
- The game canvas is keyboard-focusable, has an accessible label, and uses a visible focus ring.
- Live status, pause, feedback, mode, and settings messages use polite live regions without replacing control labels.
- Touch controls expose the same 14 game actions through the centralized action layer. Targets are at least 48 px, use `touch-action: manipulation`, preserve intentional tap feedback, and respect safe-area insets.
- Reduced-motion works from both the persisted setting and `prefers-reduced-motion`; animation duration is suppressed without disabling gameplay.
- The viewport does not disable zoom. Panels contain overscroll. Long seed/status text can wrap. Numeric settings output uses tabular figures.
- No `transition: all` remains. Focus styles are never removed without a visible replacement.

## Product-specific choices

- Gameplay shortcuts are ignored while focus is in a button, input, textarea, select, or editable region so operating settings cannot steer the skier.
- Closing settings restores focus to ACCESS, following dialog conventions. Keyboard players can Tab to or focus the canvas to resume game shortcuts; pointer/touch/gamepad input remains available.
- The skip target uses `tabindex="-1"`, so it enters the focus order only through fragment navigation. Its visible playfield focus ring confirms the destination without adding another routine Tab stop.
- Canvas motion is intentionally not represented as a DOM animation. Reduced motion instead lowers VFX density, disables presentation shake/flash at runtime, and offers the gentler Yeti presentation.
