# The Unattributed

Status: **PROPOSED**, and it is a design document rather than a fiction one. The mechanics need a costing
conversation before anything here is canon. The naming and the canon fit are ready.

---

## Verdict

**Yes.** And the reason is not that it is a good idea in the abstract — it is that the setting has been
carrying this hole on purpose since Pass 1, and the code has been carrying the field for it since launch.

Three things already written assume it:

- *"Nobody alive built the Trellis. The Ancients **maintained** it. They did not build it."* Flagged in
  `12-civilisations/09-ancients.md` as **the campaign's central revelation**.
- Ancient installations have *"doorways slightly too tall, corridors slightly too wide, treads slightly too
  deep. They were built for something, and it is not what maintains them now."*
- *"Who built the Trellis"* is on the list of five things never explained (`26-encyclopedia.md`).

And `lib/map.js` rolls **`artifact = 1–5` on 25% of every colonizable world** and persists it to the map
table, where nothing reads it.

So this is not an addition. It is the thing three documents and one database column were already pointing
at.

---

## The naming problem, and why it matters

**"The Ancients" is taken.** Race 9, playable, present tense, attends councils. If the builders are also
called ancients the single most important distinction in the setting collapses — *maintainers are not
makers* — and the campaign's central revelation stops being a revelation.

**Recommendation: they have no name, and the absence is the characterisation.**

- **The Registry files them as `Unattributed`.** A classification, not a people. Perfectly Terran: seventy-four
  years of scholarship has failed to produce anything better than an administrative negative, and the fact
  that the galaxy's most literate institution cannot name them is worth more than any name would be.
- **Navigators call an artifact a *leaving*.** Plain, physical, faintly unpleasant. *"There is a leaving on
  that world."*
- **Nobody says "the Builders."** Or rather — everybody does, casually, and it is an assumption. We do not
  actually know they built the Trellis. We know they were there first and their things are in the ground.

Per Law 25's discipline: **a leaving is functional and unreadable.** You can use one. You cannot understand
it, and no assay has ever established what made it — not its chemistry, not its age beyond "older than the
instruments," and above all not its species. That is what keeps them from becoming a monster.

**On "millions of years."** Take it, and be glad of it. A gap of millennia makes them a lost civilisation —
something you could conceivably meet, negotiate with, or fight. A gap of millions makes them **geology**.
They cannot be a faction, cannot be a diplomatic partner, cannot arrive in act three. That is a much better
kind of absence and it protects everything else.

---

## What a leaving is

Not a weapon. Not a technology. **A part.**

The justification is already written, in `24-anthology/13-wonders.md`, in the Terran Wonder myth, and it
was written before this conversation happened:

> There is a drawer in cabinet forty-one and in the drawer there is a requisition form. It asks for eleven
> parts. Nine of them we can make. One of them we can make badly. **One of them nobody alive knows the name
> of, and the form does not describe it, because the person who filled in the form in BU 400 knew what it
> was and did not think to say.**

That is the leaving. The Concord's documentation is complete except for the parts it assumed you already
had. **Research recovers the documentation. A leaving supplies the assumption.**

This is the key design property and everything else follows from it: **a leaving does nothing on its own,
and cannot be reverse-engineered, and cannot be manufactured.** It is not a shortcut to a technology. It is
the component the technology takes for granted.

---

## The one change I would make to your proposal

You said *very small chance*, and *a key to unlocking uber tech*. Those two together are the design's only
serious flaw, and it is a bad one: **a low-probability roll gating a once-per-game identity object means a
player can be locked out of their own doctrine by luck.**

That is the single worst failure mode available. A player who rolls badly does not experience variance;
they experience the game refusing to let them play their empire.

**The fix is to make it an accumulator, not a lottery.**

A discovery yields **fragments**, not a finished artifact. A Wonder prerequisite needs *N* fragments. Small
chance per event, many events, so:

- **"Did I get lucky?"** becomes **"how fast did I get there?"** — which is a completely different and much
  better feeling.
- A player who develops aggressively arrives early. A player who turtles arrives late. **Nobody arrives
  never.**
- The variance lands on *timing*, which is strategy, rather than on *access*, which is punishment.

Everything else about your proposal I would keep exactly as stated.

---

## How discovery works

Your instinct — colonising, extraction, building — is right, and the code already supports it, because the
artifact value sits **on the world**, not on the player.

**Proposed, and every number is a placeholder:**

| Trigger | Why it is the right trigger |
|---|---|
| Colonising a world with `artifact > 0` | Reveals *that something is there*, not what. A survey note, no fragment. |
| Each **building** completed on that world | You dug a foundation. Rolls for a fragment. |
| Each **turn of extraction** on that world | Slow, steady, and it makes a Metal Extractor interesting beyond income. |
| **Spaceport upgrade** on that world | Cuts a new slip — the deepest excavation anybody performs. Best odds. |

Chance and fragment yield both scale with the world's `artifact` value, 1 to 5.

**Why this is better than a flat per-turn roll:** it ties discovery to *development*. A rich leaving-world
is a slow reveal that rewards investment, and the reveal lands mid-game when you are committed to that
world rather than turn three when you are not. It also gives the terraforming ladder a second meaning —
harsher worlds develop slower, so their leavings surface later.

**And it should be visible that something is there.** A world you have colonised should tell you it holds
*something* without telling you how much. That converts an inert database field into a reason to prefer
one world over another, which is the cheapest strategic depth available anywhere in this game.

---

## What it gates — my recommendation, and the one I would decline

You asked about both. My answer is **Wonders yes, race weapons no**, and the reasons are different.

### Wonders: yes, and it fixes a real weakness

`13-wonders/` currently gates each Wonder behind *"the race's third signature technology."* That is a pure
research gate — it means the endgame is bought with economy and nothing else, and every game's Wonder race
is the same shape.

A leaving gate adds **geography and history** to the endgame. You cannot simply tech to a Wonder; you have
to have held and developed the right ground. Two empires with identical research can be at very different
places, and the difference is *where they have been*.

It is also thematically inevitable. **A Wonder is an attempt to rebuild a piece of the Trellis, and the
Trellis was built by the Unattributed.** Of course you need a piece of their work. Terra's Lamp needs the
part the form did not describe. The Crystalline First Thickness needs to know what a Lamp's core *was*
before an elder can agree to become one. The Shadow Realm's Assembled Frame is already, in canon, a
buy-back of eleven fragments from eleven empires — so it already works this way and nobody noticed.

### Race weapons: no

Your doctrine is not a prize. The signature technologies and hulls in `13-wonders/` **are** each race's
identity — the Ringer *is* the Crystalline, Deceleration Doctrine *is* the Void Walkers — and gating
identity behind a find means a player can spend a whole game unable to be who they picked.

One gate is legible. Two gates on the same door is confusing, and the second one lands on the wrong object.

**A Wonder is a thing you build once, at the end, out of somebody else's leftovers. A race weapon is
yours.** Keep the distinction sharp.

---

## The bigger question you have opened, and my recommendation

If the Unattributed exist, canon has to decide — or deliberately not decide — how they relate to the thing
the quarantine holds. Three options.

**A · Unrelated.** The builders are long gone. The sealed thing is something else. Two separate mysteries.
*Clean, and it wastes the connection.*

**B · The sealed thing is one of them, or theirs.** One mystery, deeper. *Tempting, and it makes the answer
smaller: "the ancient evil was the ancient race" is the most-used move in the genre.*

**C · Recommended. The Trellis was always a containment, and the roads were a side effect.**

The Unattributed built a structure to hold something. It happened to make travel safe, so twelve
civilisations grew on it for a thousand years using it as infrastructure and never asking what it was for.
The Ancients inherited a maintenance role and performed it faithfully **without understanding the purpose**
— which is exactly what "maintainers, not makers" already means.

And in BU 61 they found out. The shutdown was not them breaking the roads. It was them discovering the
original function and **finishing what the builders started**, at a cost they have carried in silence for
seventy-four years because there was never a way to explain it that did not make it worse.

Why C is the strongest:
- It requires **no change** to anything already written. *"The lanes ran both ways and something was using
  them"* is already the Ancients' account, and under C it becomes their moment of comprehension rather than
  their discovery of a flaw.
- It explains why a leaving is the missing part of a **Lamp**: a Lamp is containment hardware that also
  lights a lane. That is why nobody can derive one, and why the piece you need is the piece nobody thought
  to describe.
- It makes every Wonder darker for free. Eleven empires are not just reopening a road. They are
  **dismantling a wall using parts of the wall**, and only the Bioform Collective — who have no Lamp
  programme and never wanted one — turn out to have understood.
- It keeps Law 25 intact. The thing is still never named, designed or shown. We have only changed what the
  *architecture* was for.

**What C must never do:** confirm it on screen. No document should state that the Trellis was a
containment. It should be *derivable* — from a leaving that is the wrong shape for a road, from the
Emissary's silence, from the fact that the Bioform were right — and never asserted.

---

## Risks, honestly

**1. RNG on an identity object.** Addressed by fragments, and it must stay addressed. If a later balance
pass converts fragments back into a single binary find, the problem returns.

**2. It gives players a reason to hate the map.** A player whose cluster rolls few artifact worlds is
behind through no fault of their own. Mitigations, and I would want at least two: **fragments are
tradeable** (which feeds the Nomad brokerage and the Shadow Realm's whole identity), and **a destroyed
enemy Wonder site yields fragments** to whoever razed it. Both turn bad luck into a diplomatic or military
problem, which is a problem a player can act on.

**3. It could turn the Ancients into a quest-giver.** It must not. Their canon is that they attend
everything and say nothing. The correct Ancient response to a player finding a leaving is **one line, in
the past tense, offering nothing** — and the fact that they clearly recognise it is the whole beat.

**4. Scope.** This touches map generation (already done), a new per-player fragment counter, a discovery
roll on three or four existing events, Wonder prerequisites, and probably a trade path. That is a real
feature, not a copy change. It should not be started until the delivery items already on the board are
shipped.

---

## What exists versus what is needed

**Exists today:** the `artifact` column in the live schema, the generator (25% of colonizable worlds, value
1–5), and a distribution that already works. Nothing reads it.

**Needed:** a fragment counter per empire; a discovery roll on colonise / build / extract / upgrade; a
reveal-that-something-is-there on colonisation; Wonder prerequisites reading fragments; and a decision on
whether fragments are tradeable.

**Needed first, and this is the honest sequencing:** none of it, until `17-the-feed/` is deployed and the
codex exists. The four lowest grades on the report card are all delivery, and this is a new feature. It is
a good idea that should wait its turn.

---

## Open questions for you

1. **Option A, B or C** on the relationship to the quarantine. I recommend **C** and it is the only one
   that requires no rewriting.
2. **Fragments or binary finds?** I strongly recommend fragments. Your *"very small chance"* survives
   intact — it just pays out in pieces.
3. **Tradeable?** I recommend yes: it turns map luck into diplomacy and it is the only mechanic that would
   make the Nomad trace-brokerage economy real.
4. **Do leavings appear anywhere except worlds?** The generator only rolls them on colonizable sectors.
   A leaving in a shoal or beside a mouth would be a strong story beat and would need a generator change.
5. **`Unattributed` and *leaving* — do those names work for you?** They are the load-bearing choice here,
   because everything else in this document depends on the builders never being called "the Ancients."
