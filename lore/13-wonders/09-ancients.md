# The Ancients — The Closing

*Numbers marked **[P]** are placeholders pending a balance pass.*

---

## The Wonder: **The Closing**

They did it once, badly, in a hurry, and it cost the galaxy the Unarriving and the Shortening and
seventy-four years of dark, and it is **still not finished** — the shell is expanding on its own and will
take nine hundred years to complete, and they cannot stop it and cannot speed it up.

The Closing finishes it properly. Now. Everywhere. Permanently.

It is not a structure so much as a **decision made physical**: every remaining Ancient installation, every
hull in the inventory, every unit still answering, committed at once to completing a shutdown that was
begun in BU 61 and has been propagating ever since. It is the only Wonder that consumes its builder.

There is no site to visit and no ceremony. The Emissary attends the council at which it begins, as they
have attended every council since AU 3, and says one thing, in the past tense.

**What it does [P].** On completion: **no Lamp can ever be lit again, by anyone.** Every other empire's
Wonder that depends on relighting a lane is nullified — the Concord Lamp goes dark and cannot be rebuilt,
the Unresolved Lane collapses, the Whole Recitation becomes a book of roads that no longer work. The
quarantine is sealed, absolutely, for good.

And every empire in the galaxy — **including the Ancients** — is confined forever to what it has already
swept. The map stops growing. The dark becomes permanent and safe.

**Maintenance.** There isn't one, because there is nothing left to maintain it with.

The Closing is paid for in **inventory**: every hull the Ancients have, permanently subtracted, one per
turn of construction, and they cannot build another because they never could. Per their canon they are not
a civilisation with an industrial base, they are a maintenance order spending an inheritance, and this is
the inheritance being spent. An Ancient player who completes the Closing finishes it with almost nothing.

**How it dies.** Kill them. It is the only Wonder whose construction visibly and irreversibly *weakens*
its builder every single turn, which makes it the most attackable object in the game and the hardest to
choose. Every other race can see the fleet count dropping.

**The danger — the inversion.**

The Closing is the only Wonder that is not a mistake. It is the correct decision, and it works, and it
is unbearable.

Nobody ever reaches the still-lit space nine hundred years out. Keth's people never get their figure
verified against a live network. The eleven thousand empty berths on Kettering stay empty. Every family
that has been talking across the Whisper for seventy-four years without meeting keeps talking, forever,
and never meets — and the Ancients, who could have explained this at any point, spend themselves to
enforce it and still do not explain.

This is ending **B · Seal** from `06-campaign.md`, available as a buildable object rather than a
dialogue choice. It should feel terrible and it should be right.

---

## Signature technologies

**1 · Inventory Discipline** *(Economy)*
Your hulls never degrade, refits cost a fraction of anyone else's, and every vessel you own is maintained
to a standard nobody can match. It does **not** raise production, and nothing ever will. You are not
becoming richer; you are becoming better at not losing what you have.
> *We do not build. We keep.*

**2 · Maintainer's Hand** *(Armor / Orbital)*
You may repair **any** hull, of any race, including allied and captured vessels, better and faster than
their own builders can. This is also the Ancient currency — they do not pay in money, they pay in repairs,
and there has never been an exchange rate. Eleven empires have tried to establish one.
> *It was broken. It is not now. There is nothing further to discuss.*

**3 · The Closing** *(Orbital — capstone, Wonder prerequisite)*
The completion of a procedure begun in BU 61 by units none of whom still answer. The formalism was never
lost. It was simply never finished, because finishing it required spending everything, and for
seventy-four years there was always a reason to wait.
> *There was an account. It was given in four sentences. You are welcome to the one we gave.*

---

## Signature hulls

**The Watch** — An immobile installation-hull. Deployed once into a sector and never moved again, it
observes that sector permanently and reports on the Whisper. This does not break Law 7 — there is no
remote sensing here, only a physical presence that stays. One has been watching a relay adjacent to a
collapsar since AU 0, continuously, to see whether the door is checked a second time.

**Precursor** — The single most powerful hull in the game. You may have **one**, ever. It cannot be
rebuilt, replaced, or repaired past a point, and it was constructed before anyone now alive. Every other
race's flagship is an achievement. This one is an heirloom, and losing it is losing it.

**Relict** — Cannot be built. Only **recovered**: found derelict in ruins and old installations,
maintained back into service, and finite. There is no production queue for a Relict. There is a list of
places they might be, and the list is getting shorter.

---

## Notes

**Access check.** `RACE_ACCESS[9] = {}` — they already have the full tree and every hull, and their
constraint is `cost ×1.5` against `economy ×0.8`. Nothing here relaxes that. Inventory Discipline
explicitly refuses to raise production, because the moment the Ancients can build things they stop being
the Ancients.

**Their politics is the mechanic.** They are an order whose purpose was completed by its own hand, and
their decline is *drift* — fourteen installations gone quiet since AU 40, nobody dispatched, no
explanation. The Closing is the only thing that would give them a reason to still exist, and it ends
them. That is why it has taken seventy-four years, and it is not indecision.

**Per Law 25**, the Closing never shows what it is closing against. The player builds it, the galaxy
goes permanently dark and permanently safe, and the last thing the Emissary says is not what they sealed
out. It is *we were wrong about what she was asking for.*
