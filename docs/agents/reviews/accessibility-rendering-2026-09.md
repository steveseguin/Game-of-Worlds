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
