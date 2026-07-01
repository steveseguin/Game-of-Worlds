# Implementation Notes

This direction can be built incrementally over the current HTML, CSS, and Canvas code. A full renderer rewrite is not required for the first pass.

## Recommended Path

1. **Document the current UI zones.**
   Identify the existing map, command actions, resources, messages, chat, tech, and lobby transitions.

2. **Add a command announcer.**
   Build a client-side message queue that listens to existing game events and displays a commander/status feed panel. Start with CSS animation and a small sprite or still portrait.

3. **Create the command frame.**
   Replace generic web-panel styling around the game with a fixed command-station shell. Keep HTML controls inside stable screen/control regions.

4. **Layer the living details.**
   Add CSS or Canvas overlays for scanlines, monitor glow, blinking lights, sparks, static, and waveform bars.

5. **Upgrade the space map.**
   Improve the Canvas star field, sector rendering, fog of war, suns, black holes, asteroid belts, and fleet paths. Keep it readable first.

6. **Add shader effects where they matter.**
   Use WebGL/Pixi/Three only for targeted effects like sensor distortion, nebula drift, black-hole lensing, or CRT post-processing. Do not introduce a broad 3D battle aesthetic.

## Contributor-Friendly Constraints

- Prefer small, named visual systems over one large monolithic renderer.
- Keep gameplay logic separate from presentation effects.
- Avoid baking readable UI text into bitmap assets.
- Keep generated/reference art under `docs/art-direction/`; production assets should live under `public/images/` only when actually used by the app.
- Provide screenshots or short clips for visible UI changes.
- Preserve keyboard/mouse usability and clear text contrast.

## Possible Client Modules

These names are suggestions, not requirements:

- `public/js/ui/command-announcer.js`
- `public/js/ui/status-feed.js`
- `public/js/effects/space-field.js`
- `public/js/effects/hazard-effects.js`
- `public/css/command-frame.css`
- `public/css/commander-feed.css`

## First Useful Prototype

A good first prototype would be:

- A bottom or side command-feed panel.
- A stylized advisor portrait with idle/talking/alert states.
- Event-specific severity colors.
- A typewriter or radio-transmission text effect.
- Scanlines, waveform bars, and warning lamps.
- Integration with existing hazard and battle messages.

This prototype can ship without changing server behavior.
