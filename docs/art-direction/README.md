# Art Direction Reference

This folder captures the visual direction Steve described for future Game of Words UI work. Treat it as a shared target, not a rigid style bible.

The direction is a fixed, intentional command-station presentation: a mostly static 2D bitmap-like interface that feels alive through animated hotspots, layered effects, and event-driven status panels.

## Reference Mood

Use the supplied references for composition and motion philosophy only. Do not copy source artwork, characters, logos, UI layouts, or franchise-specific details into the game.

- EarthSiege mech bay style reference: https://www.old-games.com/screenshot/2096-5-earth-siege.jpg
- EarthSiege command/briefing reference: https://www.old-games.com/screenshot/2096-7-earth-siege.jpg
- Board-game reference mood image: https://brodatyboardgames.com/wp-content/uploads/2025/02/Earth-Under-Siege-8-768x1024.jpg

The desired influence is the mech bay and commander briefing feeling: pre-rendered, fixed, industrial, and alive through small loops. The low-poly in-game battle look is not the target.

## Core Direction

- **Bitmap-first, shader-assisted:** the game should feel like a painted or pre-rendered 2D command interface enhanced with modern glow, noise, distortion, and particle effects.
- **Permanent console layout:** major UI regions should feel physically installed, not like responsive web cards floating on a page.
- **Living static scene:** sparks, cable sway, blinking LEDs, screen flicker, scanlines, steam, radar sweeps, and alert lights should animate selectively.
- **Space as sensor feed:** stars, galaxies, suns, planets, black holes, asteroid fields, fleet paths, and fog of war should read as a tactical display with atmospheric shader motion.
- **Commander status feed:** important game updates should be delivered through an embedded talking-head/status-screen panel.
- **2D over 3D:** avoid low-poly combat scenes, rotating 3D model showcases, or generic polygonal sci-fi dashboards.

## Files

- [visual-language.md](visual-language.md) defines the composition, motion, and UI principles.
- [implementation-notes.md](implementation-notes.md) suggests a practical path that does not require a full renderer rewrite.
- [decision-questions.md](decision-questions.md) lists useful questions before locking production UI decisions.
- [bitmaps/](bitmaps/) contains original generated concept bitmaps for inspiration.

## Prototype

Open `public/command-station-demo.html` for a standalone command-station prototype. It is intentionally isolated from the live game and demonstrates the fixed frame, animated 2D sensor map, commander uplink, scanlines, status lights, waveform, sparks, and event-driven alert states.

Current prototype direction: use an authored bitmap shell first, then place live canvas/text/interaction into screen apertures. Avoid building the scene from visible web panels, cards, rounded dashboard blocks, or generic responsive layout primitives. The goal is a fixed machine surface with living displays embedded inside it.

Runtime prototype art lives in `public/images/command-station/` because the standalone page consumes it directly.

## Contributor Rule

Before making a major visual change to `public/game.html`, `public/css/`, `public/js/main.js`, or the canvas rendering path, check this folder and preserve the command-station direction unless Steve explicitly chooses another direction.
