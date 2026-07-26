# Production Image Prompt Ledger

Mode: built-in image generation. Generated sources were copied into this folder and deterministic
derivatives were produced locally by `tools/build-lore-production-assets.py`.

All prompts shared this baseline:

- painterly, pre-rendered, fixed 2D late-1990s science-fiction strategy art with modern polish;
- dark command-station blacks, iron, bone, ochre, oxidized red, crystal cyan, and restrained amber;
- practical surfaces, readable silhouettes, subtle CRT/scanline texture;
- no text, labels, logos, watermarks, franchise imitation, or low-poly 3D battle aesthetic.

## Production atlases

| Asset | Prompt-specific request |
|---|---|
| Rell states | A consistent 2×2 atlas: idle, speaking quietly, alert by becoming still/intent, signal-lost; short dark hair, worn olive-black uniform, brass tabs, physical paper and archive machinery |
| Registry glyphs | A 3×4 atlas in race order; small-readable UI identifiers rather than invented in-world flags; Terran filing tab, Silicon ordinal bars, ochre Zephyr population, Crystalline prism, bone ring with vermilion Void route, Mechanicus shift stencil, Bioform lineage, Nomad convoy paint, Ancient absence, Quantum interference, Titan structural cut, Shadow negative-space breach |
| Sector tiles | A 3×4 atlas: types 0–10 in code order plus a reserved blank; tactical painterly sensor art with restrained backgrounds |
| Battle effects | A 4×2 black-backed additive atlas: laser, plasma, missile, shield ripple, explosion, wreckage, retreat arcs, warning sweep |
| Construction | The same facility in scaffolding, upgrade, damaged, disabled, and completed states |
| Relics | Five distinct physical objects from one unknown maker, then corrected to remove readable seams, fasteners, and assembly logic |
| Events | Probe lost with cause unknown; shoal partial loss; collapsar annihilation; first colony; restrained victory; empty-berth defeat |
| Relic Lifter | One neutral, universal armored cradle ship with four load arms, sealed containment, no weapons, and no visible relic |

## Race fleet sheets

Every sheet requested three equal cells, isolated orthographic three-quarter silhouettes, nose right,
one coherent family, and roles constrained by actual race access.

| Race | Prompt-specific fleet grammar |
|---|---|
| Terran | repaired industrial boxes, carrying-handle spine, service rails, field repairs |
| Silicon | pale heat-sink slabs, black computation cavities, radiator fins, no face/cockpit |
| Zephyr | population is the silhouette; synchronized ochre/rust formations, no queen or capital |
| Crystalline | grown lit geology, stress planes, refraction, no metal hull under crystal decoration |
| Void Walkers | dust/bone inherited couriers, tally scars, exactly one vermilion route mark |
| Mechanicus | quilt hulls, four eras of plate, weld over weld, replaceable tools and gantries |
| Bioform | one living lineage, vascular shell, load-bearing bone, membrane and growth rings |
| Star Nomads | modular inhabited canisters, route cords, repair layers, hand-painted convoy variation |
| Ancients | severe gap geometry and impossible aligned masses; technology only, never a body |
| Quantum | mutually exclusive positions, doubled precise edges, restrained cyan/amber interference |
| Titan Lords | infrastructure-scale mass, buttresses, carved load-bearing house cuts |
| Shadow Realm | overlapping matte-black volumes, warm apertures, uncountable interior, no insignia/eye |

## Campaign and lore stills

| File | Final scene request |
|---|---|
| `01-sesses-two-seconds.png` | Four Terran hulls in a transit shoal; lead ship decelerates sideways, three survive, one becomes debris |
| `02-sesses-crossing.png` | Rell alone, striking one assigned designation and writing a new name in a margin beside a swept route display |
| `03-the-schedule.png` | Seven patched Mechanicus hulls passing an old annotation marker, no recon screen, not searching |
| `04-ninefold-patience.png` | A pristine empty Nomad freight hull in a worn hidden berth, untouched galley visible, no explanation |
| `05-wren-sideways.png` | Void courier leaves the failed lane at the wrong angle; eight traces continue; nothing in the lane is shown |
| `06-they-could-not-be-moved.png` | Two moons partly replaced by Titan hull mass; a fixed battery fires from its recoil gouge |
| `07-four-hundred-alone.png` | Ordered Zephyr total recedes; smaller disconnected fragment hangs across the shoal |
| `08-three-cards.png` | Rell deliberately writes the same notation on three code-five cards before the Registrar |
| `09-trace-market.png` | Keth withdraws a dangerous chart while Rell holds the older copy, warm Nomad market behind |

## Posters

| File | Final composition |
|---|---|
| `01-the-lamps-are-out.png` | Rell and a command station small below a vast Trellis whose Lamps are extinguishing |
| `02-every-map-is-written-in-wrecks.png` | A hand spends reckoning; one verified route climbs past shoal, wreck, mouth, and reaches a colony |
| `03-roads-run-both-ways.png` | Twelve fleet languages converge on a rebuilt Lamp; one lit road rises into featureless black |

## Public archive social card

| File | Final composition |
|---|---|
| `social/lore-social-source.png` | A wide collector's-edition archive table: worn Game of Worlds case file, exact title “GAME OF WORLDS / THE ARCHIVE ROOM,” taped command-station stills, route chart, relic photograph, amber desk light, charcoal and aged-bone palette |

The public 1200×630 JPEG is rebuilt as `public/lore/assets/lore-social.jpg`. It was generated with
the built-in image-generation workflow and checked for exact title text before promotion.

For exact natural-language prompts and correction history from the earlier broad reference pass, see
`../PROMPTS.md`. This ledger records the production pass at the level needed to reproduce its intent
without treating generated pixels as canon.
