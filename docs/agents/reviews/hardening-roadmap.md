# Gameplay Hardening And Production Roadmap

Status: active  
Started: 2026-07-12  
Scope: strengthen the existing game without replacing its risk/reward identity.

This is the canonical plan for the post-audit work. Update its status and implementation notes as milestones land. Current gameplay contracts remain in `docs/agents/gameplay/`; this file describes planned changes until they are live.

## Progress Log

### 2026-07-12: first implementation milestone

- Removed the unused server-oriented event/game-logic modules and stale client combat simulator from the public web root; regression coverage keeps them out.
- Added Content Security Policy report-only headers as groundwork for the DOM/CSP audit.
- Fixed attacking battle victories so surviving attackers capture the sector and remaining infrastructure. Captured Spaceports lose one tier and reset production usage.
- Added backward-compatible Spaceport persistence (`level`, `production_turn`, and `production_used`).
- Activated four Spaceport tiers, dual research/local-tier hull gates, immediate per-turn local production capacity, guarded reservations, and resource/capacity rollback.
- Added live sector/build UI for Spaceport tier, capacity remaining, upgrade requirements, and hull production weight.
- Added focused unit, integration, and browser coverage. Multi-party battle continuation and fully transactional/idempotent combat remain open under Milestones 2 and 4.

## Product Principles

- Exploration remains dangerous. Unknown crossed sectors can destroy ships, and failed actions must not leak hidden information.
- Research is empire-wide; worlds, buildings, fleets, defenses, Spaceports, and production capacity are local.
- Server state is authoritative. Browser controls explain rules but never replace server validation.
- Reliability and clarity improvements preserve existing gameplay intent.
- Large-file refactors happen only at tested boundaries during related work, not as a broad rewrite.
- Payments are outside this roadmap until the core game is ready.

## Milestone 1: Safe Foundations

- Remove obsolete server-oriented scripts from the deployable public tree.
- Archive superseded design and deployment reports and point readers to canonical documentation.
- Require per-game table names to come from `game-tables.js`; migrate remaining direct interpolation in bounded batches.
- Introduce Content Security Policy in report-only mode before enforcement.
- Create a deterministic release-smoke browser suite that stays under roughly two minutes.
- Establish consistent labels for colony control, route control, secured hazards, live contact, and dated intelligence.
- Add basic keyboard, focus restoration, Escape, and reduced-motion safeguards.

## Milestone 2: Conquest Correctness

- Attacker victory with surviving ships transfers sector control; defender victory preserves control.
- Captured local infrastructure receives an explicit ownership treatment; destroyed Orbital Turrets stay destroyed.
- A captured Spaceport loses one level, with a minimum of level 1.
- Conflicts with more than two hostile owners resolve until one side remains.
- Ship, building, control, battle-result, visibility, and victory updates must not expose a partially applied conquest.
- Reconnect after conquest must reproduce the authoritative result.

## Milestone 3: Tiered Local Spaceports

Spaceports are unique local facilities. A ship requires race access, empire research, sufficient local Spaceport tier, sufficient local turn capacity, and empire resources.

| Local facility | Required research | Capacity per turn | Hull research supported |
| --- | ---: | ---: | ---: |
| Spaceport I | None | 12 | Military Shipyards requirement 0 |
| Spaceport II | Military Shipyards 1 | 20 | Requirement 0-1 |
| Spaceport III | Military Shipyards 2 | 32 | Requirement 0-2 |
| Spaceport IV | Military Shipyards 3 | 48 | Requirement 0-3 |

Initial balancing targets:

| Construction | Metal | Crystal |
| --- | ---: | ---: |
| Build Spaceport I | 100 | 50 |
| Upgrade I to II | 350 | 100 |
| Upgrade II to III | 800 | 250 |
| Upgrade III to IV | 1600 | 500 |

Existing hull `buildSlots` values become production-capacity costs. Construction stays immediate; capacity resets each turn and does not carry forward. Existing Spaceports migrate to level 1 with no used capacity.

Persistence fields on the unique Spaceport building row:

- `level`
- `production_turn`
- `production_used`

The browser must show local tier, capacity remaining, upgrade cost/research, hull capacity cost, and exact disabled reasons. AI and standing orders obey the same capacity and tier rules.

## Milestone 4: Battle And Clock Durability

- Generate a private random seed for each battle/hazard resolution.
- Resolve randomness through a deterministic PRNG and record the rules version.
- Give battles stable idempotency keys.
- Commit survivors, turret loss, ownership, captured infrastructure, and completion in one transaction.
- Return the recorded result when a resolution is retried.
- Persist `turn_ends_at`; restore it after restart and apply a documented downtime grace rule instead of granting an entire new turn.

## Milestone 5: Browser Security

1. Inventory dynamic HTML sinks and classify interpolated values by origin.
2. Replace risky templates with safe DOM construction or centralized escaping.
3. Collect Content Security Policy report-only violations.
4. Enforce CSP after production reports are clean.
5. Introduce server-issued opaque `HttpOnly`, `Secure`, `SameSite=Lax` sessions with rotation and revocation.
6. Maintain a short compatibility path while HTTP and WebSocket authentication migrate.

## Milestone 6: Decision Clarity And Accessibility

- Add a compact selected-sector Decision Summary with action availability and exact failure reasons.
- Show intel provenance and age, route hazards, unmapped exposure, colonization requirements, and local production state.
- Restore focus after dialogs, trap focus while dialogs are open, and support Escape consistently.
- Add keyboard access, visible focus, reduced motion, and a textual alternative to essential canvas-only sector state.
- Test 1366x768, 1440x900, and 1920x1080 viewports.

## Milestone 7: Measurement And Release Confidence

- Record aggregate probe attempts, successes, losses, blind moves, and subsequent hazard losses before changing probe price.
- Add deterministic AI scenarios for expansion value, route danger, defense, production, fleet matchup, and victory denial.
- Add an isolated production canary that cannot join human rooms or affect progression and always cleans up its marked synthetic game.
- Keep the complete multiplayer/combat suite while running fast release smoke on every deployable change.

## Explicit Deferrals

- No broad rewrite of `server/server.js`, `public/js/connect.js`, or other large files.
- No Stripe enablement work.
- No speculative probe-price change without observed game data.
- No wholesale AI rewrite.
- No ship construction queue unless later gameplay evidence justifies its complexity.

## Release Gate For Each Milestone

- Focused unit tests for authoritative rules and rollback.
- Mock HTTP/WebSocket integration smoke.
- Browser journeys proving state before action, feedback during it, authoritative result, and reconnect recovery.
- Updated player and contributor documentation.
- Clean committed deploy revision on `stable`.
- Production `/health`, `/status`, and affected public journeys verified after deployment.
