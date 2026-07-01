# Visual Language

## Intended Feel

Game of Words should feel like the player is operating a durable command station, not browsing a modern web app. The interface can still be built with HTML, CSS, Canvas, and WebGL, but the visible result should feel physical, fixed, and deliberate.

Think:

- A central tactical monitor, not a generic page canvas.
- Side and bottom consoles that look installed into the command station.
- Status screens that light up or tune in, not popups that feel like web modals.
- Animated details that imply machinery, signal, and atmosphere.

## Layout Principles

- Favor a fixed 16:9 composition that scales as a whole before reflowing.
- Use letterboxing or constrained regions when needed to preserve the command-station silhouette.
- Keep real UI controls in defined screen/control regions so contributors can maintain them.
- Avoid nested card layouts, dashboard tiles, and generic rounded web panels.
- Modal or temporary UI should look like an instrument coming online inside the console.

Good base regions:

- **Central tactical viewport:** the galaxy map, fleet paths, sector hazards, probe reveals, and fog of war.
- **Commander feed:** event narration, talking-head portrait, waveform, severity lamps.
- **Resource console:** metal, crystals, research, turn timer, fleet capacity.
- **Action console:** build, probe, move, colonize, research, diplomacy.
- **Log strip:** recent events with compact severity indicators.

## Space Map Treatment

The map should read as a 2D sensor display with painterly atmosphere:

- Star specks with subtle twinkle and depth variation.
- Galaxy and nebula washes with slow noise drift.
- Suns with pulsing corona rings.
- Planets with painterly halos and clear ownership/readiness states.
- Black holes with red/orange sensor distortion rings and warning overlays.
- Asteroids with drifting dust and small impact flickers.
- Unexplored space as foggy signal interference.
- Fleet paths as glowing tactical traces rather than realistic flight trails.

## Commander Feed

Important events should queue into a status feed:

- Probe destroyed.
- Fleet arrived.
- Fleet lost to a black hole.
- Asteroid belt damage.
- Colony founded.
- Battle won or lost.
- Research completed.
- Victory warning or victory achieved.

The panel can use idle, talking, alert, and static states. The portrait should be stylized and non-identifiable unless Steve later chooses named characters. The goal is not photorealistic acting; it is a 1990s command-briefing screen with modern polish.

## Motion Rules

Most of the scene should remain stable. Motion should be local and meaningful:

- Blink lights in patterns tied to severity.
- Use sparks and smoke sparingly near damaged or high-alert regions.
- Apply CRT flicker and scanline movement subtly.
- Use waveform motion only while the commander feed is active.
- Let hazard sectors animate more strongly than safe sectors.
- Avoid constant full-screen movement that makes the tactical state harder to read.

## Boundaries

Do not copy the low-poly battle aesthetic from the reference era. Do not turn the game into a 3D battle viewer. Do not copy reference screenshots or source artwork directly. Preserve gameplay readability and contributor maintainability over pure spectacle.
