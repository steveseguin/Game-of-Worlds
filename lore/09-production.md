# Production Scope — Artwork and Voice

Status: **PROPOSED.** Q4 locked the authored Terran campaign to Rell, but the shipped multiplayer
advisor now has twelve race-specific text registers. Decide the channel boundary in `STATUS.md`
before commissioning voice work. Honest estimates, not encouraging ones.

You asked for artwork and voice-over. Both are achievable. Both are also where narrative
projects quietly die, because the writing is cheap and the assets are not. This document exists
so that when we commit, we commit to a *list* rather than to a vibe.

---

## Voice

### The asset list

| Item | Lines | Notes |
|---|---|---|
| Rell — event feed | ~108 | About 36 events, generally three written variants; rare events use one |
| Rell — mission briefings | 60–90 | 11 missions, opening and closing beats |
| Rell — campaign beats | 30–50 | Scripted story moments, including the slip in mission 10 |
| **Written Rell baseline** | **~200–250** | One performer if Rell remains the campaign and feed voice |
| Multiplayer adjutants | **decision required** | Twelve text registers ship today; do not record all twelve by accident |
| Named cast | — | *Cut from the baseline.* Rell quotes Vance, Ito, Fourth, Keth, Nine and the Emissary |

Most of Rell's lines are one sentence. A competent performer can record this baseline in
well under a day given a clean script and a good director; the expensive part is not the studio,
it is **the script being finished before the session.** Rewriting after recording is where
budgets go.

### Why one voice is the right answer

A single recurring narrator attached to an event feed is the highest-return narrative device
available to a project this size. It requires no cutscene system, no lip-sync, no animation
budget, and no new UI — the commander feed already exists in the art direction with idle,
talking, alert and static states. Rell is the difference between an event log and a *character
reading you an event log*, and that difference is most of what people will remember.

And the constraint pays a creative dividend rather than costing one. Because Rell is the only
voice, **every other character is quoted by Rell** — which gives us the player's read on Vance,
Ito, Keth, Fourth and the Emissary filtered through an adjutant who has an opinion about all of
them. That is more characterisation per line than voicing them would buy, and it is how radio
drama has always handled a large cast on one microphone. The rule and its writing constraints
are in `05-characters.md`.

Twelve fully voiced races is a studio project. If the budget ever grows, spend it on more Rell —
not on a second voice.

### Practical notes

- **Record the tic correctly.** "Did not arrive" must be delivered as *habit*, flat, with no
  weight on it. A performer's instinct will be to find the pathos. Direct them out of it — the
  pathos is in the repetition, and any emphasis kills it.
- **Alert state is quieter, not louder.** Direct explicitly, because it is counter to instinct.
- **Number-heavy lines need pickups.** Fleet counts change with balance passes. Record numbers
  as separate short takes wherever a line contains one, or write the lines to avoid them.
- **Synthesis:** viable for the event feed if the licence is clean, and *not* viable for the
  Emissary or Fourth, whose characters are entirely timing and hesitation. A hybrid is
  defensible: synthetic feed, human for the six scenes that carry the story.

---

## Artwork

### The asset list

The command-station direction in `docs/art-direction/` is a gift here, because a fixed,
pre-rendered, bitmap-first interface means most assets are **stills**, and stills are the cheapest
thing an artist makes.

| Item | Count | Notes |
|---|---|---|
| Rell portrait states | 4 | idle / talking / alert / static. The single most important asset in the project |
| Race crests | 12 | Small, iconic, must read at 32px. See the insignia notes in each bible — the Terran filing tab, the Mechanicus shift number |
| Race leader portraits | 12 | Briefing-screen style, stylised, non-photoreal per existing direction |
| Mission briefing stills | 11–22 | One or two per mission. Pre-rendered, scanline pass over the top |
| Story beat stills | 6–8 | The relay at Anselm, the lit lane, the dead Lamp, the docking schedule with a gap in it |
| Ship silhouettes | 9 × 12 | **The expensive one.** Nine hull classes across twelve races is 108 designs |

### Where to spend and where not to

**Spend on:** Rell's four states, the twelve crests, and the six story stills. That is 22 assets,
and they carry essentially the whole narrative experience.

**Do not spend on:** 108 ship designs. Do what the era this game is imitating did — design **one
silhouette language per race** (the Mechanicus quilt, the Terran box-with-a-handle, the Titan
mass) and recolour and rescale across hull classes. Nobody has ever complained that two
destroyers from the same navy looked similar.

**Defer:** leader portraits. They are needed only if diplomacy gets a face, and diplomacy is
currently deferred in the roadmap anyway.

### The two art ideas worth protecting

Both are in the race bibles and both are free — they cost nothing extra to draw, and each says an
entire civilisation in one image:

1. **The Terran clipboard.** They are the only power in the galaxy with physical paper. Put filed
   hardcopy and a wall of index drawers on the Terran command deck. In a genre where every bridge
   is a hologram, a clipboard is the most distinctive object we could possibly put on screen.
2. **The Mechanicus quilt.** They never replace a hull, they patch it. Plate from four eras,
   mismatched alloys, weld over weld. A veteran Mechanicus dreadnought reads as a palimpsest, and
   it makes "twelve hulls returned for reshaping" visible without a word of text.

---

## Order of work

If narrative production starts, this is the sequence that fails most gracefully — each step is
useful even if the next one never happens.

1. **Decide the voice-channel boundary.** Rell-only campaign and faction adjutants in multiplayer is
   the least destructive reconciliation of canon and shipped UI.
2. **Integrate one event-feed slice as data.** Use the written variants in `17-the-feed/`, with
   `sectorLabel()` resolving chart names, and prove rotation without scattering more literals.
3. **Build one vertical campaign slice.** Missions 1, 2 and 4 are already scripted in
   `06-campaign.md`; choose one actual delivery target before producing assets.
4. **Draw Rell.** Four states. The campaign now has a narrator.
5. **Lock the script, then record.** Recording before the event and mission paths are stable turns
   every copy edit into a paid pickup.
6. **Everything else.**

Note what step 2 means: **the first deliverable of this entire story project is better text in
the existing game, and it requires no permission from any other system.** If the campaign never
gets built, that step still pays for itself.
