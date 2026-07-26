# Gameplay Icon Prompt Ledger

Generation mode: **OpenAI built-in image generation**.

All source atlases were generated as original raster art. Individual 256×256 icons were then
deterministically center-cropped and resized by `tools/build-icon-assets.ps1`; the crop step does not
invent or repaint content.

## Shared prompt

Create production game UI icons for *Game of Worlds* in an original painterly 2D, pre-rendered,
bitmap-inspired style. They belong inside a worn fixed command-station interface: charcoal black,
gunmetal, oxidized red, dull bone, restrained branch colour, crystal cyan only where mechanically
appropriate, hard practical rim light, repair marks, scratched glass, and subtle scanline grain.
Use a precise regular grid, one centered symbol or object per cell, consistent isometric/three-quarter
camera, dark metal frames, wide gutters, and strong silhouettes that remain readable at 64 pixels.
Do not include text, letters, numbers, captions, labels, logos, faction insignia, runes, emoji,
watermarks, rounded mobile-game badges, fantasy magic, or glossy generic 3D.

Each level must change the depicted machinery, scale, access, or control. Do not communicate
progression by adding arbitrary stars, pips, or numerals.

## Atlas prompts

The cell order below is the final prompt order and matches `catalog.json`.

### `tech-economy-metal.png`

5×2 grid: surface claim and simple drill; standardized fasteners; deep shaft; load-bearing cut;
automated drill cluster; pressure mine; seam cartography; autonomous pit; planetary works; coreward
mantle tap. Economy green `#5dbb63`.

### `tech-economy-crystal.png`

5×2 grid: raw sorting; clean precision cut; optical grading; resonance wash; instrument stock;
reckoning standard; lossless facets; deep-grade refinery; Concord-purity calibration; perfect
reckoning crystal. Crystal remains engineered material and fuel, never magic.

### `tech-economy-research.png`

5×2 grid: recovered physical papers; shared card index; relay library; concordance desk; distributed
academy; open archive; cross-world method; live peer network; total bibliography; old technical
drawing successfully matched to a functioning machine.

### `tech-weapons.png`

5×3 grid with thirteen filled cells: Laser levels 1–5 are a cutting mount, stabilized emitter,
coherent array, predictive tracker, and steady-service battery; Plasma levels 1–5 are a magnetic
bottle, pulsed bolt, wound-channel projector, cascade chamber, and starfire battery; Antimatter levels
1–3 are pinch containment, a caged void package, and a zero-contact warhead. Final two cells empty.
Weapons red `#e25555`.

### `tech-missiles.png`

3×2 grid: volume-aim rocket; guided salvo; missiles surrounding and bypassing a blue deflection
envelope; acceleration rail; terminal-correction Hyper-V; irrevocable-flight launch. Missiles target
a volume and bypass shields; they do not magically phase through matter. Missile orange `#f08c3a`.

### `tech-armor.png`

5×3 grid with thirteen filled cells: Reinforced Hulls levels 1–5 progress from added plate through
braced spine, compartmental frame, fortress keel, and Yard-Four standard; Reactive Armor levels 1–5
progress through ablative, layered, cellular, countercharge, and battle-shedding construction;
Adaptive Plating levels 1–3 show sensor plate, learning laminate, and a reconfigured second-shot
surface. Final two cells empty. Armor amber `#d8a23c`.

### `tech-shields.png`

5×2 grid with nine filled cells: Deflector levels 1–5 progress from one nudged trajectory through
vector bias, grid, layered envelope, and multiple aimed shots missing the protected center; Phase
levels 1–4 show offset, split envelope, conditional screen, and silent interval. Final cell empty.
Shield blue `#4d79ff`.

### `tech-propulsion.png`

5×2 grid with eight filled cells: Ion levels 1–5 show torch, field shaping, efficient drive, sustained
cluster, and fleet-economy assembly; Warp levels 1–3 show blind geometry, calibrated fold, and the last
honest improvement. These reduce movement cost; they do not increase speed or make blind travel safe.
Propulsion teal `#3fc1c9`.

### `tech-shipyards.png`

3×1 grid: Line Yard for destroyer/cruiser scale; Heavy Slip for battleship/intruder scale; Grand Yard
for dreadnought/carrier scale. Shipyard violet `#9b6dd6`.

### `tech-orbital.png`

5×1 grid: paired short-span gate geometry; targeting lattice; hardened turret battery; linked defense
network; integrated orbital command. Orbital yellow `#e2d268`.

### `tech-terraforming.png`

5×1 grid: suit-only seal-and-scrub dome; linked pressure chain; mask-level open-air tolerance and
first rain; independent living weather; mature self-sustaining world whose builders are generations
dead. Terraform teal-green `#2fbf9f`; never show instant paradise.

### `tech-intel.png`

Corrected square 4×4 grid. Espionage levels 1–8: port-rumour cargo tokens; paid ledger exchange;
provisioning correlation; rubbed-out chart; bought traces; rival charts; fleet ledgers; inner registry.
Counter-Intelligence levels 1–8: quiet audit; closed ledger; probe interception; salting; false
provenance; blinded office; hostile silence; nested unreadable cabinets. Intelligence is agents,
bribes, ledgers, and physical charts, never telepathy. Intel magenta `#d65db1`.

### `buildings.png`

3×3 grid: Seamhead Extractor; Reckoning Refinery; Recovery Academy; Field Spaceport; Expanded Yard;
Fleet Foundry; Grand Fleetworks; Sector Battery; Blindspan Gate. The four Spaceports must read as one
capacity progression. The other structures are individual installations, not invented level trees.

### `ships.png`

3×3 grid in ship-type order: Frigate/First Line; Destroyer/Middleweight; Scout/Cheapest Fact;
Cruiser/Commitment; Battleship/Line of Battle; Colony Ship/Seedship; Dreadnought/War-Ender;
Intruder/Unlisted Knife; Carrier/Recovery Harbour. Preserve unarmed Scout/Colony roles, the Intruder's
absence of markings, and the Carrier's retrieval/support silhouette.

### `actions.png`

4×4 grid: inspect sector; send probe; plot route; execute fleet movement; Warp Gate transit; settle
world; construct installation; upgrade Spaceport; build ship; research; ready turn; configure standing
orders; apply orders; name a swept shoal; chat through the Whisper; surrender. Plotting and executing,
configuration and immediate application, and construction and upgrade must remain distinct.

## Corrective iterations

- The first Intel atlas used an 8×2 layout whose cells were too tall for square UI crops. The final
  atlas was regenerated as the 4×4 layout above.
- A proposed 4×4 Weapons correction omitted two required progression cells. It was rejected. The
  complete original 5×3 atlas remains the source; its cells center-crop cleanly without losing the
  weapon subject.
