# Accessibility and rendering review - September 2026

Reviewed the real mock-server browser flow: landing, login, lobby, game construction, fleets, research and colonization. Playwright and axe cover WCAG A/AA checks, including mobile. This is scoped automated coverage plus screenshot and keyboard review, not a claim of complete accessibility conformance.

## Fixed

- The urgent countdown alternated to pure red, measuring 4.41:1 against its background. A steady pale red now preserves urgency without blinking or dropping below the normal-text contrast threshold.
- Research descriptions and prerequisites were 10-10.5px. Descriptions now use a 13px system face and increased line spacing; names are 14px and prerequisites 12px. Secondary console text is brighter. Disabled research retains readable names and requirements so players can plan unlocks.
- On phones, removed the legacy 110px turn-clock cap and fixed-width text buttons. The measured header reserves room for End Turn, menu labels and resources without overlapping.
- Console tab panels now receive keyboard focus, allowing PageDown and other native scrolling keys even when every purchase is unavailable. Existing arrow-key tab selection and map navigation remain in place.
- External font CSS no longer blocks first render or deferred game scripts on login, lobby and game pages. Browser coverage deliberately stalls the font provider and verifies login is usable. The two mandatory Three.js modules are preloaded to shorten dependency discovery.
- Battle post-processing applied DPR twice. At DPR 1.4 this requested 1.96 times the necessary target pixels. The composer now uses physical buffer dimensions with its own ratio fixed to one. This reduces target pixel count by about 49%; it is not a measured FPS claim.
- Galaxy post-processing now tracks adaptive renderer DPR, keeping its targets and antialiasing texel size aligned.
- Dropping post-processing or restoring the map context also disposes individual passes, releasing bloom buffers that EffectComposer.dispose does not own.
- Hidden documents skip galaxy and battle frame work without cancelling authoritative battle completion timers.

## Validation

The rendering regression uses the shipped EffectComposer implementation to check physical buffer sizes at high and reduced DPR, antialiasing uniforms and pass disposal. Browser coverage checks tab navigation, panel scrolling, the urgent timer, contrast and screenshots at desktop/mobile sizes. Responsive layout and gameplay checks cover existing controls.

Local network timings are not production Core Web Vitals. GPU-specific quality and driver behavior still warrant checks on representative hardware.

References: https://threejs.org/docs/pages/EffectComposer.html and https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html.

## Follow-up: chat, overlays and idle rendering

- Analytics and all five codex sections were audited with axe; no A/AA violations were reported in those tested states.
- Removed the nested chat clipping limit so the focusable outer panel can scroll; Latest reaches the newest message.
- Previous/Latest chat now operate on visible history instead of the hidden legacy log. The feed is a named, focusable region, new messages use a polite live log, and history is capped at 200 entries. Incoming messages do not replace the historical message being read.
- Disconnected or failed socket sends preserve the draft and report that it was not sent. They no longer display a false local sent message. Successful socket submission is not a server delivery acknowledgement.
- Removed the recursive whole-page selection blocker, which traversed all descendants repeatedly and prevented selecting input and gameplay text. CSS limits selection suppression to canvases and buttons.
- Chat text uses a larger system face on the console background. Hidden legacy chat no longer starts periodic age updates or fade animation.
- Battle teardown cancels its animation callback. An idle renderer no longer schedules another frame; the next battle restarts animation through the existing entry point.

Coverage includes keyboard history controls, preserved drafts, screen-reader semantics, selectable text, overlay contrast and idle animation cleanup.

### Landing and lobby polish (September 2026)

The landing hero uses a high-priority, dimensioned 93 KB WebP instead of procedural Three.js rendering and texture workers. Landing JavaScript now only measures the header and supplies text equivalents for faction meters. Typography renders directly from CSS; decorative ticker motion and metal framing are suppressed. Edit landing source files and run `node tools/build-landing.js` to refresh the shipped assets.

The lobby puts the game browser before the labeled create form, removes the decorative tactical preview, and uses `public/css/lobby-polish.css` for the quieter palette and responsive layout. Waiting-room controls retain the existing lobby hooks. `tests/e2e/entry-design.spec.js` checks artwork readiness, absence of renderer requests, keyboard order, game creation, mobile overflow, and WCAG AA axe checks for all three entry surfaces.

### Shared controls, faction choice and official identity

All shipped public pages load `public/css/controls.css` for bold system-font button labels, solid high-contrast button fills, selected/disabled states, and keyboard focus. Its named important cascade layer intentionally wins over legacy page-specific important declarations. Keep label and background colors paired when adding button variants.

The faction chooser now uses `public/css/race-polish.css`, a compact roster, full-label horizontal multiplier charts, and a confirmation bar that stays visible. Bar lengths encode raw multipliers on a 0-to-2 scale; the midpoint marks the 1.00 baseline. Text explicitly distinguishes advantages and penalties, including inverse ship costs. Actual values remain visible when a bar reaches the display limit. Faction selection, locked-faction inspection, and keyboard radio navigation retain the existing handlers.

Lobby membership is retained until a leave acknowledgement arrives. Clearing or switching rooms discards the old roster and pending automatic start; faction confirmations recheck the connection before sending. Malformed escaped player names no longer abort a roster update.

Mobile game tabs use two rows, and the layout reserves 78 pixels for a wrapped chat footer below 560 pixels. Login now puts the account form ahead of decorative content on small screens. Guide and archive action links use the same button rules; archive caption contrast is corrected. The shared identity is documented in docs/art-direction/official-identity.md.

Lobby action labels now use Arial Black at weight 900, including nested captions that previously retained narrow legacy font families. Dropdowns and disclosure controls use bold Arial. The button-weight browser regression checks parent and nested label styles, contrast, and a successful faction-change acknowledgement. The mock database now supports the waiting-status query used by faction changes.


## In-game follow-up, September 6

`game-polish.css` reduces panel effects, raises the countdown size, centers probe confirmation and exposes building capacity. `planet-inspection.js` drives a close-up in the existing WebGL context. Its orbit is illustrative, with counts and knowledge labels derived only from received sector intel. Exiting restores camera framing and sector visibility.

`faction-hulls.js` supplies cached faction silhouettes to the galaxy and battle renderers. `pl` already carries each player's race; the game client now retains it and passes it to fleet/battle rendering. Unknown identities retain the generic hull. Planet glint is capped and reduced, and planet radii vary deterministically by class and sector. Empty owned routes no longer request world textures or draw generic planets.

Validation includes the unit suite, mock HTTP/WebSocket integration, Chromium desktop/mobile screenshots, axe checks, modal keyboard handling and a synthetic 3D battle with two faction hull families. Ordinary UI campaigns are opt-in with `PLAY_REVIEW=1` and `tools/run-e2e.js tests/e2e/ai-campaign-review.spec.js`; these do not grant resources or reveal hidden server terrain. The first baseline campaign ended around turn 45 with an AI domination victory; lack of military pressure, rather than inability to expand, was the confirmed weakness.

The automatic orientation briefing now yields to an order already in progress, including when it appeared just before that order. Explicit Help tours remain available. New home systems include one adjacent Terraforming-0 colony opportunity; later Terraforming research grows by 1.6 per level instead of doubling.

Final ordinary campaigns against medium/balanced and aggressive/aggressive opponents both completed with AI domination victories. The driver placed UI orders in batches during the first 24 turns, then observed the endgame using End Turn; it did not inject game resources or edit terrain. In the medium campaign, the human reached five worlds by turn 21 (second world by turn 3). These are playthrough observations, not a claim of exhaustive or matched-seed balance validation.

The chat transcript now uses the measured comms bay, fixing an invisible empty transcript layer that intercepted the mobile Inspect button. The inspection view restores focus to Inspect, or End Turn when the survey is hidden on a short landscape screen.
