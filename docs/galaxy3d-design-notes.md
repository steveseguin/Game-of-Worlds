# galaxy3d.js — design notes

Long-form rationale lifted out of `public/js/galaxy3d.js` so that it stops being
shipped to every player on every page load. The code carries a one-line summary and
a link to the section here; nothing was deleted and nothing was summarised away.

Sections appear in source order.

## galaxy3d.js - Three.js main galaxy map view

<a id="galaxy3d-js-three-js-main-galaxy-map-view"></a>

galaxy3d.js - Three.js main galaxy map view.

Renders the full galaxy as an interactive hex plotting table suspended in a
nebula: explored sectors show their contents (worlds, stars, black holes,
asteroid belts), unexplored space stays under fog. Clicking a sector selects
it through the same flow as the minimap, so all existing UI panels keep
working.

RENDER PIPELINE
---------------
There are TWO render paths and the map starts on the cheap one every time.

  PLAIN   scene -> canvas, with the default framebuffer's own MSAA, ACES and
          the sRGB transfer applied by the renderer on the way out.
  POST    scene -> EffectComposer:
             RenderPass -> UnrealBloomPass -> OutputPass -> FXAA

POST is an UPGRADE the machine has to earn, not the default it has to survive
— see "The render path, and how it is chosen" near the bottom of the file for
why, and for the twelve-second first impression that shape replaced.

The POST ordering is deliberate. Everything before OutputPass works in LINEAR
light inside a half-float buffer, which is the only place bloom means
anything: a star photosphere is authored at ~2.6x white and a hex tile at
~0.3, so the threshold can sit at 0.9 and pick out light SOURCES rather than
smearing every bright pixel. OutputPass then applies ACES and the sRGB
transfer once, at the end. FXAA runs after it because it needs perceptual
(sRGB) input to weight its edge test — and it is doing the anti-aliasing that
`antialias: true` cannot, since with a composer the canvas only ever receives
a full-screen quad. On the PLAIN path the canvas receives the scene itself, so
`antialias: true` is live and does that job instead, and three.js applies the
tone map and the colour-space transform itself because the render target is
the canvas. The two paths therefore agree on colour; POST adds the glow.

Consequences worth knowing before editing:
  - Material colours are LINEAR and may exceed 1. That is how something is
    made to bloom; do not "brighten" a thing by pushing its opacity.
  - HUD-ish sprites (sector numbers, fleet badges) are authored just under
    the bloom threshold on purpose. Painting them at pure white makes them
    glow and costs legibility, which is the one thing this view may not lose.
  - Nothing may depend on the composer EXISTING. It arrives late on the
    machines that get it at all, and it can be taken away again.

Exposes window.Galaxy3D with:
  initialize(width, height)
  updateSector(sectorId, statusNum, { fleetSize, indicator, type })
  setSectorDetail(sectorData)          // rich data from sector:: messages
  setSelected(sectorId) / focusSector(sectorId)
  highlightSector(sectorId)            // battle pulse
  clearBattleSector(sectorId)
  animateFleetMove(fromId, toId, { mine, count, warp })
  frameSectors(ids) / setSafeArea(inset) / resize() / isReady()

ui.js queues calls in window.__g3dQueue until this module loads.

## A star sector and an asteroid belt both arrive as STATUS.HAZARD, and they

<a id="a-star-sector-and-an-asteroid-belt-both-arrive-as-status-haz"></a>

A star sector and an asteroid belt both arrive as STATUS.HAZARD, and they
are wildly different things: a belt is a 25-50% per-hull risk you can
SECURE, a star is not something you fly into at all. One swatch for both
is a gameplay lie. `entry.type` separates them, so the plate carries two
cues that survive independently:
  - a hue split inside the bronze family, and
  - a STENCIL painted into the plate albedo (a broken ring for a belt, a
    radial burst for a star), which still separates them in a monochrome
    screenshot and after the dimming applied to non-live tiles.

## Separable box blur over RGBA bytes, wrapping in x and clamping in y

<a id="separable-box-blur-over-rgba-bytes-wrapping-in-x-and-clampin"></a>

Separable box blur over RGBA bytes, wrapping in x and clamping in y.
Returns a Float32Array in the same layout.

This exists for ONE job: killing content finer than (2r+1) texels in an
image that is about to be magnified. See the note at its call site in
buildSkyTexture — canvas gradients arrive carrying the rasteriser's own
ordered dither, and at 7.5 screen pixels per texel that dither is a
visible lattice across the whole sky.

## A generation canvas — and it is opened `willReadFrequently`, which is worth

<a id="a-generation-canvas-and-it-is-opened-willreadfrequently-whic"></a>

A generation canvas — and it is opened `willReadFrequently`, which is worth
two and a half seconds of frozen page.

Every canvas made here exists to be turned into a texture: it is painted
once, usually read back once (the plate atlas derives its normal map by
Sobel over its own luminance), and then never touched again. Chrome's
default is to back a 2D canvas with the GPU — and on a machine whose "GPU"
is a software rasteriser, that puts the plate atlas's several hundred path
fills and strokes onto the SAME rasteriser that is drawing the map, where
they contend with it.

Measured on the audit harness: the atlas's paint pass cost ~500 ms when it
ran before the first frame and 2579 ms when it ran between two frames — the
work had not changed at all, only what else was using the rasteriser. With
a CPU-backed 2D context it does not compete, and getImageData stops paying
for a readback across the boundary as well.

The hint costs nothing on a machine with a real GPU: these canvases are
never composited, never animated and never drawn to the screen.

## THE TWO BIG BAKES, BEHIND ACCESSORS

<a id="the-two-big-bakes-behind-accessors"></a>

THE TWO BIG BAKES, BEHIND ACCESSORS.

Both used to be built eagerly inside ensureScene(), which is to say inside
the one synchronous call that hands the player their board: the plate atlas
measured 683 ms on the audit harness and the fog haze 16 ms, and every
millisecond of that was a page that could not answer a click.

Behind an accessor they are built on first USE instead, and the boot
schedule (see runBootStep) warms them one per frame while the map is
already on screen and already interactive. Call these, never the builders —
that way it does not matter whether a server burst charts a sector before
the warm-up got to it, because the first caller pays and everyone after is
a map lookup.

## How much of the plate texture the TOP FACE is allowed to use

<a id="how-much-of-the-plate-texture-the-top-face-is-allowed-to-use"></a>

How much of the plate texture the TOP FACE is allowed to use.

At 1.0 the hexagon's own corners reach u = 0 and u = 1, so every texel of
the image belongs to the top face and the extruded side walls had nowhere
to sample but the top face's own UVs — which is precisely the bug that
smeared one stretched column of the embossed frame down each wall as a
blown-out white band. Shrinking the top face's UV footprint to 0.88 frees
a horizontal strip at each end of the image that no top-face fragment can
ever reach, and the rim band is painted there. The painted frame, tray and
rivets are all authored against the same constant, so nothing moves in
world space.

## THE SELECTION MARKER: four chamfered clamps bolted onto the tile

<a id="the-selection-marker-four-chamfered-clamps-bolted-onto-the-t"></a>

THE SELECTION MARKER: four chamfered clamps bolted onto the tile.

The previous marker was a thin glowing translucent outline with an additive
halo — the holographic look the art direction rejects — and its wash blew
the centre of the selected plate out, taking the grain, the rivets and the
legibility of the sector number with it. This is hardware: four short
beveled steel brackets straddling the tile's four diagonal edges, each with
a rivet at either end, built from the SAME unit corner array as the plate
so it cannot drift, overshoot a neighbour or hang across the gutter. The
two flat edges are deliberately left clear — that is where the register
ticks and the sector number live.

It is lit by the scene key like everything else on the table, so it reads
as installed rather than projected.

## One bracket: a mounting pad bedded onto the plate, a chamfered base

<a id="one-bracket-a-mounting-pad-bedded-onto-the-plate-a-chamfered"></a>

One bracket: a mounting pad bedded onto the plate, a chamfered base
slab, a narrower cap and a bolt at each end.

The pad matters. Without it the bracket terminated in mid-air on the
plate surface with nothing to say how it was attached, which is most of
why it read as moulded plastic dropped on the board rather than as
machined furniture bolted to it.

## THE TWO UPPER DIAGONAL EDGES ONLY

<a id="the-two-upper-diagonal-edges-only"></a>

THE TWO UPPER DIAGONAL EDGES ONLY.

There used to be four, ringing the tile, and they were the brightest
marks on it — brighter than the sector number, which is the one thing
on a plate that carries information. Worse, the lower pair collided
with the two other objects that live in that half of the tile: the
lower-left bracket overlapped the ID plaque (which spans x -0.56..0.24
at z 0.31..0.61) and the lower-right one sat under the fleet badge at
bearing 30 degrees. Three UI objects stacked in one corner.

Edges [0,1] and [2,3] are the two that face AWAY from the camera, so
the marker sits in the empty upper half of the plate and the whole
lower half is left to the plaque and the badge. Two brackets read as
deliberate; four read as decoration.

## AN EMPTY SOCKET, NOT A PLATE

<a id="an-empty-socket-not-a-plate"></a>

AN EMPTY SOCKET, NOT A PLATE.

The board's biggest readability failure was that an unexplored cell was a
fully-built instrument: identical rivets, identical frame emboss, identical
tray recess and dashed scribe as a surveyed sector, differing only by a
1.3:1 tonal step. Sixty percent of the viewport was detailed hardware the
player had to learn to ignore.

So the HARDWARE ITSELF is now the signal. A charted sector has a machined
plate installed in it; an unexplored one has the hexagonal hole the plate
would go into — a chamfered funnel down to a bare floor, with the sensor
haze glowing in the bottom of it and nothing else. Nothing is riveted,
nothing is stencilled, nothing is framed. Combined with FOG_DROP below,
the unknown region visibly falls away from the charted plane, which is the
depth cue the flat board never had.

## @param {number} variant which slice of the haze texture this cell samples

<a id="param-number-variant-which-slice-of-the-haze-texture-this-ce"></a>

@param {number} variant  which slice of the haze texture this cell samples.

The uv OFFSET AND ROTATION ARE BAKED PER CELL, which is the fix for the
unexplored field reading as one printed wallpaper. The uv used to be a
bare function of local tile-space x,z, so every cell in the galaxy sampled
exactly the same texel range and the same swirl appeared, pixel for pixel,
on every hex; the six material variants rotated the sample but 112 cells
over 6 patterns still puts identical neighbours in the same screenful.
Seven geometry variants against those six is 42 distinct cells, which is
more than are ever on screen at once.

## A low-frequency fbm evaluated on a coarse grid and bilinearly resampled

<a id="a-low-frequency-fbm-evaluated-on-a-coarse-grid-and-bilinearl"></a>

A low-frequency fbm evaluated on a coarse grid and bilinearly resampled.

At 1024x1024 a per-texel three-octave fbm is a million calls and about a
third of a second of startup; the layers it is wanted for here vary over
hundreds of texels, so sampling them at 96x96 and interpolating is
indistinguishable and roughly a hundred times cheaper. The HIGH frequency
layers are still evaluated per texel — that is the detail the resolution
was raised for.

## THE MACHINING HEIGHT FIELD, and where it belongs

<a id="the-machining-height-field-and-where-it-belongs"></a>

THE MACHINING HEIGHT FIELD, and where it belongs.

The old grain was `fbm2(x / 26, y / 3.2)` painted into the ALBEDO: an
8:1 stretch at a 26-texel period, which is the frequency and aspect of
WOODGRAIN, and putting it in the albedo meant the scratches only ever
darkened. Metal does the opposite — a machining pass is relief, so it
catches the key and GLINTS. This is a much finer, much tighter grain
(a ~3-texel period at 1024, i.e. genuine tool marks) and it is fed into
the normal map only; the albedo keeps just the broad blotchiness of
a plate that has been in service.

## THE RIM BAND GETS A FLAT NORMAL, deliberately

<a id="the-rim-band-gets-a-flat-normal-deliberately"></a>

THE RIM BAND GETS A FLAT NORMAL, deliberately.

The rim strip is the highest-contrast painting in the image — six
per-facet value steps, twelve bolt heads, ribs and wear — and a Sobel
over that produces normals that swing most of a hemisphere within a few
texels. Under a 220-exponent specular lobe, isolated texels hit
N.H ~ 1 and flash to full white: on screen that was a band of blue-white
glitter along every up-key chamfer, reading as frost rather than as
milled steel. The chamfer and the wall are already SEPARATE GEOMETRIC
FACETS with correct normals, so they need nothing from the map, and
flattening the band removes the aliasing at its source rather than
hiding it behind a softer lobe everywhere else.

## THE CHAMFER IS PAINTED SIX TIMES, ONCE PER EDGE, AT ITS OWN VALUE

<a id="the-chamfer-is-painted-six-times-once-per-edge-at-its-own-va"></a>

THE CHAMFER IS PAINTED SIX TIMES, ONCE PER EDGE, AT ITS OWN VALUE.

The measured failure was that the rim strip and the top face came back
at the same luminance (0.23 vs 0.22), so the "chunky beveled" edge was
carried by nothing but an aliased hairline. A chamfer is a facet: the
one tilted toward the key is brighter than the face it borders and the
one tilted away is darker, and that PAIR of value steps is what the eye
reads as an edge at thumbnail size. +/-40% about the base, exactly as
the direction called for.

## EXPOSURE FIRST, THEN CONTENT

<a id="exposure-first-then-content"></a>

EXPOSURE FIRST, THEN CONTENT.

The chamfer base was 132 with k running to 1.40 — 185 before the
status tint, the 2.4-intensity key and ACES all multiply through it.
Measured on the shipped frame, the skirts of sectors 10, 11 and 23
came back at 199, 215 and 244 luma: on three tiles the untextured side
wall was the brightest surface in the picture after the star, which is
the grey-box read exactly. 96 with k capped at 1.25 puts the same
facet under 200 with the tint still legible on it.

## A STENCILLED PART CODE, on one facet only

<a id="a-stencilled-part-code-on-one-facet-only"></a>

A STENCILLED PART CODE, on one facet only.

The rim strip is 256 texels of u per edge at this resolution and it
carried nothing but gradients, so at any real zoom the sides of every
plate were feature-free bands. Three characters on ONE of the six
edges is what a machined component actually carries, and putting it on
a single facet keeps it from becoming a repeating pattern around the
tile. Sprayed dark into the metal, not printed light onto it: this
band already had an exposure problem and must not get another.

## A GRAIN AND WEAR MULTIPLY OVER THE WHOLE STRIP

<a id="a-grain-and-wear-multiply-over-the-whole-strip"></a>

A GRAIN AND WEAR MULTIPLY OVER THE WHOLE STRIP.

Everything above is gradients, rules and discs — clean vector work,
and clean vector work is exactly what reads as a primitive when it
fills a band. This modulates the finished strip by a fine machining
noise plus a broad soiling term, so no two texels along the skirt are
at the same value and the band has a surface. It runs on the band rows
only, which is about a tenth of the image.

The rim band is given a FLAT normal further down (see buildPlateMaps),
so this is pure albedo and cannot feed the specular sparkle that
flattening was introduced to kill.

## A SECOND, NON-HUE CHANNEL FOR THE HAZARD READ

<a id="a-second-non-hue-channel-for-the-hazard-read"></a>

A SECOND, NON-HUE CHANNEL FOR THE HAZARD READ.

Measured, the belt plate and a plain steel plate came back at
L=59.4 and L=61.1 — a 1.03:1 step, with hue as the only thing
separating "this destroys fleets until you own it" from "this is
empty space". That fails on an uncalibrated panel and it fails
outright for a red-green deficient player, on the single most
gameplay-critical distinction the board draws.

So the hazard classes get a stencilled diagonal HATCH at +/-25%
value — the same hatch the HUD map key already advertises for
"asteroid/star hazard" — painted into the plate albedo. It reads
in a greyscale screenshot, it reads at thumbnail size, and it is
the pattern the key trained the player to look for. Paired with
the ~20% overall darkening applied in tileMaterial, a hazard tile
is now the darkest AND the only patterned charted class.

## DASH PITCH 32, NOT 16 — AND SEE THE REPEAT AT THE CALL SITE

<a id="dash-pitch-32-not-16-and-see-the-repeat-at-the-call-site"></a>

DASH PITCH 32, NOT 16 — AND SEE THE REPEAT AT THE CALL SITE.

A 16px pitch on a 128px texture, repeated two or three times along a
crossing that is only ~160 screen pixels long, put roughly 300 texels
of dash into 160 pixels. That is a 1.9x MINIFICATION: the dashes fell
below Nyquist and the mip chain resolved them into exactly what the
review saw — one solid bar of constant width and constant opacity. A
dashed line has to be authored for the size it is drawn at, not for
the size of its own texture.

## The dome carries LOW FREQUENCY ONLY. NOTHING PER-TEXEL. EVER

<a id="the-dome-carries-low-frequency-only-nothing-per-texel-ever"></a>

The dome carries LOW FREQUENCY ONLY. NOTHING PER-TEXEL. EVER.

A 1024-wide equirect map wrapped on a sphere and viewed through a 50-degree
lens is magnified about eight times, so anything with an edge in it turns
into a blurred blob the size of a hex — which is exactly what the first
version of this looked like. Everything that needs to be crisp (the stars)
lives in the point layers instead, and the dome does what a distant nebula
actually does: a large, soft, dim variation in colour and brightness.

WHY THE FINE LAYERS ARE GONE, AND WHY NOTHING MAY PUT THEM BACK.

A previous pass added three per-texel terms here — a "starlight grain" at a
3.4-texel period, a filament noise at 7, and a +/-1.5 level triangular
dither at 1 — all in the name of texture and anti-banding. Measured on the
shipped frame, the visible window is about a sixth of the map's u range
across 1920px: ONE TEXEL IS FIFTEEN SCREEN PIXELS. Every one of those terms
therefore came back as a 15px bilinear diamond lattice over the entire sky,
measurable at residual autocorrelation +0.73 at lag 15 and -0.82 at lag 7.
A screen door, in other words, and the most-noticed defect in the frame.

The rule this leaves behind: the sky texture may contain nothing whose
period is under about six texels (~90px on screen). Anything finer than
that is not detail, it is a grid. Screen-space grain and dithering belong
in the composer (see buildComposer), where they are 1:1 with pixels.

## PAINTED IN SLICES, BECAUSE IT IS HALF A MILLION TEXELS OF ARITHMETIC

<a id="painted-in-slices-because-it-is-half-a-million-texels-of-ari"></a>

PAINTED IN SLICES, BECAUSE IT IS HALF A MILLION TEXELS OF ARITHMETIC.

Built in one call this measured 1021 ms — a full second of dead page,
spent on a gradient behind the board that nobody is waiting for, on a
machine that holds 60 fps either side of it. It is the largest single
main-thread block left in the startup after the worlds moved to their own
thread, and unlike the worlds it cannot go to a worker: it is drawn with
canvas gradients whose dithering has to be band-limited afterwards, and
that pipeline lives here.

What it CAN do is stop. The work is a prologue (nebula masses, then the
blur that band-limits them) followed by a per-texel pass over 512 rows, and
every one of those pieces is independent. beginSkyTexture() hands back a
job that does one piece per call; the boot schedule turns the crank once a
frame. Same image, same texel-for-texel result — it just no longer arrives
all in one breath.

## THE GRADIENTS ARE BAND-LIMITED BEFORE THEY ARE MAGNIFIED

<a id="the-gradients-are-band-limited-before-they-are-magnified"></a>

THE GRADIENTS ARE BAND-LIMITED BEFORE THEY ARE MAGNIFIED.

This is the actual source of the screen-door lattice that made the
frame unshippable, and it took bisecting the scene to find: with the
dome removed the sky's residual autocorrelation collapsed from +0.74
at lag 15 to nothing, and with the dome's own per-texel noise already
deleted the only thing left in it was these canvas gradients.

Skia DITHERS gradient fills. It has to — a 300px radial ramp at alpha
0.15 would band otherwise — and it does it with a small ordered matrix
at the canvas's own pixel pitch. That is invisible at 1:1 and it is a
regular 15px checkerboard once the canvas is wrapped on a dome and
magnified seven and a half times, which is what a 1024x512 equirect
through a 50-degree lens is. No filter setting removes it: LINEAR
magnification of a 2-texel pattern IS the diamond lattice.

A five-tap separable box blur takes everything with a period under
about five texels — the dither included — to zero, and leaves the
masses themselves (radii of 260 to 340 texels) untouched. It wraps in
u because the dome does.

THE RULE: any canvas gradient that ends up magnified more than ~2x
has to be band-limited on the way out. Authoring "no noise" is not
enough; the rasteriser adds its own.

## A tiny studio probe for the metal

<a id="a-tiny-studio-probe-for-the-metal"></a>

A tiny studio probe for the metal.

The plates are a metal-dominant MeshStandardMaterial, and metal with no
environment to reflect renders BLACK — which is most of why the first pass
had a board of flat dark polygons. This is a 256x128 equirect with a warm
key lobe where the directional key is, a cool fill opposite it, and a
horizon gradient; run through PMREM it gives the chamfers something to
catch, which is the whole "beveled riveted metal" read.

## The near dust the board floats in: a world-space sheet under the tiles that

<a id="the-near-dust-the-board-floats-in-a-world-space-sheet-under-"></a>

The near dust the board floats in: a world-space sheet under the tiles that
parallaxes when the board is panned, and — because it covers the whole
frame rather than only the sky above the horizon — it is what actually
carries mid-tone into the negative space around the cluster.

It contributed nothing before because of an arithmetic bug rather than a
choice: the RGB was multiplied by the density AND the alpha was set from
the same density, so an additive draw landed at density-SQUARED and a
typical texel arrived at about two levels out of 255. Colour is colour;
density belongs in alpha, once.

## The brightest few dozen stars, with a DIFFRACTION CROSS

<a id="the-brightest-few-dozen-stars-with-a-diffraction-cross"></a>

The brightest few dozen stars, with a DIFFRACTION CROSS.

Every star being the same size and the same white is the loudest
"procedural" tell a starfield has. A real field is heavily heavy-tailed:
a handful of stars are bright enough that the instrument itself shows —
four spikes from the spider vanes — and those anchor points are what make
the rest read as a distribution rather than a scatter.

## THE SKY MUST CARRY ITS OWN DITHER

<a id="the-sky-must-carry-its-own-dither"></a>

THE SKY MUST CARRY ITS OWN DITHER.

It is a very smooth gradient over a very small value range,
which is textbook 8-bit contouring, and the only thing that was
breaking it up lived in the FXAA pass at the end of the post
chain. The post chain is now something a machine has to earn:
a CPU rasteriser never gets it at all, and even a fast GPU
renders the first half-second without it. Banding is not an
acceptable thing to hand those frames.

Two lines of shader arithmetic on a surface that is already
being rasterised, so it costs nothing anyone can measure, and
the FXAA dither on top of it is a fraction of a level either
way — well under what the quantiser it is correcting can show.

## 0.44, NOT 0.66 — AND THE SPAR BELOW

<a id="0-44-not-0-66-and-the-spar-below"></a>

0.44, NOT 0.66 — AND THE SPAR BELOW.

At 0.66 with a radius up to 0.50 the sphere projected clear of its own
tile at this camera: sector 9's world hung over the unexplored hex
above it and sector 25's crossed onto the tile beyond while its own
plaque sat at the bottom of the plate, so body and label were not
staged as one object. A world overlapping a neutral tile is also an
ownership lie — the eye reads the sphere as belonging to whatever it
overlaps. The lift is now small enough that the widest body (0.50) at
this pitch stays inside the hex's own silhouette.

## NO MOUNTING SPAR, DELIBERATELY

<a id="no-mounting-spar-deliberately"></a>

NO MOUNTING SPAR, DELIBERATELY.

One was tried here — a short tapered post from the deck to the
underside of the sphere, to say the body BELONGS to the plate rather
than merely hovering near it. At this lift it is geometry that cannot
be seen: a class-5 world's underside sits at y = 0.10 against a deck
at 0.07, so the post is three hundredths of a unit tall and entirely
swallowed by the body above it; the homeworld's underside is below the
deck outright. What actually grounds the worlds is the pair of things
around this line — the lift itself, which now puts every body's lower
limb into the plate, and the contact shadow below, tightened and
darkened to match. Invisible geometry is not a fix, it is weight.

## A CONTACT SHADOW, PROJECTED ALONG THE KEY

<a id="a-contact-shadow-projected-along-the-key"></a>

A CONTACT SHADOW, PROJECTED ALONG THE KEY.

The worlds had none: what sat under them was a symmetrical additive
glow pool, so a body on a strongly key-lit deck threw no directional
shadow at all and read as a sticker layered on the tile. This is the
body's own shadow, offset along the projected direction of the
DirectionalLight and squashed by its elevation — an ellipse trailing
away from the light, exactly as the belt's anchor rocks now cast.

## An asteroid belt, not a decorative ring of grey lumps

<a id="an-asteroid-belt-not-a-decorative-ring-of-grey-lumps"></a>

An asteroid belt, not a decorative ring of grey lumps.

Three things were wrong with the old one and all three are fixed here:
the rocks were dodecahedra (six flat facets, hexagonal silhouette), they
were untextured, and they were spaced at exactly 2*pi/11 which reads as a
clock face. These are subdivided, noise-displaced hulls with cratered
albedo and derived normals, scattered by a clustered belt model, drawn as
three InstancedMeshes so a field of eighteen rocks costs three draw calls.

## How far the plate's own surface extends along a bearing

<a id="how-far-the-plate-s-own-surface-extends-along-a-bearing"></a>

How far the plate's own surface extends along a bearing.

A belt was clamped to a CIRCLE of 0.76 while the plate is a HEXAGON whose
inradius is 0.814 and whose tray stops short of that — so along the six
flat edges the rocks were outside the tile, hanging over black space, and
"which cell is the hazard" stopped being answerable. For a flat-top hex the
boundary along theta is the inradius over the cosine of the angle to the
nearest edge normal (normals sit every 60 degrees starting at 30).

## The inner corona, as a limb-hugging RING rather than a disc

<a id="the-inner-corona-as-a-limb-hugging-ring-rather-than-a-disc"></a>

The inner corona, as a limb-hugging RING rather than a disc.

This is the thing that stops a star having the hardest edge in the frame.
A photosphere sphere ends at its silhouette in one pixel no matter how it
is shaded; the only way the transition becomes gradual is if there is
light OUTSIDE the disc, brightest exactly at the limb and falling away
over a couple of radii. Peaks at 1/3 of the sprite's half-width, which is
where the disc's edge is placed.

## A FILAMENT HAS A ROOT AND A TIP. IT IS NOT A STROKED ARC

<a id="a-filament-has-a-root-and-a-tip-it-is-not-a-stroked-arc"></a>

A FILAMENT HAS A ROOT AND A TIP. IT IS NOT A STROKED ARC.

These were three ctx.arc strokes at constant lineWidth, which is
geometrically a circle of uniform thickness — and that is exactly
what they read as in the shipped frame: thin concentric rings
around the disc at four and eight o'clock, indistinguishable from
a debug overlay or a lens artefact. A prominence is thick and
bright where it leaves the photosphere and dissipates over the
apex, and it wanders. Each loop is therefore built as a FILLED
ribbon sampled along the arc, with a width that is fat at both
feet and pinched over the top, and a radius that wobbles.

## THE EXPOSURE IS SPLIT, which is the whole rework

<a id="the-exposure-is-split-which-is-the-whole-rework"></a>

THE EXPOSURE IS SPLIT, which is the whole rework.

At intensity 2.2 the photosphere clipped to near-white across ~80% of
the disc: the granulation the material computes was still being
computed and was simply invisible, so the brightest, highest-attention
pixel cluster in the frame carried the LEAST information — a flat
white circle with a crisp, stair-stepped edge. A star must have the
softest edge in the frame and this one had the hardest.

So the shell is authored at 1.3, where ACES still resolves the
granulation and the limb-darkening law, and the blow-out is moved to a
separate core sprite covering only the inner third of the disc. The
bloom pass then blooms a SHAPE — a bright nucleus inside a structured
disc — instead of smearing a flat clipped plate. The silhouette is
dissolved by the limb halo below, so there is no geometric edge left
for the rasteriser to alias.

## THE BODY AND ITS LIGHT HAVE TO LAND IN THE SAME PLACE

<a id="the-body-and-its-light-have-to-land-in-the-same-place"></a>

THE BODY AND ITS LIGHT HAVE TO LAND IN THE SAME PLACE.

It was 0.94, which at the rig's 61-degree pitch threw the photosphere
nearly half a tile UP-SCREEN of the deck it is supposed to be sitting
on: the star hung over the corner of sector 23 and spilled onto its
neighbour, while the sunburst decal painted into the plate and the
additive pool both converged on the plate CENTRE. Two unrelated
objects, a full star-radius apart.

The height that produced it is vestigial. The comment justifying it
cited glare sprites being sliced by neighbouring plate rims — and the
fix for that was depthTest:false on the glare layers, which is right
here and does the job on its own. 0.50 keeps the sphere entirely clear
of the deck (bottom of the disc at 0.17 against a plate top of 0.07)
while cutting the screen-space displacement by more than half, and
what is left is cancelled by offsetting the pool below.

## The star lights its own plate — the one place a tile gets a colour it

<a id="the-star-lights-its-own-plate-the-one-place-a-tile-gets-a-co"></a>

The star lights its own plate — the one place a tile gets a colour it
did not choose, and it is diegetic: it is the sun. Wide and weak, so
the plate gets a FALLOFF away from the body rather than a flat lift.

IT IS OFFSET, AND IT IS CLIPPED TO THE TILE.

The pool sat at the tile's own centre while the body sat 0.87 units
above it, and at this camera those are not the same place on screen —
so the light pooled where the star was NOT. It is now pushed along the
view ray by exactly the amount the body is displaced, which lands it
directly under the photosphere. And it was scaled to 1.3 of the tile,
i.e. spilling onto sector 9; at 0.68, plus the offset, the whole decal
is inside its own hexagon by construction (0.55 + 0.23 < the 0.81
inradius), so a star can no longer light a sector it is not in.

## THE CLOUD SHELL IS NOT AN LOD CASUALTY. IT IS THE READ

<a id="the-cloud-shell-is-not-an-lod-casualty-it-is-the-read"></a>

THE CLOUD SHELL IS NOT AN LOD CASUALTY. IT IS THE READ.

It used to switch off below SHELL_DETAIL_PX on the reasoning that
"clouds are weather nobody can resolve at map zoom" — and what that
left was a bare surface at seventy pixels with no broad light/dark
structure at all: sectors 24 and 25 came back as out-of-focus orange
mush and sector 9 as a green-teal blur. The cloud band is the single
highest-contrast BROAD-SCALE feature a world has, and broad-scale
value contrast is exactly what makes a small sphere read as a sphere.
Removing it did not save detail, it removed the subject.

It stays on at every zoom and on every renderer that can afford it. The
measurement that originally justified dropping it was taken when a
dozen worlds were spinning their atmosphere shells as well; a handful
of explored tiles carrying one extra 70px sphere each is not where a
healthy frame's budget goes.

ZOOM IS STILL NOT ALLOWED TO TAKE IT — that was the bug. What can take
it is the detail governor, at its LAST rung, on a machine that has
failed three measurement windows in a row; there it is a second shaded
sphere per world and the frame is already lost. That is a different
question from "is it small on screen", and it is answered by a clock
rather than by a zoom level.

## The sky dome, nebula sheets and dust, in FOUR steps rather than one

<a id="the-sky-dome-nebula-sheets-and-dust-in-four-steps-rather-tha"></a>

The sky dome, nebula sheets and dust, in FOUR steps rather than one.

As a single step this measured 720 ms — a two-thirds-of-a-second freeze
on a machine holding 60 fps either side of it, spent painting a
gradient nobody is waiting for. It decomposes for free, because every
expensive part of it is a cached texture behind an accessor: warm them
one to a frame and the assembly at the end is geometry only.

Pure atmosphere either way; the board is legible before any of it
exists, which is why it is behind the plates.

## Reflection probe for the plates, the belt rocks and the fleet hulls

<a id="reflection-probe-for-the-plates-the-belt-rocks-and-the-fleet"></a>

Reflection probe for the plates, the belt rocks and the fleet hulls.

PREFILTERED HERE, NOT INSIDE A DRAW CALL. Assigning the raw equirect to
scene.environment is the tidy one-liner, and it defers the whole PMREM
pipeline — six cube faces, a mip chain, and the shaders to build them —
into the first frame that draws anything reflective. Attributed by
noteCost(), that frame measured 1079 ms: the largest single block left
in the startup, and one the player was holding.

Two steps: compile the conversion shaders, then run the filter. Both
are things PMREMGenerator will do anyway; the only change is that they
happen where the schedule can see them.

## A bake that never answers must not strand its sector as a stand-in for

<a id="a-bake-that-never-answers-must-not-strand-its-sector-as-a-st"></a>

A bake that never answers must not strand its sector as a stand-in for
ever. Deliberately generous, and measured from the worker's own "starting
now" rather than from dispatch: the fallback is a multi-second block on the
thread the player is holding, so taking it early — because a queue was
deep, or a module import was slow — costs far more than waiting did. A run
with a 12-second deadline measured exactly that mistake: the timeout fired
on a bake the worker was still doing and dropped a 6.2-second freeze on the
player at seventeen seconds in.

## Spin the threads up, AFTER the first frame

<a id="spin-the-threads-up-after-the-first-frame"></a>

Spin the threads up, AFTER the first frame.

Not before it, and this is measured rather than tidy-minded: each worker
fetches and compiles three.js and the generator, and doing that while the
main document is fetching and compiling the same two files pushed
DOMContentLoaded from 986 ms to 3149 ms and the first frame from 1094 ms to
3335 ms. Time-to-first-frame is the one number this module has genuinely
earned; a background thread must not be paid for out of it.

A frame later, the page has painted, the sectors are still arriving from
the server, and the threads have all the lead time they need.

## NOT AVAILABLE YET — IT STILL HAS TO REACH THE GPU

<a id="not-available-yet-it-still-has-to-reach-the-gpu"></a>

NOT AVAILABLE YET — IT STILL HAS TO REACH THE GPU.

A class arrives as five 1024x512 maps, and three.js uploads a
texture lazily, inside the first draw call that samples it. So
the frame that shows the first world of a class was paying ten
megabytes of upload plus mipmap generation plus the shader
compile, all at once: attributed by noteCost(), that frame
measured 1088 ms and then 771 ms, the largest blocks left in
the whole startup once the generation itself had moved off this
thread.

So the bundle is held here, its textures are pushed to the GPU
one per frame, and only then does it become something the
content queue can build from. It costs the class about five
frames of being a survey proxy — which is a state the board
already reads correctly — and it buys a frame that does not
stop.

## ...AND THE SHADER IS LINKED BEFORE THE FIRST WORLD IS DRAWN WITH IT

<a id="and-the-shader-is-linked-before-the-first-world-is-drawn-wit"></a>

...AND THE SHADER IS LINKED BEFORE THE FIRST WORLD IS DRAWN WITH IT.

The last block left in the startup was not generation and not upload: it
was the driver translating and linking the surface shader, inside the draw
call of the frame that first showed a world of that class. Attributed by
noteCost() at 1088 ms and 771 ms — the two largest frames in the whole
sequence, on a machine holding a locked sixty on either side of them.

KHR_parallel_shader_compile lets the driver do that work on its own
threads, and three.js's compileAsync drives it — but only if somebody
WAITS for it. Compiling and then drawing on the very next frame just
blocks on the link instead of the compile. So the class is held in staging
for as long as the link takes: one throwaway world in a scratch scene,
compiled against the real scene's lighting so the program cache key
matches, and the class becomes available when the promise settles.

The probe's materials are deliberately NOT disposed. three.js reference-
counts programs and releases them on material.dispose(), so throwing the
probe away would throw away the very thing it was built to obtain. Six
unused material objects for the life of the page is not a cost worth
naming.

Every failure path ends in "use it now and let the first draw compile it",
which is the behaviour this replaces — including a promise that never
settles, which is what the deadline is for.

## THE BUDGET IS NOW ENFORCEABLE, WHICH IT PREVIOUSLY WAS NOT

<a id="the-budget-is-now-enforceable-which-it-previously-was-not"></a>

THE BUDGET IS NOW ENFORCEABLE, WHICH IT PREVIOUSLY WAS NOT.

The old drain was a do...while that processed one item BEFORE it looked at
the clock — and one item is a world generation, which the profile puts at
about a second on a slow machine. So a 12 ms "budget" produced measured rAF
callbacks of 642, 1186, 3224 ms: the 800 ms block the amortisation was
written to remove had simply moved into the frame loop and got four times
worse. The player watched their cursor stop dead, repeatedly, during their
first ten seconds in the game.

Two changes make it real:

  1. Nothing is STARTED unless the running estimate of what one item costs
     says it fits in what is left of the budget. The estimate is measured
     per machine, biased upward (a bad guess costs the player a frame; a
     cautious one costs a world one extra frame of being a proxy).
  2. A machine where a single world costs more than the whole budget builds
     exactly ONE per frame, never six. It still finishes, and the page
     answers the player in between.

The other half of this is that no tile is ever empty while it waits — see
installSurveyProxy(). The queue is a rendering detail, not a hole in the
board.

## ...AND ANYTHING THAT STILL CANNOT FIT WAITS FOR THE HAND TO FINISH

<a id="and-anything-that-still-cannot-fit-waits-for-the-hand-to-fin"></a>

...AND ANYTHING THAT STILL CANNOT FIT WAITS FOR THE HAND TO FINISH.

With the forge doing the generating (see above) almost nothing reaching
this queue is over budget any more — an assembly is a millisecond. What
remains over budget is the fallback: a browser with no worker, a class the
forge could not bake, the theater's shared belt and star bakes. Those are
still seconds, and no pacing makes a second pleasant; all pacing can do is
choose WHEN.

The previous revision chose badly, and the audit caught it exactly. It
waited for 260 ms of stillness but released unconditionally after 1600 ms,
so a player who kept their hand moving — which is what a player does with a
new map — got the whole over-budget item dropped on them every 1.6 seconds,
always mid-gesture. The guard meant to keep stalls out of gestures turned
one stall into a metronome of them.

The gate is now on the GESTURE, not on a clock:
  - while the pointer is DOWN, nothing heavy runs. Ever. A drag is never
    interrupted, however long the player holds it.
  - a wheel or a drag that just ended buys a short settle, so the stall does
    not land on the release either.
  - a hovering pointer is not a gesture. It delays heavy work to the next
    natural pause between moves, and no longer.
There is no starvation ceiling because there no longer needs to be one:
releasing the pointer IS the release, and the board says what it is waiting
for while it waits.

## What it would cost to finish this tile right now

<a id="what-it-would-cost-to-finish-this-tile-right-now"></a>

What it would cost to finish this tile right now.

  'cheap'    its class has been forged: three materials and three meshes,
             about a millisecond. Goes through whatever the player is doing.
  'waiting'  its class is being baked on the other thread. NOT built here,
             at any price — building it locally would spend the second the
             forge exists to avoid, and the tile already reads as a survey
             in progress.
  'local'    nothing else can do it: a belt, a star, a black hole, or a
             class the forge could not manage. Seconds. Waits for a hand
             that is not in the middle of a gesture.

## COMPILE THE NEW SHADERS BEFORE THE FRAME THAT NEEDS THEM

<a id="compile-the-new-shaders-before-the-frame-that-needs-them"></a>

COMPILE THE NEW SHADERS BEFORE THE FRAME THAT NEEDS THEM.

With the generation moved off the main thread, the largest blocks left in
the startup were not generation at all — they were inside render(), and
attributing them (see noteCost) put them at 1088 ms and 771 ms, each landing
on the first frame that drew a world of a class the driver had not seen. An
ANGLE backend translates and links a shader the size of the planet surface
synchronously, inside the draw call, and the player is holding that frame.

three.js's compileAsync submits the same work through
KHR_parallel_shader_compile where the driver has it, so the link happens on
the driver's own threads and the frame that follows finds the program
ready. Where the extension is missing it is no worse than what happens
anyway, only earlier and once. Guarded on every side: an older three, a
renderer that throws, no scene — all fall back to compiling on first use.

## NEAREST TO WHAT THE PLAYER IS LOOKING AT, NOT FIRST IN

<a id="nearest-to-what-the-player-is-looking-at-not-first-in"></a>

NEAREST TO WHAT THE PLAYER IS LOOKING AT, NOT FIRST IN.

The queue used to be strictly FIFO, which is arrival order from the
server — so on a machine where each world costs a second, the tile at the
centre of the player's screen could be the last one built. The player's own
homeworld is where the camera opens and where they look first; it should be
the first thing that stops being a stand-in.

A linear scan over a queue that is at most the board size, once per item
built, against an item that costs milliseconds at best. It is free.

## THE TILE IS NEVER A HOLE

<a id="the-tile-is-never-a-hole"></a>

THE TILE IS NEVER A HOLE.

A charted sector used to carry its plate, its number and its fleet badge
the instant the server named it, and then nothing else for as long as its
queue slot took to come up — captured at ten seconds, a player's own
homeworld was a gold plate with no planet on it, which is indistinguishable
from an empty sector. The board read as broken rather than as loading.

So a charted tile gets a stand-in immediately: the shared sphere, a flat
material in the class's own hue, and the survey ring below it. Both are
shared objects, so the whole thing is two Mesh allocations and no
generation at all. It reads as "there is a body here and the survey is
still coming in", which is exactly what is true, and rebuildContent()
replaces it with the generated world without the tile ever being empty.

It is NOT a permanent low-detail mode: nothing keeps a proxy once its real
content exists, and the proxy carries no gameplay claim the real object
does not (same class hue, same size ramp, same lift).

## Shared per (status, live, hover). 112 tiles used to mean 112 unique

<a id="shared-per-status-live-hover-112-tiles-used-to-mean-112-uniq"></a>

Shared per (status, live, hover). 112 tiles used to mean 112 unique
materials; there are at most about thirty distinct looks on the board and
sharing them keeps uniform churn down.

PHONG, NOT STANDARD, and that is a measured decision rather than a
stylistic one. The plates cover essentially the whole viewport at every
zoom, so they are the largest fill cost in the scene by a wide margin, and
a metal-dominant MeshStandardMaterial pays a full GGX evaluation plus a
prefiltered-environment lookup on every one of those fragments. Blinn-Phong
with a normal map, a tight specular and one flat environment sample gives
the same chamfer highlight — the whole point of the bevel — for a fraction
of the per-pixel cost. It is also, not coincidentally, the exact lighting
model the era this board is styled after actually used.

## THE SPECULAR MODEL IS WHAT MAKES THIS METAL OR WOOD

<a id="the-specular-model-is-what-makes-this-metal-or-wood"></a>

THE SPECULAR MODEL IS WHAT MAKES THIS METAL OR WOOD.

A Blinn-Phong exponent of 34 is a BROAD lobe: the highlight spreads
over most of a facet as a soft diffuse wash. That is the response of
varnish, and paired with a stretched low-frequency albedo grain it is
exactly why the board was read as stained pine and sanded birch.
Steel has a TIGHT lobe — 220 collapses the highlight onto the chamfer
and the rivet crowns, which is precisely where a bevel needs to be
sold, and leaves the flat of the plate to the albedo.

And a reflected term, which the previous revision removed on the
grounds that it desaturated the status tint. It does — at MIX weight.
ADD weight does not: an additive reflection only lifts where the
probe is bright, so the chamfer facing the key picks up the warm
lobe and the tint elsewhere is untouched. Metal without a reflected
term cannot read as metal, and this is a small enough share of the
plate's value that the swatch is still the swatch.

## Fog plates, in SIX variants

<a id="fog-plates-in-six-variants"></a>

Fog plates, in SIX variants.

One shared material meant one shared uv transform, so all hundred-odd
unexplored tiles showed the identical haze pattern and neighbours matched
edge to edge — the unknown region read as one blotchy blanket instead of a
hundred separate unknown cells. Each variant clones the haze texture (the
image is uploaded once; only the transform differs) and gets its own
offset and rotation. The variant index is chosen so that both the
horizontal neighbour (id +/- 1) and the vertical one (id +/- width) always
land on a different pattern.

## THE UNEXPLORED FIELD HAS TO RECEDE

<a id="the-unexplored-field-has-to-recede"></a>

THE UNEXPLORED FIELD HAS TO RECEDE.

It is the single largest surface in the frame and it was lit flat: a
cell at the top of the picture measured the same value as one at the
bottom, so half the viewport was wallpaper and the charted cluster had
nothing to be the subject OF. The scene's FogExp2 cannot do this job
here — its colour (0x0c1424) is within a couple of levels of the fog
cell's own albedo, so mixing toward it is very nearly a no-op.

This is a straight view-depth falloff on the fog cell and NOTHING
else: the plates keep the atmospheric perspective they already have,
and no other material in the scene is touched. The range is driven off
the camera's own distance every frame so it survives the zoom wheel
instead of switching off at the closeup framing.

## IT MAY NOT BE EATEN BY THE THING IT ANNOTATES

<a id="it-may-not-be-eaten-by-the-thing-it-annotates"></a>

IT MAY NOT BE EATEN BY THE THING IT ANNOTATES.

A Sprite depth-tests at its CENTRE, so a tab that overlaps the
world's screen disc is either wholly in front of it or wholly
behind it — and with the worlds now seated lower and wider on
their plates, the near-right corner where this sits is inside
that disc for every colonised tile. It came back half a tab
with the count hidden behind a planet.

"Is there a fleet in this sector" is a first-class strategy
read and this is an annotation on a tile, not an object in the
scene, so it composites over. The ID plaque keeps depth
testing because it is a decal lying ON the deck and a rock
standing in front of it genuinely should occlude it; a bolted
tab standing above the deck is a different thing.

## BIG ENOUGH TO BE A READ, NOT A DECORATION

<a id="big-enough-to-be-a-read-not-a-decoration"></a>

BIG ENOUGH TO BE A READ, NOT A DECORATION.

It shipped at 0.40 x 0.165, which is about 40 x 16 screen pixels
at the map framing — small enough that all the emboss, bolt and
stencil work painted into the texture above degenerated into one
flat grey chip, and small enough that "is there a fleet in this
sector" could not be answered without zooming. This is the same
artwork at 1.6x, landing near 26px tall, which is where the tab's
own bevel starts to resolve. The aspect matches the 256x112 canvas
so nothing is stretched.

The anchor keeps the OUTER edge where it was — on the plate's
near-right flat, inside the tile's own hexagon by construction —
so the tab grows inboard. It has to stay clear of the world's
silhouette as well as the rim: a Sprite depth-tests at its centre,
so the centre is placed outside the largest body's sphere (0.50)
and on the camera side of it, and the whole tab then composites in
front of the globe instead of being sliced by it.

## THE SECTOR CODE, AS AN INSTALLED NAMEPLATE

<a id="the-sector-code-as-an-installed-nameplate"></a>

THE SECTOR CODE, AS AN INSTALLED NAMEPLATE.

It used to be a camera-facing Sprite with depthTest OFF and a 6px outline:
guaranteed legible, by the cheapest possible means, and with two visible
costs. It floated above a tilted board instead of lying on it, which is
the opposite of "stencilled codes, framed instruments"; and with depth
testing disabled the '11' punched straight through an asteroid that was
plainly in front of it — a depth-sorting error the player can see.

This is a perspective-correct decal lying on the plate: a recessed
nameplate with an emboss lip at the tile's lower edge, with the code
stencilled into it. The camera looks down at ~61 degrees, so a horizontal
plane is foreshortened by only 12% — the glyphs stay as readable as they
were, but they now belong to the tile.

The tray is deliberately SEMI-TRANSPARENT so the plate's status tint still
reads through it, which is why the polarity flip below is still needed and
still measured off the finished plate.

## Concatenate non-indexed geometries into one buffer: one draw, one object

<a id="concatenate-non-indexed-geometries-into-one-buffer-one-draw-"></a>

Concatenate non-indexed geometries into one buffer: one draw, one object.

Built from three.js primitives rather than hand-wound triangles, and
deliberately so — a hand-built beveled slab whose top face came out wound
clockwise was silently back-face culled and the selection marker rendered
as four bent wires with a bead on each end. Primitives arrive with correct
outward normals and consistent winding; merging preserves both.

## A HULL WITH A SILHOUETTE: a long fuselage flanked by two offset nacelles

<a id="a-hull-with-a-silhouette-a-long-fuselage-flanked-by-two-offs"></a>

A HULL WITH A SILHOUETTE: a long fuselage flanked by two offset nacelles,
nose along +Z.

One squashed six-sided cone has no outline to read at map zoom — at eight
or ten pixels it is a smear, and with an engine plume authored at twice its
size it disappeared into its own glare entirely. Three separated masses
give the eye a shape to resolve at exactly that size: a spine with two
things sticking out behind it is a SHIP, in a way that a triangle is not.

## UV LAYOUT FOR THE HULL

<a id="uv-layout-for-the-hull"></a>

UV LAYOUT FOR THE HULL.

The cylinders get their natural wrap (u around the hull, v along it) so a
longitudinal panel seam is a vertical line in the image and a frame band
is a horizontal one. After `rotateX(PI/2)` a cylinder's cross-section sits
in world XY with theta=0 pointing at -Y, so u=0 (and u=1) is the VENTRAL
keel and u=0.5 is the DORSAL spine. That is what lets a single 1-D ramp
along u carry "dark belly, bright back" and "matte flanks, polished spine".

The boxes (wings, fin, greebles) would otherwise stretch the whole image —
including the hull code — across each 8-pixel face, so their UVs are
remapped into PLAIN_UV: a small patch of anonymous panelling.

## THE PLUME IS AN IMAGE, NOT A SOLID

<a id="the-plume-is-an-image-not-a-solid"></a>

THE PLUME IS AN IMAGE, NOT A SOLID.

It used to be a CylinderGeometry drawn additively at a fixed opacity, and
a solid rendered at a fixed opacity has one unavoidable property: THE
GEOMETRY EDGE IS THE VISUAL EDGE. What crossed the board was a hard-edged,
uniformly-filled triangle with a dead-straight silhouette, a hard cut at
the tail, wider than the hull it was bolted to and half again its length —
a vector arrowhead sliding over a diagram. No amount of tuning the opacity
fixes that, because the failure is the shape of the primitive.

This is three quads through the plume's own axis at 60-degree intervals,
carrying a painted plume in their alpha. The falloff — radial to nothing
at the edge, axial to nothing at the tail, and a hot throat that cools
along its length — is in the texture, so the plume HAS NO SILHOUETTE OF
ITS OWN: it ends where the alpha ends. The crossed planes are what give it
a body from any bearing, and their overlap in the middle is what makes the
core hotter than the skirt for free.

Local frame: throat at the origin, tail at -Z, so it bolts straight onto
the nozzle the hull geometry already has.

## The painted plume: a hot near-white throat cooling through the fleet's own

<a id="the-painted-plume-a-hot-near-white-throat-cooling-through-th"></a>

The painted plume: a hot near-white throat cooling through the fleet's own
colour to nothing at the tail, with a soft radial falloff across it.

The HUE RAMP IS IN THE TEXTURE, not in the material colour, because a
greyscale map multiplied by one tint can only ever be that tint at every
value — which is how the old plume ended up as a flat sheet of one colour
with no thermal structure in it. The material then applies a neutral gain
to lift the throat over the bloom threshold without touching the ramp.

## THE HULL MAPS: albedo, normal, roughness and emissive, painted once

<a id="the-hull-maps-albedo-normal-roughness-and-emissive-painted-o"></a>

THE HULL MAPS: albedo, normal, roughness and emissive, painted once.

The previous ship was a bare MeshStandardMaterial in salmon
(0xa8807e, metalness 0.25, roughness 0.62) with no maps at all, so the
merged primitives rendered as raw shaded polygons — three flat wedges. No
amount of geometry fixes that; a hull reads as a hull because light
travels differently along its length than across it, and that requires a
roughness map. All four are greyscale/derived from one painted plate, in
the same canvas pipeline as the deck plates.

## EMISSIVE: RUNNING LIGHTS ONLY, and that restraint is load-bearing

<a id="emissive-running-lights-only-and-that-restraint-is-load-bear"></a>

EMISSIVE: RUNNING LIGHTS ONLY, and that restraint is load-bearing.

The fuselage and the nacelles sample the FULL 0..1 UV range, so every
bright region anywhere in this image lands somewhere on the main hull.
A first pass painted a canopy strip and a nozzle-throat block into the
patches those small parts were remapped into — and the fuselage picked
both up as large glowing rectangles, which with a faction emissive of
(1.9, 0.34, 0.26) turned the whole ship salmon-pink again: exactly the
defect the steel albedo was introduced to kill.

So the only thing in here is a run of small formation lights down each
flank. They are dots at hull scale, they carry the faction colour, and
nothing on the map can mistake them for the hull's own value.

## ONE STEEL FOR BOTH FLEETS

<a id="one-steel-for-both-fleets"></a>

ONE STEEL FOR BOTH FLEETS.

The old hull was 0xa8807e — a salmon that appears nowhere in the
briefed steel-and-bronze palette and read as a debug proxy colour. Who
a fleet belongs to is now carried entirely by the RUNNING LIGHTS and
the plume, which is both how warships are actually identified and the
only channel that still works when the hull is eight pixels across and
silhouetted against a bright plate.

Metalness stays low. At 0.7 with a probe and a key at 2.4 the hull
clipped to white and the ship became flat spikes; a painted warship is
not a mirror. The form now comes from the roughness map, which is
where it should have come from all along.

## How much of a guarded sector's ID plaque this fleet is currently sitting

<a id="how-much-of-a-guarded-sector-s-id-plaque-this-fleet-is-curre"></a>

How much of a guarded sector's ID plaque this fleet is currently sitting
on, 0..1, in SCREEN space.

THE SECTOR NUMBER IS UNINTERRUPTIBLE. Crabbing the hulls (see
readableHeading) stops them presenting end-on, but it cannot help with the
geometry of a move that runs toward the viewer: the plaque lies on the
tile's NEAR edge, so a fleet leaving that tile toward the camera passes
directly over its own sector code about a third of the way through the
crossing. Measured on the shipped frame, the '10' was gone entirely and
the plaque well was empty — the game's own animation deleting a
first-class strategy read.

Only the two sectors the crossing touches are ever tested, so this is two
projections a frame. The alternative — depthTest:false on the plaque —
would put the number back through any asteroid standing in front of it,
which is a defect this file has already fixed once.

## A heading vector for the darts to face: the true ground track, CRABBED

<a id="a-heading-vector-for-the-darts-to-face-the-true-ground-track"></a>

A heading vector for the darts to face: the true ground track, CRABBED
away from the camera axis when the track runs straight at or away from
the viewer.

The rig never rotates and its ground axis is +/-Z (VIEW_DIR.x is zero), so
"straight at the camera" is a fixed test, not a per-frame projection. Any
move between vertically-adjacent sectors is exactly that case, which is
most moves — so without this the common case is the unreadable one. The
ships still FLY the true path; they simply hold a banked attitude across
it, the way anything with a lifting surface approaches. What it buys is a
silhouette that stays a ship at every moment of the crossing.

## NEITHER FLEET IS CYAN

<a id="neither-fleet-is-cyan"></a>

NEITHER FLEET IS CYAN.

Friendly was [0.16, 1.05, 1.35] and its route ribbon [126, 226, 244];
measured on the shipped frame the pad plume peaked at RGB(179,224,228)
— the most saturated, coolest pixel anywhere in the view, dominating
the homeworld tile. The brief is steel and amber/bronze, WarCraft II /
StarCraft I industrial, explicitly NOT the sleek cool holographic
default; the comment that used to sit here rejected pink on exactly
that ground while shipping saturated cyan two lines further down.

So ownership is carried by VALUE AND SHAPE, which is both how warships
are actually told apart and the only channel that still works for a
colour-blind player: friendly hulls are bright steel throwing a warm
amber plume, hostile hulls are dark steel throwing a deep red one. The
cool accent is reserved for the selection ring, where it is functional.

These are the LINEAR gains applied to the painted plume ramp and the
nozzle glare; they sit just over white so the bloom pass finds the
throat, and no higher — a plume authored at 3x swallows the hull.

## THE PLUME IS A CONE OUT OF THE NOZZLE, NOT A BALL BEHIND THE SHIP

<a id="the-plume-is-a-cone-out-of-the-nozzle-not-a-ball-behind-the-"></a>

THE PLUME IS A CONE OUT OF THE NOZZLE, NOT A BALL BEHIND THE SHIP.

The old engine was a camera-facing glow sprite 1.1 hull-widths
across, parked a full hull-length aft of the dart's origin — so
what crossed the board was a bright orb with two dark slivers
trailing below-left of it, reading as two unrelated sprites rather
than one mass under way. This is a tapered cone rooted at the
nozzle the hull geometry actually has (z = -0.492 in hull units,
see buildDartGeometry), hot at the throat and transparent at the
tail, so the thrust is attached to the thing producing it.

## DEPARTURE GLARE, ON THE DECK

<a id="departure-glare-on-the-deck"></a>

DEPARTURE GLARE, ON THE DECK.

This was a camera-facing sprite positioned at `start` — and `start`
has already been lifted to FLEET_ALTITUDE, so the flash the comment
called "on the origin plate" actually rendered at cruising height with
no hull attached to it: a bright orb floating on the trail while the
ship sat well below-left of it, reading as two unrelated sprites
rather than one mass under way. It is now a DECAL lying flat on the
origin plate, like the `wash`, so it reads as engine light washing the
deck at launch.

## True when WebGL is being serviced by a CPU rasteriser (SwiftShader

<a id="true-when-webgl-is-being-serviced-by-a-cpu-rasteriser-swifts"></a>

True when WebGL is being serviced by a CPU rasteriser (SwiftShader,
llvmpipe, Mesa's software path). Those have no fill rate to speak of, and
asking one for a HiDPI backing store on a view that is always on screen is
how a map ends up at four frames a second.

ASKED OF THE CONTEXT THAT IS ACTUALLY GOING TO DRAW, never of a throwaway.

There used to be a probe context here, created and destroyed before the
renderer, on the reasoning that some choices are constructor arguments and
"a decision that arrives after the first frame is a decision the player has
already paid for". Measured, that probe was the single most expensive thing
in the map's startup: 109 ms to create the context, 0.4 ms to read the
renderer string, and then 3050 ms inside
`getExtension('WEBGL_lose_context').loseContext()` — three seconds of dead
page to release a context we had held for half a millisecond. It bought one
constructor argument and cost more than everything else in initialize()
combined.

Everything the answer feeds is now settable AFTER construction — the
backing-store ratio, the detail ladder, whether a composer is ever built —
so the honest order is: construct the real renderer, ask ITS context, and
let the governor sort out anything the string does not say. `antialias` is
the one exception: it is a property of the drawing buffer and is now simply
asked for on every machine, because four coverage samples over a board of
large flat plates is worth more than a three-second stall to avoid them.

This is a POSITIVE identification, not a capability test: a driver that
withholds WEBGL_debug_renderer_info (Firefox with resistFingerprinting,
some privacy extensions) answers "no" here and is then sorted by
measurement instead, which is what governDetail() and governPost() are for.

## The middle of the band the HUD is NOT covering, as CSS

<a id="the-middle-of-the-band-the-hud-is-not-covering-as-css"></a>

The middle of the band the HUD is NOT covering, as CSS.

The map area is not the visible area: panels overlap it on every side and
report their footprint through setSafeArea(). A plate centred on the canvas
lands under the map key — measured, with the recovery button's right half
behind it, which for the one plate that carries an operable control is not
a cosmetic problem. The camera already frames sectors this way; the plates
use the same offsets so they are staged where the player is looking.

## ONE PERMANENT LIVE REGION, IN THE DOM FROM THE START

<a id="one-permanent-live-region-in-the-dom-from-the-start"></a>

ONE PERMANENT LIVE REGION, IN THE DOM FROM THE START.

A screen-reader player used to be told nothing at all about the eight
seconds this domain is about: not that it had started, not that it had
finished. The canvas carries a static label that never changes, the only
live region was the boot plate — which never entered the DOM — and the two
CustomEvents this module dispatches have no listeners anywhere in the
product, so nothing turned either of them into something a person could
perceive.

This is created with the scene, before there is anything to say, because a
live region inserted at the same moment as its first message is routinely
not announced at all. It is visually hidden by clip rather than by
display:none, which is what keeps it in the accessibility tree.

## MSAA ON THE SCENE TARGET

<a id="msaa-on-the-scene-target"></a>

MSAA ON THE SCENE TARGET.

With a composer the canvas only ever receives a fullscreen quad, so
`antialias: true` on the renderer does nothing — every silhouette in
the scene was rasterised with no coverage sampling at all, and FXAA
at the end of the chain is a post-hoc edge blur that cannot
reconstruct a stair-stepped one-pixel circle. That is why the star's
disc, the plate chamfers and the planet limbs all came back visibly
jagged. Allocating the composer's own target with samples: 4 puts
real coverage sampling back where the geometry is drawn; FXAA stays
on afterwards for the shader-aliasing FXAA is actually good at.

EffectComposer clones whatever target it is given for its second
ping-pong buffer, and RenderPass/UnrealBloomPass both declare
needsSwap = false, so the buffer the scene lands in is covered.

## THE OUTPUT DITHER, IN SCREEN SPACE

<a id="the-output-dither-in-screen-space"></a>

THE OUTPUT DITHER, IN SCREEN SPACE.

This is the last pass in the chain, so it is where the half-float
frame is quantised to the canvas's 8 bits — and the sky is a very
smooth gradient over a very small value range that ACES then
stretches, which is textbook contouring. A +/-1.5 level triangular
PDF (the sum of two uniforms) decorrelates the quantiser where a
uniform one leaves residual structure.

It is spliced into FXAA rather than added as a pass of its own
because the correction is two lines of arithmetic and a whole
extra full-screen blit to carry them is not a trade worth making.
It also has to live HERE and nowhere else: the same dither
authored into the sky texture became the 15px lattice that made
the frame unshippable (see buildSkyTexture).

## ATMOSPHERIC PERSPECTIVE

<a id="atmospheric-perspective"></a>

ATMOSPHERIC PERSPECTIVE.

The board read as a Catan tray photographed from above because nothing
receded: far hex rows were the same size, the same value and the same
sharpness as near ones, so the frame had no depth cue of any kind.
Exponential fog tinted to the sky is the classical fix and the cheapest
one — it costs a per-fragment lerp on the plates, which are already the
largest fill in the scene, and nothing else. Density is set so the far
edge of a fourteen-wide grid loses about a fifth of its contrast: enough
to build depth, not enough to grey out gameplay signal.

## The selection marker, built on first use

<a id="the-selection-marker-built-on-first-use"></a>

The selection marker, built on first use.

It needs the plate atlas, which is the single most expensive bake in the
file, and it is invisible until the player selects something — so building
it eagerly meant every player paid 680 ms of plate generation before the
first frame in order to have a marker ready for an interaction most of them
had not made yet.

## WHEN THE DISPLAY LINK GOES AWAY

<a id="when-the-display-link-goes-away"></a>

WHEN THE DISPLAY LINK GOES AWAY.

A driver reset, a laptop waking from sleep, or memory pressure during
exactly the allocation-heavy startup this file is about takes the GL
context out from under the map. Untreated the symptom is the worst kind:
the rAF loop keeps running against a dead context, nothing is ever drawn
again, and the player is looking at a black rectangle with no message and
no way out but a reload — which repeats the whole startup.

preventDefault() on 'webglcontextlost' is what makes restoration possible
at all; without it the browser never fires 'webglcontextrestored'. So:
stop the loop, say what happened in language a player can act on, and
offer a control — a real focusable button, because a recovery path only
a mouse can take is not a recovery path.

## BILLED, NOT DISCARDED

<a id="billed-not-discarded"></a>

BILLED, NOT DISCARDED.

The old rule was "a frame that carried startup work says nothing about
this machine, so throw the sample away" — and it starved the one
mechanism that rescues a struggling machine at exactly the moment it
was needed. During the first eight seconds nearly every frame carried
work, so nearly every sample was discarded; the captured timeline had
the first detail rung firing at 11.2 SECONDS, long after the startup it
exists to protect, and arriving as three more stutters of its own.

Worse, discarding cost TWO samples each time: the work frame, and the
following frame whose interval was then zeroed and rejected by the
frameMs <= 0 guard.

The honest measurement was available all along. What a work frame costs
to RENDER is its interval minus the work it carried — subtract the
previous frame's work from this frame's interval and every frame votes,
with the startup staging correctly excluded rather than the whole
sample thrown out.

## STAGED WORK, AND ONLY AFTER THE BOARD HAS BEEN SEEN

<a id="staged-work-and-only-after-the-board-has-been-seen"></a>

STAGED WORK, AND ONLY AFTER THE BOARD HAS BEEN SEEN.

Nothing expensive runs on the first turn of the loop, so the very
first render is never carrying a bake behind it. After that: one shared
boot step per frame until they are done, then the content queue under a
budget it can actually keep.

`workMs` is what this frame spent on startup rather than on rendering.
The frame governor is not allowed to judge the machine on those frames
— a 700 ms frame that was generating a world says nothing at all about
whether this machine can render the board.

## Where the unexplored field starts to recede, in view depth

<a id="where-the-unexplored-field-starts-to-recede-in-view-depth"></a>

Where the unexplored field starts to recede, in view depth.

MEASURED, NOT ASSUMED. The first attempt anchored this at
0.94..1.34 of the camera's distance to its focus, on the reasoning
that "beyond the focus" is far — and the board does not work that
way. The rig looks DOWN at 61 degrees from behind, so the whole
grid lies between about 0.65 and 1.05 of that distance and every
single cell landed under the near clamp: the shader ran and did
exactly nothing, and the field measured flat to within 2%. The
band has to straddle the range the board actually occupies.

Normalising by the rig's own distance is still what makes the
falloff hold its shape through the zoom wheel.

## HEADING COMES FROM THE GROUND TRACK, NOT FROM THE ARC

<a id="heading-comes-from-the-ground-track-not-from-the-arc"></a>

HEADING COMES FROM THE GROUND TRACK, NOT FROM THE ARC.

The crossing lifts the formation by sin(progress * PI) * 0.5,
so at both ends of the run the frame-to-frame delta is almost
entirely VERTICAL — and pointing the hull along that put the
darts nose-down, presented end-on to the camera. A dart seen
down its own axis is a featureless truncated cone with two
collars, which is what parked on top of sector 10's ID plaque
and erased the number: the sector code is a first-class
strategy read and the game's own move animation was destroying
it. It also swung the nozzle upward, so the exhaust appeared to
leave the NOSE and painted a false "fleet here" streak across
the neighbouring tile.

Damping the vertical component keeps the silhouette broadside
for the whole crossing — the climb still reads, because the
formation visibly rises, but it is never read down its axis.
readableHeading() then handles the other half of the same
problem: a track that runs straight at the camera.

## Trail history: newest at the head, oldest shifted off the tail

<a id="trail-history-newest-at-the-head-oldest-shifted-off-the-tail"></a>

Trail history: newest at the head, oldest shifted off the tail.

THE HEAD IS THE LEAD DART'S NOZZLE, not the formation's origin.
Those are not the same point — the lead dart sits forward and
above the group centre and the plume runs aft of that again —
and the difference showed as a visible GAP between the streak
and the ships, so the two read as unrelated objects sliding
past each other rather than as one mass under way.

## ...and the CPU is not the one rasterising, expressed as a SHARE of the frame

<a id="and-the-cpu-is-not-the-one-rasterising-expressed-as-a-share-"></a>

...and the CPU is not the one rasterising, expressed as a SHARE of the frame
rather than as a millisecond ceiling.

An absolute ceiling gets this backwards. The board is several hundred draw
calls, and three.js spends real CPU building them, so a perfectly healthy
GPU machine can sit at 8-10 ms inside render() while the GPU idles — and a
fixed 8 ms budget would have refused the glow to exactly the hardware it was
written for. What actually distinguishes a CPU rasteriser is that render()
accounts for ESSENTIALLY THE WHOLE FRAME: the ratio sits above 0.9 there and
under 0.5 on anything with a GPU behind it. The floor is the trivial case —
a render call that returns in three milliseconds has a GPU behind it and
does not need a ratio to prove it.

## A 7x5 GRID, NOT FIVE POINTS

<a id="a-7x5-grid-not-five-points"></a>

A 7x5 GRID, NOT FIVE POINTS.

Five points was the first attempt and it was measured wrong: at 1280x720 a
dense 17x11 hit-test showed 42% of the map still reaching the screen
between the HUD panels, and all five samples landed on panels anyway, so
the map would have animated at two frames a second while nearly half of it
was visible. The gaps the HUD leaves are narrow and irregular and they move
with the breakpoint; a sparse sample cannot see them.

The error here is not symmetric. Concluding "covered" when the map is
visible is a defect the player watches happen; concluding "visible" when it
is covered only costs a frame. So the sweep has to find EVERY gap, and it
exits on the first sample that reaches the map — which is the common case,
so the usual cost is one or two hit tests, not thirty-five.

It reaches the EDGES (2% to 98%), not a comfortable inset. On a narrow
window the HUD stacks and what survives of the map is a one-column strip
down the far side; a grid that stops at 7% missed exactly that and called a
board with 14% of itself on screen "covered".

## THE BACKING STORE IS RESIZED WHEN THE PLAYER'S HAND IS OFF THE MAP

<a id="the-backing-store-is-resized-when-the-player-s-hand-is-off-t"></a>

THE BACKING STORE IS RESIZED WHEN THE PLAYER'S HAND IS OFF THE MAP.

setPixelRatio() calls setSize(), which reallocates the drawing buffer,
which on a CPU rasteriser has to drain everything already queued in it.
Measured inside applyDetailRung(): 717 ms in one run and 6570 ms in
another. So the rung that exists to stop the board hitching was itself
the largest hitch in the session — the exact failure the review called
out, one layer further down than where it was looked for.

It is not made cheaper here, because it cannot be: it is a flush. It is
made INVISIBLE, by spending it at the same kind of moment the content
queue spends its expensive items — a hand that is not in the middle of
a gesture. The rung's saving is permanent and arrives a fraction of a
second later; the stall lands where nothing is riding on it.

## Bring one fog-cell material into line with the current rung

<a id="bring-one-fog-cell-material-into-line-with-the-current-rung"></a>

Bring one fog-cell material into line with the current rung.

Applied both to the materials that exist when a rung is taken and to any
built afterwards (initialize() can lay out a whole new grid), so there is
one definition of what a rung does to the unexplored field rather than two
that drift apart.

The colour compensation is the point of the exercise. The unexplored:
charted value step is the loudest thing the board says and it is checked
against the HUD map key; dropping the blend would darken the cell by the
amount the sky used to show through it, so it is paid back in the albedo.
The haze, the socket chamfer and the depth falloff all stay — what is lost
is a blend, not a read.

## THE WINDOW'S WORST FRAME DOES NOT GET A VOTE

<a id="the-window-s-worst-frame-does-not-get-a-vote"></a>

THE WINDOW'S WORST FRAME DOES NOT GET A VOTE.

Both governors take permanent, one-way decisions off a windowed mean, and
a mean over four frames is decided by its largest element. Measured: a
single 771 ms frame — a GPU compiling the shader for a world that had just
appeared, once, never again — dragged a window of otherwise 17 ms frames to
a 205 ms mean and PERMANENTLY DROPPED THE POST CHAIN on a machine that was
holding a locked sixty. The same spike takes detail rungs.

One long frame in a window is a hitch. A window of long frames is a frame
rate. Only the second is what these governors are for, and dropping the
single worst sample is the smallest statistic that tells them apart: on a
machine that genuinely cannot render the board every frame is over budget,
so removing one changes nothing.

## ONE RUNG BACK, ONCE, AND ONLY IF IT WAS TAKEN UNDER PROTEST

<a id="one-rung-back-once-and-only-if-it-was-taken-under-protest"></a>

ONE RUNG BACK, ONCE, AND ONLY IF IT WAS TAKEN UNDER PROTEST.

Degradation here is one-way on purpose: a board that flickers
between two levels of detail is worse than either. But a rung taken
while the forge had the CPU is a rung taken on a measurement that
was about our own background threads, and leaving a healthy machine
permanently at four fifths of its backing store because of the
three seconds it spent generating worlds is a bill sent to the
wrong address.

So exactly one restore is allowed, only for a provisional rung,
only once the forge is quiet, and only on a window that came in at
half the budget — comfortably, not marginally. After that the
ladder is one-way again for the rest of the session.

## MEASURED ON THE FRAME INTERVAL, NOT ON WHAT render() RETURNED IN

<a id="measured-on-the-frame-interval-not-on-what-render-returned-i"></a>

MEASURED ON THE FRAME INTERVAL, NOT ON WHAT render() RETURNED IN.

The obvious guard here would be "only shed if the render call is most
of the frame" — and it is exactly wrong for the machine this governor
exists to help. Measured on SwiftShader, render() returns in about
10 ms of a 280 ms frame: a software rasteriser does its work on its own
threads and at the buffer swap, so almost none of the cost is billed to
the call. A ratio test would have refused to help the one machine that
needs helping, which is how the last revision ended up with a governor
that never fired.

What IS asked instead: is the map on screen at all (a covered map is
not being drawn, so its detail is not what is costing the frame), and
has the machine said so twice before the first rung.

## ...AND THE LADDER IS CAPPED WHILE OUR OWN THREADS ARE RUNNING

<a id="and-the-ladder-is-capped-while-our-own-threads-are-running"></a>

...AND THE LADDER IS CAPPED WHILE OUR OWN THREADS ARE RUNNING.

The forge saturates whatever cores it is given for a few seconds at
startup, so during that window EVERY machine measures slow — and
degradation here is one-way, so a transient we caused ourselves would
permanently cut the quality of a machine that has nothing wrong with
it. Measured: a GPU that holds a locked 16.6 ms afterwards was taken to
rung 2 and had its post chain dropped, on the strength of frames it
spent waiting for its own background bake.

The rescue is NOT suspended — a genuinely hopeless machine still gets
rung 1, which is the cheapest and least visible rung and the one that
saves the most, within the first second. What it cannot do during the
transient is keep going down a ladder on evidence that will not be true
a moment later.


## The landing page, login, race select and lobby all honour this; the game scree

<a id="the-landing-page-login-race-select-and-lobby-all-honour-this"></a>

The landing page, login, race select and lobby all honour this; the game screen —
by far the most animated page in the product — did not. Idle decoration (planets
spinning, markers pulsing in and out of scale, the selection ring flashing, fog
drifting) runs continuously for as long as the map is open, and scale oscillation
and flashing are the two kinds of motion people set this preference to avoid.

Informational motion is NOT suppressed: a fleet crossing the map, or the camera
moving because you asked it to, tells you something. Only the idle loop is stilled,
and everything it touches stays VISIBLE at a steady value — the selection ring in
particular still marks the selected sector, it just stops pulsing.

## Bloom threshold, in linear light. Anything authored below this does not

<a id="bloom-threshold-in-linear-light-anything-authored-below-this"></a>

Bloom threshold, in linear light. Anything authored below this does not
glow; anything above it is a light source. Sector numbers and fleet badges
are painted at ~0.86 sRGB precisely so they land under it.
1.05, not 0.9. With the bloom raised to strength 0.7 so a star can blow
out, a threshold of 0.9 also caught the gold homeworld plate — the
brightest LIT surface on the board — and smeared a cream wash over the
centre of it that took the grain and the rivets with it. A light source is
authored ABOVE white; a lit plate never is. This is where that line sits.

## ANISOTROPY. The previous revision turned this off on the theory that a

<a id="anisotropy-the-previous-revision-turned-this-off-on-the-theo"></a>

ANISOTROPY. The previous revision turned this off on the theory that a
fixed 60-degree tilt is "already correct" for trilinear. It is not:
60 degrees is exactly a 2:1 compression along the view axis, so the
trilinear mip selector picks the level that suits the SHORT axis and
blurs the long one — which is why rivets in the far half of the board
arrived as smears while the near ones were sharp. Every texture here
is built once and cached, and the plates are the surface that spends
its life at a grazing angle, so this is the cheapest sharpness in the
renderer.
Not on a CPU rasteriser, where every extra tap is a real loop in the
main thread and the plates cover the whole viewport.

## The plotting table: hex plate geometry and its material set

<a id="the-plotting-table-hex-plate-geometry-and-its-material-set"></a>

------------------------------------------------------------------
The plotting table: hex plate geometry and its material set.

The old tile was a six-sided cylinder with a flat MeshStandardMaterial —
no edge, no relief, nothing for the key light to catch, which is exactly
why the board read as a debug wireframe fill. This one is a machined
plate: recessed top face, chamfered lip, short side wall, flat-shaded so
the chamfer reads as a separate facet at every camera angle.
------------------------------------------------------------------

## Funnel wall: rim down to floor. Six flat facets, so the key light

<a id="funnel-wall-rim-down-to-floor-six-flat-facets-so-the-key-lig"></a>

Funnel wall: rim down to floor. Six flat facets, so the key light
separates them and the socket has depth without a single painted
pixel of hardware in it.

WINDING. HEX_CORNERS is wound clockwise in (x, z), which is
counter-clockwise seen from above, so a fan over it faces +Y with
no help. A funnel WALL is not a fan: taking the corners in the same
order from the outer ring to the inner one produces triangles whose
normals point DOWN and outward, which front-face culling then
removes entirely — the cell rendered as nothing but its floor, at
80% of the tile, and the missing 20% was also missing from the
raycast, so clicking the edge of an unexplored sector did nothing.
The wall triangles are therefore wound the other way round.

THE WALL IS SHADED PER FACET, NOT BY ONE FLAT CONSTANT.

It used to be RIM = 3.1 against FLOOR = 1.0 — a 3.1x vertex tint on
every one of the six walls at once. The scene key only reaches one
or two of them, so what shipped was a single pale parallelogram
blown out of the upper-left edge of every unexplored hex while the
other four vanished into the floor value: torn paper, not a socket.
Each wall now takes its own orientation to the key, exactly as the
plate's chamfer does through paintRimStrip, so all six carry a
distinct value and the cell reads as a recess with a lit side and a
shadow side.

## Deep space

<a id="deep-space"></a>

------------------------------------------------------------------
Deep space.

Three layers, because one is what makes a starfield look like a debug
scatter: an infinitely-distant dome carrying the galactic plane and the
nebula masses, a fixed star sphere inside it, and a near dust field in
world space that parallaxes against both when the player pans.
------------------------------------------------------------------

## WHERE THE CAMERA ACTUALLY LOOKS

<a id="where-the-camera-actually-looks"></a>

WHERE THE CAMERA ACTUALLY LOOKS.

NOTE ON THE REWRITE: the previous version painted the base at 256x128
and let the canvas bilinearly upscale it to 1024x512, which put a
regular grid modulation across the whole void — the base texel lattice
resolving on screen, measurable at std 1.4 levels on a mean of 38 and
plainly visible at 2x zoom. There is no filter setting that removes
that; the fix is to evaluate every texel. The expensive multi-octave
layers are sampled off coarse grids (coarseField) and only the layers
that need to be crisp are evaluated per texel, so this costs about the
same as the version with the artefact in it.

THE DOME IS TILTED TO PUT ITS POLE OUT OF FRAME (see buildBackdrop).

The rig never rotates: the view direction is fixed at ~61 degrees below
the horizon, which on an un-tilted equirect dome aims the camera almost
straight at the -Y POLE — where every line of constant latitude
collapses into a ring around the centre of the screen. That is why a
perfectly reasonable horizontal "galactic plane" band came back as a
pale funnel radiating out from behind the board. Tilting the dome by
the camera's own pitch puts the view centre on the dome's EQUATOR,
where equirect is well behaved and a band painted across the image
reads as a band across the frame.

Consequence for authoring: the visible window is now v in ~0.36..0.64
and a ~0.17-wide run of u centred on 0.75. The ramp and the plane are
placed for that window; the noise layers are statistically uniform in
u so it does not matter where exactly the window lands.

---- Pass 1: the nebula masses, drawn as canvas gradients into a
scratch buffer. They are read back and folded into the per-texel pass
below rather than composited on top, so the dither applies to them
too — a 400px radial gradient at these alphas is otherwise the single
worst source of 8-bit contour banding in the frame.

## These coefficients are CALIBRATED, not chosen: a texel here is

<a id="these-coefficients-are-calibrated-not-chosen-a-texel-here-is"></a>

These coefficients are CALIBRATED, not chosen: a texel here is
decoded to linear, run through ACES and re-encoded, which maps
a value of ~56 to a displayed ~40. The dome has to land in the
25-60 band — dark enough that the board is unambiguously the
brightest thing on screen, light enough that the negative space
carries an image.
getImageData returns UN-premultiplied colour, so a texel a blob
barely touched still carries the blob's full RGB with an alpha
of two. Adding the raw channels put a bright pale wash over the
entire sky that measured L*45-58 — brighter than the plates,
which is the one thing the negative space may never be. The
alpha weight is not optional.

## Near layers live in world space so they parallax when the board is

<a id="near-layers-live-in-world-space-so-they-parallax-when-the-bo"></a>

Near layers live in world space so they parallax when the board is
panned — that motion is the only thing that sells distance on a view
with no perspective cues of its own.

The sheets must be WIDER than the widest framing or their own straight
edge shows up as a hard vertical seam across deep space, which is what
happened at 3.2x: at the closeup framing the +X edge of the plane cut
the sky in half. At 9x the boundary is outside the frustum at every
zoom the wheel allows.

## This is the layer that puts a value under the whole frame, not

<a id="this-is-the-layer-that-puts-a-value-under-the-whole-frame-no"></a>

This is the layer that puts a value under the whole frame, not
only above the horizon. Bounded HARD by the tile brightness
above it: at 0.46 it lifted the whole frame into a flat pale
wash that measured brighter than the board itself, which is the
same failure as the black one with the sign flipped.
0.085. This sheet is also what shows through the gaps BETWEEN
plates, and measured at 0.12 the deck gap came back level with
a charted plate — so the empty space between two instruments
was as loud as the instruments. It still has to carry a value
under the whole frame, so this is as far down as it goes.

## Major axis along the light's ground bearing; a rotation of phi about

<a id="major-axis-along-the-light-s-ground-bearing-a-rotation-of-ph"></a>

Major axis along the light's ground bearing; a rotation of phi about
+Y sends the quad's local +X to (cos phi, 0, -sin phi), so phi is
atan2(-L.z, L.x). The minor axis is the elevation squash.
Tight. At 4.2 x 2.6 the decal was wider than the tile it sat on, so
its falloff dimmed the whole plate evenly instead of drawing an
ellipse — a shadow you cannot find the edge of is not a shadow.
2.35 x 1.5, not 2.8 x 1.75: the body sits lower now, and a shadow's
size is a function of how far the caster is from the surface. A tight,
dark ellipse under a low body is what grounds it; a wide faint one is
the "cannot find the edge of it" failure with the sign flipped.

## Rooted ON the limb. The loop is painted along the texture's bottom

<a id="rooted-on-the-limb-the-loop-is-painted-along-the-texture-s-b"></a>

Rooted ON the limb. The loop is painted along the texture's bottom
edge, so the sprite's centre sits half its own height outboard of
the disc and the material rotation turns that edge to face inward:
rotating by (a - PI/2) sends the sprite's local down to -(cos a,
sin a), which is the direction of the star's centre.
Standing OFF the limb, not lying across the disc. At 0.94 the
loop's inner half sat inside the photosphere's silhouette, where a
nested pair of arcs over a bright disc reads as concentric debug
circles rather than as plasma leaving the surface.

## Detail level

<a id="detail-level"></a>

------------------------------------------------------------------
Detail level

A world framed for the whole galaxy is about seventy pixels across. At
that size its cloud shell and its atmosphere shell are two extra passes
of a heavy shader over a sphere whose weather nobody can resolve, and
measured on a software rasteriser they were most of the frame. So the
shells switch off below a screen size where they contribute anything, and
the belts thin out to their anchor rocks. Nothing that carries gameplay
signal — class hue, ownership tint, the halo, the badge, the number — is
ever a casualty of this; it only ever removes detail the pixel grid
cannot show.
------------------------------------------------------------------

## STARTUP IS STAGED, AND EVERY STAGE HANDS THE PAGE BACK

<a id="startup-is-staged-and-every-stage-hands-the-page-back"></a>

------------------------------------------------------------------
STARTUP IS STAGED, AND EVERY STAGE HANDS THE PAGE BACK.

The map used to arrive as one 4.3-second synchronous task followed by
eight more seconds of multi-second frame hitches. Nothing about that was
necessary: it was one function doing every expensive thing it would ever
need before it drew anything at all, and then a "budget" that could not be
enforced because it was checked AFTER the item that blew it.

The shape now is:

  initialize()      renderer, camera, lights, fog grid. Returns. Cheap.
  boot step 1..n    one heavy shared bake per frame (plate atlas, sky
                    dome, reflection probe, selection marker) while the
                    board is already on screen and already draggable.
  content queue     one world per frame at most, paced by a measured
                    estimate of what a world costs ON THIS MACHINE, with
                    a survey proxy standing in until the real one lands.

Between every one of those the browser gets to paint and to run the
player's input. That is the whole point: a world that appears two frames
late is invisible, a cursor that stops moving for three seconds is the
entire complaint.
------------------------------------------------------------------

## THE WORLD FORGE — the second thread that makes the budget real

<a id="the-world-forge-the-second-thread-that-makes-the-budget-real"></a>

==================================================================
THE WORLD FORGE — the second thread that makes the budget real.

THE PROBLEM THIS SOLVES, stated exactly. A world's surface is not drawn,
it is GENERATED: five equirectangular maps (albedo and normal at
1024x512, a cloud deck at the same, roughness, night lights), every texel
sampled from 3D noise on the sphere. Measured on this machine, per class:
870, 1355, 1404, 1716, 1816, 2161 ms. Assembling the meshes once those
maps exist costs ONE millisecond.

So the pacing argument the previous revision made was unanswerable and
still lost. You cannot spend 1.8 seconds "under a 12 ms budget"; you can
only choose which frame to ruin. Every rung of cleverness — nearest-first,
one item per frame, a measured cost estimate, a quiet-hand gate — was
arranging the deckchairs around a single indivisible block that is a
hundred and fifty times the size of the frame it has to fit in. The audit
measured the result honestly: rAF callbacks of 4172, 2658, 2409, 1527 and
1286 ms inside the player's first ten seconds, and a pointer move that
took SEVEN SECONDS to be answered.

The block cannot be made smaller from here — the generator lives in
planet-texture.js, which the battle theater shares. But it does not have to
run on the thread the player is holding.

WHAT RUNS WHERE
  worker   planet-texture.js, imported with a two-line document shim so its
           document.createElement('canvas') hands back an OffscreenCanvas.
           It bakes the maps, converts each to an ImageBitmap, and builds
           the three ShaderMaterials so it can send back their SOURCE and
           their uniform values. All of that is pure computation; none of
           it needs a GL context.
  main     turns each ImageBitmap into a THREE.Texture (an upload, not a
           generation) and re-inflates the materials from the description.
           Measured at a couple of milliseconds for a whole class.

The result is that the smallest schedulable unit is finally SMALLER THAN
THE BUDGET, which is the thing that makes a budget a budget. The board
fills in while the main thread holds frame rate, instead of the main
thread stopping five times so the board can fill in.

WHY NOT JUST CALL getPlanetMaps() IN THE WORKER AND USE IT ON THE MAIN
THREAD. Because its cache is module-private: any main-thread call to
createPlanetObject() re-bakes, worker or no worker. Shipping the finished
MATERIAL DESCRIPTION rather than the maps is what sidesteps that without
reaching into a file this module does not own. Nothing here re-implements
the look: the shader source, the defines and every uniform value are the
generator's own, transported.

AND IF ANY OF IT IS UNAVAILABLE — no Worker, no OffscreenCanvas, a module
that will not import, a bake that throws, or one that simply never answers
— the class falls back to the original main-thread createPlanetObject()
path, still paced, still behind a quiet-hand gate. Degraded, never broken.
==================================================================

## The generator's atmosphere is a BACK-SIDE shell whose alpha comes

<a id="the-generator-s-atmosphere-is-a-back-side-shell-whose-alpha-"></a>

The generator's atmosphere is a BACK-SIDE shell whose alpha comes
from the view ray's impact parameter against the planet, weighted
by dot(rim, light) — a crescent on the lit limb, which is what an
atmosphere is. 0.30/4.6, not 0.38/3.8: at the wider exponent the
falloff reached far enough inboard that it lifted the whole limb
evenly and read as a hard halo RINGING the silhouette, which is the
sprite-halo look this shell exists to replace. A higher power pins
it to the limb and lets it die on the terminator.

## EMISSIVE THROUGH THE ALBEDO, not over it. An untextured constant

<a id="emissive-through-the-albedo-not-over-it-an-untextured-consta"></a>

EMISSIVE THROUGH THE ALBEDO, not over it. An untextured constant
emissive is a flat flood across the whole face, and on a
high-chroma swatch it dominated the map and washed the brushed
grain, the stencilled ticks, the tray inset and the rivets out —
the two most saturated plates on the board were the two that read
as flat coloured polygons, which is exactly backwards. Modulated by
the same relief the albedo uses, it lifts the metal instead of
painting over it, and it can then be a quarter as strong.

## NO PLATE MAP. Not a tuning choice — the whole point of the fog cell

<a id="no-plate-map-not-a-tuning-choice-the-whole-point-of-the-fog-"></a>

NO PLATE MAP. Not a tuning choice — the whole point of the fog cell
is that no instrument has been installed in it, so it carries no
rivets, no frame, no tray and no scribe. The socket's six facets and
the haze in the bottom of it are the entire image.

Measured, the previous fog plate sat at L*42-48 against a charted
plate's L*61-74: a 1.3:1 step, less separation than the gap between
two tiles. This lands near L*22, so the step is close to 3:1 and
"we have surveyed this" is the loudest thing the board says.
Measured, not guessed: with the plate map gone the colour IS the
albedo, where before it was multiplied by a map averaging 0.32 —
so the same hex would have come out three stops BRIGHTER. Sampled
off the previous build, a fog plate read L*21 against a charted
steel plate at L*39; this lands fog near L*14, which is the ~3:1
step the read needs while staying clear of black.

## ON THE PLATE'S NEAR-RIGHT FRAME, clear of the globe's silhouette

<a id="on-the-plate-s-near-right-frame-clear-of-the-globe-s-silhoue"></a>

ON THE PLATE'S NEAR-RIGHT FRAME, clear of the globe's silhouette
and — the part that was wrong — INSIDE the tile's own hexagon. The
old placement put the tab's right edge at x=0.63 with a half-width
of 0.21, which at this camera angle hung the corner off the rim
over the gutter toward the next sector. The anchor is now derived
from the hexagon's reach along its own bearing, so the whole
footprint is on the plate by construction.
30 degrees: the bearing of a hex EDGE NORMAL, so the tab sits
square on the near-right flat rather than crowding a vertex, and
clear of the sector nameplate now lying on the tile's lower edge.

## Fleet movement

<a id="fleet-movement"></a>

------------------------------------------------------------------
Fleet movement

The old tracer was a coloured ball with a glow sprite sliding between two
tiles. This is a formation of darts under way: they point where they are
going, they bank into the turn, their engines run hot enough to bloom,
and they drag a tapered ribbon behind them so the eye can read the path
after the ships have passed.
------------------------------------------------------------------

## The briefed steel, lifted a little: at 0x6a7078 against deep space

<a id="the-briefed-steel-lifted-a-little-at-0x6a7078-against-deep-s"></a>

The briefed steel, lifted a little: at 0x6a7078 against deep space,
with the albedo map's own mid-grey multiplying through it, the hull
silhouetted almost black and the panel work was invisible. Same
hue, one stop up.

OWNERSHIP IS A VALUE STEP NOW, not a hue. Your hulls are bright
steel and read as the friendly, well-kept fleet; theirs are the
same steel two stops down and read as a dark shape coming at you.
Paired with the warm-vs-red plume that is two independent channels
for the same fact, which is what a colour-blind player needs and
what the old cyan-vs-salmon pair never gave.

## TO ZERO, not to 35%. A double-sided additive strip held at a third

<a id="to-zero-not-to-35-a-double-sided-additive-strip-held-at-a-th"></a>

TO ZERO, not to 35%. A double-sided additive strip held at a third
of its width while its tangent points at the camera does not
dissolve — it renders as hard-edged pale slivers, and in the
captured frame three of them lay across a sector plate with one
cutting straight through the '1' of its number. A smoothstep takes
the ribbon to nothing as it turns edge-on, and the material opacity
(below) rides the same factor, so a fleet flying at the viewer
fades out instead of shattering.

## THE MAP'S OWN LOADING STATE, AND THREE HONEST SIGNALS

<a id="the-map-s-own-loading-state-and-three-honest-signals"></a>

------------------------------------------------------------------
THE MAP'S OWN LOADING STATE, AND THREE HONEST SIGNALS.

The module used to announce itself with one event, 'galaxy3d-ready',
dispatched at module-evaluation time — measured at t=259 ms, while the
first frame did not reach the screen until ~3.9 s and the last world not
until ~13 s. Two other files listen to it. Anyone wiring a loading state to
the only event on offer took their loader down at a quarter of a second and
handed the player a blank board.

'galaxy3d-ready' keeps its old meaning (the script is evaluated, queued
calls are drained) because other files depend on it. Two true ones are
added beside it:

  galaxy3d-first-frame   a frame has reached the canvas. The board exists.
  galaxy3d-board-ready   every charted sector's contents are generated.

And for as long as EITHER of those is still outstanding, the map area
carries a plate of its own saying so, rather than being a hole in the page.

WHY THE PREVIOUS VERSION OF THIS COULD NOT BE SEEN, which the audit proved
twice by recording an empty list where the plate should have been. It armed
a 110 ms timer that cancelled itself if a frame had painted, and it was torn
down at FIRST FRAME. But first frame is 0.8 s and a full board is eight; the
one window the plate existed for was the one window it was guaranteed to be
absent from, and its own sub-line — "charted sectors will appear as they are
surveyed" — was written for a moment it could never be on screen for.

So: it goes up immediately, it DEMOTES at first frame instead of vanishing,
and it comes down when the board is actually finished.

  0 ms .. first frame     the full plate, centred. The map is a hole and
                          this is what is in the hole.
  first frame .. ready    one instrument line in the safe-area band, with a
                          live count of what is still being surveyed. The
                          board is usable and the strip is a progress
                          report, not a blocker — it never takes the pointer.
  board ready             gone.

The screen-reader path is DELIBERATELY NOT THIS ELEMENT. See
ensureStatusRegion(): a live region has to be in the DOM before the text
changes for the change to be announced reliably, and an element that is
created, rewritten and removed on the same schedule as a visual loader is
the least reliable shape there is. The plate is therefore marked
aria-hidden and the same information — the same counts, the same milestones
— is written to a permanent role="status" beside it.
------------------------------------------------------------------

## MSAA on the DEFAULT framebuffer. With a composer this does

<a id="msaa-on-the-default-framebuffer-with-a-composer-this-does"></a>

MSAA on the DEFAULT framebuffer. With a composer this does
nothing (the canvas only ever receives a full-screen quad) and
for a long time that made it look free to ask for. It is not
free, and on the PLAIN path — which every machine now starts on
and a CPU rasteriser stays on — it is the only geometric
anti-aliasing in the frame. Four coverage samples over a board
made of large flat plates is a cheap way to keep the chamfers
and the planet limbs off the pixel grid.

## Capped at 1.5, not 2. The map fills the window and is drawn through

<a id="capped-at-1-5-not-2-the-map-fills-the-window-and-is-drawn-th"></a>

Capped at 1.5, not 2. The map fills the window and is drawn through
four full-screen post passes, so on a HiDPI laptop a ratio of 2 costs
78% more fill than 1.5 for a difference the bloom pass softens away
anyway. Every pixel of that is spent on a view that is never off
screen, which is exactly where a frame budget goes to die.
A CPU rasteriser gets the SMALLEST backing store, not the largest.
Supersampling at 1.5 was chosen here as "the only anti-aliasing those
machines get once MSAA is refused" — but 1.5 is 2.25x the pixels, and
every one of them is shaded on the CPU. Measured on SwiftShader that
ran the map at 302 ms/frame (3 fps) against 17.9 ms (56 fps) before any
of this existed. Nothing is anti-aliased at 3 fps because nothing is
playable at 3 fps, so these machines take 1.0 and keep the MSAA above.

## The rig lights the PLATES and the ROCKS. Worlds and stars carry their

<a id="the-rig-lights-the-plates-and-the-rocks-worlds-and-stars-car"></a>

The rig lights the PLATES and the ROCKS. Worlds and stars carry their
own light in-material, so this can be tuned for machined steel without
flattening a planet's terminator.
0.5, not 0.34: every plate has facets turned away from both directional
lights, and at the old level those were crushed into the bottom fifth
of the value scale — the un-keyed side of the board had no image in it
at all. Ambient is the cheapest possible fill (no extra light loop) and
it is the term that sets the floor of the whole frame.

## THE HEAVY BAKES ARE NOT HERE ANY MORE

<a id="the-heavy-bakes-are-not-here-any-more"></a>

THE HEAVY BAKES ARE NOT HERE ANY MORE.

scene.environment (the reflection probe), the 1024x1024 plate atlas and
its Sobel-derived normal map, and the sky dome all used to be built on
this line — inside the one synchronous call that hands the player their
board. Measured on the audit harness, that made initialize() a single
4.3-second main-thread task during which End Turn, the chat field, the
build pad and the keyboard tactical chart all stopped answering and
nothing had been painted into the map area yet.

They are now lazy (plateMaps(), fogTexture(), studioEnvTexture()) and
pre-warmed one per frame by the boot schedule below, so the browser gets
to paint and drain its input queue between them. Anything that needs one
before its turn comes up simply builds it then; nothing here depends on
an ordering.

## MACHINED STEEL, NOT ABS. The old 0xa9b4c6 with a broad

<a id="machined-steel-not-abs-the-old-0xa9b4c6-with-a-broad"></a>

MACHINED STEEL, NOT ABS. The old 0xa9b4c6 with a broad
70-exponent lobe sat outside the steel palette entirely and
read as chalky moulded plastic; a mid grey under the same
tight specular the plates now use makes it obviously the same
material as the table, just a newer piece of it. The warm
emissive stays — that is the "this one is selected" signal and
it has to survive landing on a gold plate as well as a blue one.

0x6d7482, not 0x8f98a8, and the reflection halved. THE SECTOR
NUMBER MUST BE THE BRIGHTEST MARK ON ITS OWN TILE. Measured,
the brackets peaked at 204 luma against the numeral's 226 on
the map framing and beat it outright at the closeup — a piece
of furniture out-shouting the one label that carries gameplay.
The marker keeps its amber; what it loses is the white.

## COALESCED TO ONE PICK PER FRAME

<a id="coalesced-to-one-pick-per-frame"></a>

COALESCED TO ONE PICK PER FRAME.

A raycast plus a getBoundingClientRect used to run per POINTER
EVENT, and a browser delivers a burst of those the moment a
slow frame ends — so the map paid for every intermediate
position of a cursor that had already moved on, and the
highlight it produced was for a point the pointer had left.
Only the latest position can matter; animate() picks it once.

## The render path, and how it is chosen

<a id="the-render-path-and-how-it-is-chosen"></a>

------------------------------------------------------------------
The render path, and how it is chosen.

THE OLD SHAPE WAS: START HEAVY, COUNT 45 FRAMES, THEN CUT SOMETHING. On a
machine rendering at four frames a second, forty-five frames is TWELVE
SECONDS. So the design was "be unusable for twelve seconds, then be
adequate" — and twelve seconds of 270 ms frames is a first impression in
which every click lands late, every drag skips, and the product reads as
broken. It also measured the clamped simulation delta, so the one step that
would actually have rescued the machine could never fire (see animate()).

THE NEW SHAPE IS: START PLAIN, AND EARN THE POST CHAIN.
  - A CPU rasteriser is identified before the renderer is even constructed
    and never probes at all. It gets the scene, the tone map and the
    default framebuffer's MSAA, from the first frame, forever.
  - Everything else renders plain for a few hundred milliseconds and is
    measured on a WALL CLOCK. On any GPU of the last decade the very first
    window passes and the composer is built before the player has finished
    reading the board; what they lose is the bloom on a handful of early
    frames, which is nothing. What they gain is that the machines which
    CANNOT afford it never pay for it even once.
  - Once the chain is on it is still governed, on the same clock, and a
    machine that degrades badly sheds FXAA and then the whole composer.
    Degradation is one-way: a chain that flickers on and off with the
    camera is worse than either state.

Two signals, because one is not enough. `frameMs` is the rAF interval and
says whether the player is getting frames; `renderMs` is wall clock spent
inside the render call and says WHO IS DOING THE WORK. On a GPU that second
number is a couple of milliseconds of command submission no matter how
heavy the scene; when it approaches the frame interval, the CPU is the
rasteriser and no amount of full-screen post is affordable.
------------------------------------------------------------------

## Don't draw what nobody can see

<a id="don-t-draw-what-nobody-can-see"></a>

------------------------------------------------------------------
Don't draw what nobody can see.

The shop and the codex are full-viewport modals with a 84-94% scrim over
them, and the map went on rendering underneath at full price the whole time
they were open — measured WORSE on those surfaces than on the board itself,
because the modal's own work is stacked on top of a frame that was already
the most expensive thing on the page. Every one of those frames was spent
on pixels that were behind a near-opaque sheet.

Only the DRAW is skipped, never the update. Freezing simulation time behind
a modal would stall a fleet mid-crossing and make it finish its journey
after the player closed the shop; keeping the update and dropping the draw
costs a millisecond or two of JS and saves the entire frame.

The test is "does any part of the map still reach the screen", asked of the
DOM rather than of a list of modal class names, because a list of class
names owned by other files is a coupling that rots silently. Elements with
pointer-events: none are invisible to elementFromPoint, which is exactly
right — the tour's spotlight overlay is one, and the tour is precisely when
the map must keep animating.

The sweep costs one layout flush and then a handful of hit tests against a
clean tree, five times a second, and it stops at the first sample that
reaches the map. On a board the player can see, that is one test.
------------------------------------------------------------------

## THE DETAIL LADDER — the governor that runs on EVERY machine

<a id="the-detail-ladder-the-governor-that-runs-on-every-machine"></a>

------------------------------------------------------------------
THE DETAIL LADDER — the governor that runs on EVERY machine.

The post-processing governor above can only ever take the post chain away,
so on a machine that never had one it had nothing to do and returned
immediately. That machine was the CPU rasteriser: the one class in the
product demonstrably unable to render this scene, measured at 235 ms a
frame with the map live against 16.5 ms with it paused. The governor that
exists to catch exactly that was switched off on exactly that path, and the
file's own comment claimed "the quality governor already has coarser levers
for the machines that need them" while both of those levers were already at
their floor from frame one. There were no levers left at all.

So there is a second governor, it runs everywhere, and it has levers that
still exist on the plain path. It measures WALL CLOCK over a 400 ms window
— at 235 ms a frame that is three frames, so a machine in trouble is helped
inside a second rather than inside the twelve seconds a 45-FRAME count used
to take. Degradation is one-way, because a board that flickers between two
levels of detail is worse than either.

The rungs, measured on the audit harness's CPU rasteriser at 1920x1080 with
a full board, and ordered by saving per unit of image given up:

  0  229 ms   everything on
  1  159 ms   BACKING STORE AT 0.8. Thirty-six percent fewer pixels for a
              mild softening: nothing changes shape, nothing changes hue,
              no mark is lost. Biggest saving for the smallest change on
              screen, so it goes first.
  2  ~140 ms  NO BLENDING ON THE UNEXPLORED FIELD. The fog cells are the
              largest fill in the frame and they were drawn transparent,
              which costs a blend per fragment and forfeits early-z on
              exactly the surface that covers the most pixels. Made opaque
              they keep their haze, their chamfer and their depth falloff,
              and the albedo is lifted to land on the same value.
  3  115 ms   BACKING STORE AT 0.62, and the per-world cloud shell off.
              This is the rung that genuinely costs image, which is why it
              is last and why it needs the machine to have failed three
              windows in a row to get here.

What is NEVER shed, at any rung: the ownership hue on a plate, the sector
number, the fleet badge, the hazard hatch, the unexplored:charted value
step, or the class hue and size ramp of a world. Those are the board's
read. A prettier frame that is harder to read is a regression — and so is
a faster one.
------------------------------------------------------------------

## A hidden tab is throttled to about one frame a second by the browser

<a id="a-hidden-tab-is-throttled-to-about-one-frame-a-second-by-the"></a>

A hidden tab is throttled to about one frame a second by the browser.
Measuring that and concluding the machine is slow would cost a player
who alt-tabbed during loading the whole chain for the rest of the
session — and would drop it out from under a player who alt-tabbed
later. Neither is a statement about their hardware.
Same reasoning as the detail cap, and the same measurement behind it:
while the forge's threads are saturating the CPU, EVERY machine looks
like it cannot afford a post chain, and dropping the chain is
permanent. A GPU that holds a locked 16.6 ms once the board is built
had its bloom taken away on the strength of frames it spent waiting for
its own background bake. Decide when the machine is doing the thing it
will be doing for the rest of the session.

## The scene key, as a direction. ONE definition: the DirectionalLight is

<a id="the-scene-key-as-a-direction-one-definition-the-directionall"></a>

The scene key, as a direction. ONE definition: the DirectionalLight is
placed from it and every projected contact shadow is cast along it, so a
shadow can never disagree with the light that is supposed to have thrown
it. Normalisation is not needed — only the x/y and z/y ratios are used.

## The direction the rig looks, as a ratio. The camera never rotates — it

<a id="the-direction-the-rig-looks-as-a-ratio-the-camera-never-rota"></a>

The direction the rig looks, as a ratio. The camera never rotates — it
sits at camTarget + (0, d*0.92, d*0.5) and looks back at the target — so
this is a constant of the view, and anything that has to be staged where
a LIFTED object appears on screen (a star's light pool, a contact
shadow's screen-space check) derives its offset from it rather than from
a hand-tuned nudge that only holds at one zoom.

## How high a star's photosphere floats above the plate it belongs to. This

<a id="how-high-a-star-s-photosphere-floats-above-the-plate-it-belo"></a>

How high a star's photosphere floats above the plate it belongs to. This
is a registration constant, not a taste one: the deck pool below the body
is offset along VIEW_DIR by exactly this lift, so the two land on the same
screen pixel. Change one and the star separates from its own light again.

## Unit hexagon corners, flat-top: vertices on +/-X, flat edges facing +/-Z

<a id="unit-hexagon-corners-flat-top-vertices-on-x-flat-edges-facin"></a>

Unit hexagon corners, flat-top: vertices on +/-X, flat edges facing +/-Z.
Wound CLOCKWISE in (x, z) — which is counter-clockwise seen from above —
so every fan and strip built from this array comes out facing +Y and needs
no side:DoubleSide rescue on a lit material.

## The deck plate: brushed gunmetal with an embossed hexagonal frame, corner

<a id="the-deck-plate-brushed-gunmetal-with-an-embossed-hexagonal-f"></a>

The deck plate: brushed gunmetal with an embossed hexagonal frame, corner
rivets and stencilled register ticks. Painted in GREYSCALE so the per-status
tint can be applied with material.color without fighting a baked hue.

Returns { map, normalMap }. The plates are Blinn-Phong, so roughness and
metalness are scalars and there is no third map to pay for.

## The machined rim: the chamfer lip, the parting groove and the side wall

<a id="the-machined-rim-the-chamfer-lip-the-parting-groove-and-the-"></a>

The machined rim: the chamfer lip, the parting groove and the side wall,
painted as ONE horizontal band in the strip of the image the top face's
UVs can no longer reach. The wall quads walk this band along u, so each
one samples a run of purpose-built rim rather than a stretched column of
whatever happened to be under it on the top face.

## How strongly hex edge `i`'s outward face turns toward the key light

<a id="how-strongly-hex-edge-i-s-outward-face-turns-toward-the-key-"></a>

How strongly hex edge `i`'s outward face turns toward the key light,
-1..1. The rim strip's u axis is CUMULATIVE PERIMETER, so edge i owns
exactly the u range [i/6, (i+1)/6] — which means the six chamfer facets
can each be painted at their own value, and the bevel is then sold by a
value step rather than by a hairline.

## A plate albedo carrying a stencilled hazard code. Composited over the

<a id="a-plate-albedo-carrying-a-stencilled-hazard-code-composited-"></a>

A plate albedo carrying a stencilled hazard code. Composited over the
finished base plate so the (expensive) grain pass and Sobel derivation are
paid once for the whole board; the stencil is PAINT, so it correctly has
no relief and shares the base normal map.

## Unexplored space. It has to be SEEN — an earlier revision multiplied a fog

<a id="unexplored-space-it-has-to-be-seen-an-earlier-revision-multi"></a>

Unexplored space. It has to be SEEN — an earlier revision multiplied a fog
colour by a near-black tile and about a hundred of the hundred and twelve
tiles rendered as literally nothing, so the main map showed the player no
galaxy shape at all. This is a luminous sensor-haze, painted bright, and it
is layered onto the plate as an EMISSIVE map so the plate relief survives
underneath it and the haze can drift on its own uv transform.

## Stars as points, with a real colour-temperature spread and a heavy-tailed

<a id="stars-as-points-with-a-real-colour-temperature-spread-and-a-"></a>

Stars as points, with a real colour-temperature spread and a heavy-tailed
brightness distribution: many faint, a handful bright enough to clip into
the bloom pass. `radiusScale` places them on a shell around the camera
(fixed sky) or `spread` scatters them through the board volume (parallax).

## A black hole is instant fleet death, so it has to be the most unmistakable

<a id="a-black-hole-is-instant-fleet-death-so-it-has-to-be-the-most"></a>

A black hole is instant fleet death, so it has to be the most unmistakable
object on the board: an event horizon that eats the starfield behind it, a
Doppler-brightened accretion disc, and a photon ring that survives being
looked at from any angle because it is billboarded.

## Accretion disc. Painted per-pixel because the three things that make it

<a id="accretion-disc-painted-per-pixel-because-the-three-things-th"></a>

Accretion disc. Painted per-pixel because the three things that make it
read — a temperature ramp from the ISCO outward, angular shear streaks,
and relativistic beaming that brightens the approaching limb — are all
functions of (r, theta) and none of them are expressible as a gradient.

## A real star: granulated limb-darkened photosphere, corona with streamers

<a id="a-real-star-granulated-limb-darkened-photosphere-corona-with"></a>

A real star: granulated limb-darkened photosphere, corona with streamers,
and a wide glare veil, all from the shared generator. The photosphere is
authored well above white so the bloom pass has something to find — that
is the difference between a light source and an orange circle.

## Screen pixels per world unit at the camera's current distance. The canvas

<a id="screen-pixels-per-world-unit-at-the-camera-s-current-distanc"></a>

Screen pixels per world unit at the camera's current distance. The canvas
height comes from the cached value resize() records rather than from
getBoundingClientRect: this is called every frame, and a layout read in
the frame loop stalls the main thread on every style change the HUD makes.

## The rung-3 sweep, a slice at a time. Sixteen tiles a frame finishes a full

<a id="the-rung-3-sweep-a-slice-at-a-time-sixteen-tiles-a-frame-fin"></a>

The rung-3 sweep, a slice at a time. Sixteen tiles a frame finishes a full
board inside a fifth of a second and costs a fraction of a millisecond per
frame, which is the difference between a governor that helps and a governor
that hitches.

## Anything on the main thread that took longer than a frame, with a name

<a id="anything-on-the-main-thread-that-took-longer-than-a-frame-wi"></a>

Anything on the main thread that took longer than a frame, with a name.

"8261 ms of long tasks" is a fact you cannot act on; "the plate atlas cost
640 ms and the star maps 507" is one you can. Capped and cheap, and read
back through debugRenderPath() so a harness can attribute a hitch instead
of merely reporting it.

## Run at most one boot step. True if there is still work left after it

<a id="run-at-most-one-boot-step-true-if-there-is-still-work-left-a"></a>

Run at most one boot step. True if there is still work left after it.

A step may return 'again' to be called back on the next frame instead of
being stepped past — which is how a bake too big for one frame (the sky
dome, half a million texels of it) is spread across several without the
schedule having to know how many it will take.

## The class buildPlanet() would give this sector, or null when the sector is

<a id="the-class-buildplanet-would-give-this-sector-or-null-when-th"></a>

The class buildPlanet() would give this sector, or null when the sector is
not a world at all (a belt, a star, a black hole). Mirrors the branch in
rebuildContent() and the clamp in buildPlanet(); if either moves, this
moves with it.

## The same assembly createPlanetObject() does — surface, cloud shell

<a id="the-same-assembly-createplanetobject-does-surface-cloud-shel"></a>

The same assembly createPlanetObject() does — surface, cloud shell,
atmosphere shell, and the light plumbing that points a world at its star —
over materials that were generated on the other thread. Kept deliberately
literal against that function so the two cannot drift into two different
looking worlds.

## Roughly how light the finished plate is, 0..1. Used to decide whether the

<a id="roughly-how-light-the-finished-plate-is-0-1-used-to-decide-w"></a>

Roughly how light the finished plate is, 0..1. Used to decide whether the
sector number should be painted light-on-dark or dark-on-light: on the gold
homeworld plate the white glyphs were the lowest-contrast text on the
board, which is the one tile you can least afford not to be able to name.

## A STAMPED STEEL TAB, not a hologram pill

<a id="a-stamped-steel-tab-not-a-hologram-pill"></a>

A STAMPED STEEL TAB, not a hologram pill.

The old badge was a translucent roundRect with a 4px accent stroke — the
banned look — and it sat on top of the planet's northern hemisphere. This
is a bolted plate in the same palette as the tiles: a dark groove under a
bright top lip, a rivet at each end, and mono glyphs stencilled into it.

## A slender six-sided dart, nose along +Z

<a id="a-slender-six-sided-dart-nose-along-z"></a>

A slender six-sided dart, nose along +Z.

Four sides and a wide base gave a hull that, seen nose-on — which is what
happens every time a fleet flies down the screen toward the camera —
silhouetted as a big flat triangle rather than a ship. Six sides and a
much longer taper keep a readable silhouette from any bearing.

## The ribbon has THREE vertices per rib — left edge, spine, right edge —

<a id="the-ribbon-has-three-vertices-per-rib-left-edge-spine-right-"></a>

The ribbon has THREE vertices per rib — left edge, spine, right edge —
not two. With two, the strip has a hard boundary across its width and a
fleet flying toward the camera renders as a solid translucent wedge; with
a dark left and right and a hot spine the cross-section falls off and it
reads as a streak of light at every angle.

## The minimum angle, in radians, between a fleet's ground track and the

<a id="the-minimum-angle-in-radians-between-a-fleet-s-ground-track-"></a>

The minimum angle, in radians, between a fleet's ground track and the
camera's own ground axis. Below this the hull is presented END-ON and a
dart seen down its own axis is a featureless truncated cone with two
collars — which is exactly what parked over sector 10's ID plaque and
erased the number.

## Work out how far to slide the rendered world so the camera target appears in t

<a id="work-out-how-far-to-slide-the-rendered-world-so-the-camera-t"></a>

Work out how far to slide the rendered world so the camera target appears in the
middle of the un-occluded band rather than the middle of the canvas. The camera
looks along -Z with a fixed downward tilt, so screen-right is world +X and
screen-down is world +Z, stretched by the tilt.

## Build the post chain. ONLY EVER CALLED ON A MACHINE THAT HAS BEEN MEASURED

<a id="build-the-post-chain-only-ever-called-on-a-machine-that-has-"></a>

Build the post chain. ONLY EVER CALLED ON A MACHINE THAT HAS BEEN MEASURED
AFFORDING IT — see governPost(). Everything in here is therefore allowed to
assume a real GPU; there are no "unless the renderer is slow" branches left
inside it, because the slow renderer never gets here.

## Build the post chain out of band

<a id="build-the-post-chain-out-of-band"></a>

Build the post chain out of band.

Compiling bloom's five mip levels plus FXAA is tens of milliseconds of
shader compilation, once. Spending it in idle time keeps the upgrade from
landing in the middle of the drag the player started the moment the map
became responsive — which is exactly when this fires.

## Which render path this machine ended up on, and why

<a id="which-render-path-this-machine-ended-up-on-and-why"></a>

Which render path this machine ended up on, and why.

The path is now CHOSEN BY MEASUREMENT, which means "does it look right"
and "is it fast" are two different questions with two different answers
per machine, and a perf harness that cannot read this back is guessing
about which one it just photographed.

## THREE DIFFERENT QUESTIONS, BECAUSE THEY HAVE THREE DIFFERENT ANSWERS

<a id="three-different-questions-because-they-have-three-different-"></a>

THREE DIFFERENT QUESTIONS, BECAUSE THEY HAVE THREE DIFFERENT ANSWERS.

isReady() keeps its old meaning — the renderer exists and a grid has
been laid out — because other files already call it and it is the right
gate for "may I call updateSector". It is NOT the right gate for a
loading state: it went true before a single pixel had been drawn.

