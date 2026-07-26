# Naming the Dark — the co-authorship proposal

Status: **SHIPPED.** 2026-07-26. The proposal below is preserved as written; the section
immediately after it records what the engine actually does and where it departs from this document.
Where the two disagree, the code wins and this file is wrong.

---

## What shipped, and where it differs from the proposal

The feature is live: `nameSector` in `server/server.js`, `public/js/name-picker.js`, the prompt markup in
`game.html`, and the `namechoice::` / `//namesector` pair in `server/lib/websocket-protocol.js`. It is
covered by `tests/name-sector-handler.test.js` (11), `tests/map-naming-schema.test.js` (10) and
`tests/e2e/name-picker.spec.js` in a real browser.

**Kept as proposed:**

- Naming fires on the sweep, and only on a sweep. Rule 1 holds exactly.
- The cost leads the prompt — *"4 hulls did not arrive at C8"* — which was the best beat in this
  document and the reason for the feature. A clean sweep gets its own line rather than "0 hulls".
- The name survives conquest. Enforced with `COALESCE` in the sweep's UPDATE, and pinned by a test
  whose only job is to fail if somebody writes a bare `SET sectorname`.
- The namer and authoritative game turn are recorded (`namedby`, `namedturn`) and shown in the map
  tooltip.
- The chart identity travels in both focused `sector::` detail and compact `mapstate::` snapshots, so
  every player who can see or remember the sector sees the same permanent entry.

**One deliberate departure:**

1. **You choose from six names; you do not type one.** The proposal says *"you name it"*, which reads as
   free text. Free text on a permanent, shared, stranger-visible object is a moderation queue with a game
   attached, and this project has no moderation. So the server generates six candidates from the charting
   vocabulary, the wire carries an **index**, and no string a client sends can ever become a name. The
   creative act is smaller and it is real; the alternative was not shipping. See `server/lib/sector-names.js`.

The sweep writes a default immediately, so ignoring the prompt never leaves a bare hex. The player gets
one curated replacement during the grace window; `namechosen` closes the choice permanently as soon as it
is used. The grace window is measured from `gameState.turns`, the engine's authoritative turn counter.

**One valuable extension remains:** Rell uses the name in the sweep confirmation, but the rest of the
feed still says the hex. Rule 5 — *"after twenty turns the player's own event log is written in their own
vocabulary"* — is where this feature could stop being a moment and become the texture of a campaign.

**Bugs found and fixed during delivery:** the sweep announced the freshly generated default name even
when `COALESCE` had kept an older one. Harmless while the default was the only name a sector could have,
and a lie the moment players started choosing. The confirmation now reads the name back out of the table.
The first picker implementation also read a nonexistent `activeGames[gameId].turn`, which recorded every
name on turn 1 and left the intended window open forever; both the sweep and picker now use
`gameState.turns`. Finally, the first picker allowed repeated changes inside that window and only sent
chart identity in focused sector detail. `namechosen` makes the choice one-shot, and `mapstate::` now
carries the permanent chart identity to every entitled map.

---

## Why this exists

The audit found that of the four disciplines we looked at, the one we had learned **nothing** from was
tabletop. Its central lesson is that an incomplete world the audience *visits* beats a complete world they
*admire* — that player agency turns spectators into participants, and that the story worth remembering is
the one that emerged from what somebody chose to do.

`lore/` currently contains a hundred thousand words in which the player fills in nothing, names nothing,
and claims nothing. It is a museum with excellent labels.

And the fix has been sitting in the naming conventions since Pass 1, unnoticed:

> **Named places are named after the ship or captain that first survived them.** *Anselm's Reach. The Vail
> Shoal. Kettering.* This is how real charts work, and it embeds the theme in the map: every named place in
> the galaxy is named after somebody's expensive mistake.

The player does that constantly. They sweep shoals. They pay in hulls. **And every sector on their map is
a hex number.**

---

## The proposal

**When you sweep a shoal, you name it. Once. Permanently. And everyone who can see the sector sees your
name for it.**

That is the whole feature. It is the cheapest marriage of lore and mechanic available anywhere in this
folder, and it converts the setting's central theme from a thing the player reads into a thing the player
does.

### The moment

The naming prompt fires on the existing sweep event — currently
`Success: We secured the asteroid belt in sector ${sectorId} - our fleets can pass safely now.` — and it
**shows the cost first.**

> **Four hulls did not arrive here.**
> The shoal at 6-B is swept. It is a road now and it will stay one.
> *What is it called?*

That is the theme as a UI moment: you are being asked to name a place after what it cost, at the exact
instant you find out it was worth it.

### The rules

1. **Only swept shoals can be named.** Not planets, not homeworlds, not empty space. The naming right is
   *earned by the sweep*, which is what makes it mean anything.
2. **One name, permanent, no edits.** A chart entry is not a preference.
3. **The name survives conquest.** If another empire takes the sector later, **they inherit your name for
   it.** This is the best detail in the proposal: every named place in the galaxy becomes somebody else's
   expensive mistake, spoken aloud by the people who took it from them.
4. **The namer is recorded and shown.** *"6-B — Halloway's Bar. Named by the Terran Empire, turn 34."*
5. **Rell uses it.** Once a sector has a name, the feed uses the name instead of the hex. This is where the
   feature stops being cosmetic: after twenty turns the player's own event log is written in their own
   vocabulary.

---

## What it costs, honestly

**Schema — DONE, 2026-07-26.** `map${gameId}` now carries `sectorname VARCHAR(48)`,
`namedby INT`, `namedturn INT` and `namechosen TINYINT`.

**And a correction to what this document originally said.** It instructed a future implementer to
add the columns to *both* `server/server.js` and `server/setup.js` "which must be changed
together." That was wrong, and following it would have been harmless but pointless: the two
declare **different tables**. The live schema in `server.js` uses `type` and `owner`;
`setup.js` uses `sectortype`, `ownerid`, `colonized`, `orbitalturret`. They diverged long ago and
`setup.js`'s copy is dead. Only the `server.js` definition matters.

The real pairing is different and easy to miss: **`CREATE TABLE IF NOT EXISTS` covers new games
only.** Games that already exist need the `ensure*` migration chain, or the first query naming a
new column fails for every one of them. Both are now done — `ensureMapTableColumns` is the last
link in the chain — and `tests/map-naming-schema.test.js` asserts they agree, that the migration
is actually reachable, and that the sweep writes `sectorname` with `COALESCE` so a name is never
overwritten on recapture.

**Wire — DONE.** The server offers six curated candidates with `namechoice::`; the client submits their
index with `//namesector`. Existing `sector::` and `mapstate::` payloads carry the chosen name, namer and
turn. No client-supplied name is accepted.

**Client — DONE.** The tooltip renders the chart name, hex, classification, namer and turn. The prompt
leads with the cost of the sweep.

**Feed.** `17-the-feed/` lines take `${sectorId}` today. They would need a resolver that returns the name
when one exists and the hex otherwise — one helper function, called from the message composition sites.

That is genuinely small. The expensive part is the next section.

---

## The part nobody wants to talk about

**This is user-generated content on a public multiplayer site, and it is permanent, and other people see
it.** Free-text naming means somebody will name a sector something vile and it will sit on a shared map for
the rest of the game. Any proposal that skips this is not a proposal.

So the sequencing matters:

**Ship first — the curated namer.** The player is offered a short list of generated names and picks one, or
rerolls. Zero moderation burden, zero risk, and it is period-correct, because real charts are named exactly
this way: a surname and a feature. The generator draws on the setting's own vocabulary —

*Feature words:* Reach · Shoal · Bar · Crossing · Narrows · Margin · Gate · Sweep · Ground · Bank
*Possessive:* a name from the surviving fleet's crew roster, or the ship that took the fewest losses

→ *Ames's Reach. The Halloway Bar. Marn's Crossing. Vey Ground. Sten's Narrows.*

Picking from six is not authorship, but it **is** ownership, and the emotional beat — *four hulls did not
arrive here; what is it called* — works identically. This is one afternoon of work with no downside.

**Ship second — free text, gated.** A wordlist filter, a length cap, a report button, and one rule that
does most of the work: **an unreviewed name is visible only to the empire that gave it** until the game
ends or it is reported clean. Your chart says what you called it. Everybody else's says the hex, until it
has been looked at.

**Never ship** free text that is instantly public and permanent on a shared map. That is not a naming
feature, it is a moderation queue with a game attached.

---

## Why this one and not the other twenty ideas

Because it is the only proposal in this folder where **the fiction was already written and the mechanic
was already there**, and the two had simply never been introduced.

The lore says every named place is named after somebody's expensive mistake. The engine already tracks
exactly which hulls did not arrive, in which sector, on which turn, for which empire. All that was missing
was a text field and the manners to ask.

And it produces the thing a hundred thousand words of worldbuilding cannot: **a galaxy with the player's
handwriting in it.** Two hundred turns later somebody else's fleet crosses Halloway's Bar safely, and
nobody left alive knows who Halloway was, and that is precisely how the Trellis worked.
