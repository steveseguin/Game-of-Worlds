# Wonders, Signature Technologies, and Signature Hulls

Status: **DESIGN PROPOSAL**, not lore. Everything here needs a mechanics conversation and a cost
estimate before it becomes canon. The fiction is solid; the numbers are placeholders and are marked
as such.

The engine already has the hook: `VICTORY_CONDITIONS.WONDER` exists in `server/lib/victory.js` and is
disabled with the note *"Disabled until Galactic Wonder construction is implemented."* This folder is
what would go in it.

---

## The spine

Twelve Wonders, and they are not twelve unrelated trinkets. **Each one is that race's answer to the
dark, taken to its absolute conclusion** — a different attempt to end the Dimming, built out of that
civilisation's single deepest conviction.

Which means the set does thematic work no individual Wonder could:

> **Eleven of the twelve reopen the road. One makes the road unnecessary, and it is far too slow for
> anyone to choose. And one closes the road forever, and the people who would build it have to spend
> themselves to do it.**

| # | Race | Wonder | Their answer, taken to the end |
|---|---|---|---|
| 1 | Terran | **The Concord Lamp** | We wrote it down, so we can rebuild it |
| 2 | Silicon | **The Solved Sky** | If you cannot see it, compute it — all of it |
| 3 | Zephyr | **The Ten Thousand Mouths** | Do not survive the dark. Outbreed it |
| 4 | Crystalline | **The First Thickness** | We are made of the same substance. One of us can *be* a Lamp |
| 5 | Void Walkers | **The Whole Recitation** | Write it down. All of it. Break the only law we have |
| 6 | Mechanicus | **The Endless Yard** | Do not look, do not stop, and never finish |
| 7 | Bioform | **The Mother Grove** | Do not relight the road. Make it unnecessary |
| 8 | Star Nomads | **The Reconciled Schedule** | Finish the count. Every name, every route |
| 9 | Ancients | **The Closing** | We did it once badly. Do it properly, and end ourselves doing it |
| 10 | Quantum | **The Unresolved Lane** | Decline to have needed a road |
| 11 | Titan Lords | **The Weight of Ages** | Be so large the dark is weather |
| 12 | Shadow Realm | **The Assembled Frame** | Buy back all eleven fragments and finally read them |

---

## Shared rules — enforced, and the same for everyone

The point of a rule set is that a Wonder is a *commitment*, not a prize.

**1. One per empire per game.** You build your own or none. You cannot capture and operate another
race's Wonder — you can only destroy it. Wonders are not loot.

**2. It requires the race's third signature technology, and relics.** Each race's unique tech line
ends in a capstone that is one of the two prerequisites. The other is a number of **relics** —
`08-open-questions.md` Q10, which is the authority.

*Amended 2026-07-26.* This rule used to read *"and nothing else. No shortcuts, no purchase, no
trade,"* and both halves of that are now wrong. The research gate alone meant the endgame was bought
with economy and nothing else, so every game's Wonder race had the same shape; the relic gate adds
geography and history, because you also have to have held and developed the right ground. And relics
can change hands — by conquest, and physically by lifter, which means a relic can be given. So the
prerequisite *is* partly purchasable now. That is a real departure from the original intent and it
was accepted deliberately: a prerequisite you can be helped towards is what stops bad map luck from
being unanswerable.

**3. It occupies one held sector and it cannot be hidden.** Construction is **announced to every
player, with its sector, on the turn it starts** — not merely visible to whoever happens to have
line of sight. Q10f made this stronger than it was, and the fiction pays for it without any
intelligence having to leak: a Wonder is a Lamp being relit. It is a light. Everybody can see it.

There is exactly one exception — the Shadow Realm's, which has no site — and that exception is the
whole point of the Shadow Realm. **It announces a count instead of a coordinate** (Q10g): the galaxy
is told how many of the eleven fragments the Assembled Frame has recovered, updated as that changes,
and never where. That is a harder clock to ignore than a sector, not a softer one — *"somebody has
begun in sector 34"* can be discounted by anyone far away; *"seven of eleven"* cannot be discounted
by anybody. And the race that refuses to be counted becomes the only empire the galaxy counts, which
is the reason it is right rather than a consolation for having no site.

They remain stoppable, differently: the Frame's progress **is** the relics held, and a relic transfers
with the ground, so there is no site to besiege and up to eleven worlds to take, each setting them
back by one.

**4. Maintenance is mandatory, per-turn, and it hurts.** Every Wonder has an upkeep, and every
upkeep is denominated in the thing that empire can least afford. Miss it and the Wonder goes
**dormant** — effects off, work preserved. Stay dormant too long and it is **lost**, and the
investment goes with it.

**5. It can be attacked, and it is the highest-value military objective in the game.** A Wonder
sector should be the thing whole wars are fought over. Nothing about a Wonder makes its owner safe.

**6. It does not win by existing — it wins by being finished under fire.** A **finished** Wonder is
the victory (Q10f, and `victory.js`'s dormant `WONDER` condition, which is written that way). What
this rule was protecting is nonetheless intact, because the requirement moved rather than vanished:
construction takes many turns and is announced to everybody with its location on turn one, so
finishing means surviving a siege the whole galaxy was invited to. A player with no army does not get
a finished Wonder.

*Amended 2026-07-26, and the amendment is worth understanding rather than skimming.* This rule used
to read *"a Wonder makes a victory condition reachable — it is an accelerant, not an autowin. A
player with a finished Wonder and no army still loses,"* and that was written when build time and
hold time were separate. Q10f deliberately collapsed them into one clock. The letter of the old rule
is therefore wrong; its intent survives, front-loaded into the build.

**Settled, Q10h: completion is the victory.** The alternative — hold a *finished* Wonder for a further
N turns — was rejected on play rather than on tidiness. It adds an endgame phase in which the outcome
is already decided and the game continues, which is the shape that makes players concede instead of
play. It also needs a second piece of state and reintroduces a bug that build-is-hold removes for
free: a clock measured from completion outlives the ground it stands on, so a captor inherits it.

**7. Every Wonder has a stated danger, and the danger is narrative, not a debuff.** It is what
happens to the galaxy if this is the one that gets finished. The campaign uses these. Skirmish play
never has to mention them.

---

## Signature technologies — shared rules

Three per race, and they sit **inside branches that race is good at**, never in a locked one. They
are not extra levels of existing techs; they are exclusive capstones nobody else can research, and
the third is always the Wonder prerequisite.

- Each obeys `../11-laws-of-the-world.md` without exception. Nothing here lets anyone see into a
  sector, survive a collapsar, shield a shoal, or move faster than blind.
- Each is expensive enough to be a real choice against the ordinary tree, not a free bonus.
- Each is named the way that race would name it. The Mechanicus do not have a *Doctrine*; they have
  a *Standing Order*.

## Signature hulls and weapons — shared rules

Three per race. Ship type ids 1–9 are taken in `combat.js`, so these are **new exclusive hulls or
weapon fits** and they need engine work — this is the most expensive part of this folder and it
should be the last thing built, if ever.

- A signature hull must **not** hand a race the capability its access profile denies it. The
  Mechanicus signature hulls contain no scout and no intruder. The Titans' contain nothing small.
  The Swarm's contain no capital. **The refusals hold** — a Wonder pass is exactly where a setting
  usually breaks its own rules, and we are not doing that.
- Each should be recognisable in silhouette per that race's art notes.
- Weapons are fits, not hulls, where that is the more honest description.

---

## What this costs to build, honestly

In rough order of expense:

1. **The fiction** — done, in these files. Free.
2. **Wonder construction as a building type** with a multi-turn progress track, a per-turn upkeep
   check, dormancy, and a destruction path. Moderate: it is a building with a state machine.
3. **Twelve Wonder effects.** Highly variable. Some are near-trivial (a production multiplier, a
   movement discount). Some are substantial (Silicon's map reveal, Bioform's hazard conversion,
   Mechanicus's autonomous expansion). **Three or four of the twelve would carry most of the value** —
   see the recommendation below.
4. **Thirty-six signature technologies.** Cheap individually — the tech system is data-driven, and
   these are new entries with `raceExclusive` and new effect slots.
5. **Thirty-six signature hulls.** Expensive. New ship ids, new art, new balance surface, and a
   combat system that already has nine hulls to keep honest.

**Recommendation: build four Wonders first.** The Concord Lamp (the canonical one, and the campaign's
mission 9), the Mother Grove (the thematic keystone — the correct answer nobody will wait for), the
Endless Yard (the horror beat), and the Solved Sky (the cleanest mechanical effect: fog of war ends).
Those four prove the system, cover the four most distinct effect types, and carry the entire story.
The other eight are content, and content can wait.
