# Opening gameplay, waiting room and rendering review

## Changes

- Sector Survey now leads with planet capacity, richness and Terraforming eligibility. Sensor-only contacts and dated scans remain explicitly limited. Numeric survey rows and disabled-action reasons use readable text, and resource shortages name exact missing quantities.
- Confirmed construction, research, colonization and arrivals produce a short grouped receipt. The persistent event feed retains every result. Loss classification precedes routine fleet/probe movement.
- Chill difficulty stays defensive regardless of strategy. Attacking AI keeps a home guard. AI fill/start uses the selected difficulty/strategy rather than hardcoded aggressive opponents.
- Host departure now completes the database ownership transfer before sending updated current-game snapshots, restoring the successor's AI/start controls without a reload. AI management remains host-only.
- Room invite links are visible and survive registered login, registration and guest sign-in. Only validated positive numeric room IDs are preserved. Waiting-state labels are plain text; game-view navigation is reserved for launch/active games.
- Small on-screen planets use 16×12 sphere geometry instead of 48×32. Close-ups restore full geometry. Hidden inspection sectors skip their animation updates. Unchanged cost labels/availability attributes no longer trigger repeated DOM rebuilding.
- The first battle can shed expensive post-processing after four slow frames, then reduce resolution if necessary. Shader-changing shadow/light adjustments still wait for the next battle. Automated gameplay now follows the same adaptive resolution behavior as players; explicit art-capture overrides remain available.

## Gameplay method and findings

Used the existing Chromium UI harness to register, create ordinary Quick games, select races, add AI, build, research, move, colonize and end turns. No resource grants or hidden server terrain were used for these openings. Orders were attempted each turn for 12 turns against Chill/Balanced, Medium/Balanced and Aggressive/Aggressive opponents.

Before changes, the medium and aggressive openings finished; a chill attempt stopped at turn 6 because the test clicked while the asynchronous probe prompt was arriving. The harness now allows the sector response before selecting a move action. All three final openings completed. Final human empires held 3, 3 and 2 worlds respectively. These are different generated maps and ordinary scripted decisions, not matched-seed balance trials or expert play. They demonstrate functioning expansion and usable controls, not a validated difficulty curve.

The main opening friction was information placement and small unavailable-action text. A new colony is productive once it receives extractors; routinely filling every homeworld slot prevents later infrastructure, so the summary and capacity guidance now make that tradeoff visible. Aggressive play left less expansion room in the observed final opening, but more repetitions are needed before tuning resource grants or research costs again.

## Rendering measurements

`RENDER_REVIEW=1` runs `tests/e2e/render-load-review.spec.js`; `RENDER_BASELINE=1` serves the old galaxy/battle modules from commit `b2a9890`. Other application code and the synthetic scene recipe remain current. Ran the final comparisons serially at 1280×720 in Chromium software WebGL, with normal adaptive rendering. Six-second animation-frame samples; these are local stress measurements, not production Core Web Vitals or hardware-GPU benchmarks.

The busy scene reveals 112 fixed synthetic sectors and waits for its content queue to drain. The fleet scene repeatedly animates eight groups. The battle scene uses the same 24-versus-20 hull input, with the map correctly paused during playback. Synthetic scene setup is isolated from the ordinary gameplay runs above.

| Scene | Baseline median / p95 | Final median / p95 |
| --- | --- | --- |
| Ordinary opening | 50 / 83 ms | 33 / 67 ms |
| Busy galaxy | 367 / 383 ms | 150 / 167 ms |
| Busy galaxy with fleet animation | 383 / 917 ms | 167 / 183 ms |
| First battle | 483 / 717 ms | 50 / 83 ms |

The dense software-rendered galaxy remains slow despite the improvement; hardware testing and further reductions in draw calls are still worthwhile. No production loading-speed claim is made. [Three.js renderer diagnostics](https://threejs.org/docs/pages/WebGLRenderer.html) informed the added read-only geometry/draw-call diagnostics.

## Regression coverage

Unit coverage includes AI difficulty/home defense, loss classification, map/inspection geometry switching, and immediate battle adaptation. Browser coverage exercises resource shortfalls, order receipts, desktop/mobile accessibility, inspection and Escape/focus restoration, room invitation through registration, host handover, AI addition, and status styling. The longer gameplay and rendering reviews are opt-in; deterministic UI regression checks run normally.
