# The Feed — Rell's Event Script

Status: **PRODUCTION SOURCE, PARTIALLY SHIPPED.** These files are keyed replacement copy for events
the game already emits. Some wording and the advisor presentation are live, but the full variant set
has not been integrated as a data layer and should not be described as delivered.

---

## The honest scope

I estimated 400 lines four times in this session. Having actually read the engine, that was wrong and the
truth is better: **`server.js` emits about 36 distinct player-facing events.** At three variants each
that is roughly 108 lines, which is one afternoon of writing and one short recording session — not a
production.

Every entry below is keyed to a real string. The current text is quoted verbatim from `server/server.js`
so a future pass can find it with a grep.

## The five rules

1. **Keep the `Success:` / `Error:` prefix exactly.** The client uses it for severity. Replace only the
   text after it.
2. **Keep every template variable, spelled identically** — `${sectorId}`, `${destroyedCount}`,
   `${building.name}`. If a variable disappears the line stops being true.
3. **Ships are destroyed. Crews did not arrive.** Rell's verbal habit, used as habit and never as
   emphasis. Nobody ever remarks on it. It appears in roughly a third of the lines and no more, or it
   stops being invisible.
4. **Number first, consequence second, recommendation third.** No adjectives. No scale words. If there
   is a number available, use it.
5. **Never editorialise on the player's decision.** Rell may restate a cost. That is as close to
   disagreement as they get. *"That was a clean crossing"* is the highest praise available.

## Variants

Three per event, marked **a / b / c**, rotated at random so the feed does not loop audibly. They are not
ranked — any of the three should be able to fire at any time.

Where an event is **rare and heavy** (total fleet loss, a mouth, the Wonder completing) there is **one
line only.** Rare events must not feel randomised.

## The files

| File | Events |
|---|---|
| `01-movement-and-hazards.md` | 12 — the heart of the game |
| `02-probes-and-intel.md` | 3 |
| `03-colonies-and-building.md` | 8 |
| `04-research-and-doctrine.md` | 7 |
| `05-battle.md` | 2 |
| `06-refusals.md` | 3 — and this is where the humour lives |
| `07-turn-and-victory.md` | 4 wire events, no `Success:`/`Error:` prefix |

## Implementation note

Nothing here requires an engine change. Every line is a drop-in string replacement at the site where the
message is composed. A variant rotation needs one helper — pick one of three by index — and if that is
not worth writing, ship variant **a** everywhere and the copy is still a large improvement on what is
there now.

The shipped client also has twelve race-specific advisor registers in `public/js/advisor.js`. That is a
real player-facing path, but it conflicts with the locked campaign rule that Rell is the only voice.
Resolve that channel boundary before recording: the current recommendation is Rell for the authored
Terran campaign and faction adjutants for ordinary multiplayer. See `../STATUS.md`.

This remains one of the cheapest ways to move lore into play. It is not the only delivered lore surface:
the Codex, map vocabulary, advisor, and chart naming are also player-facing.
