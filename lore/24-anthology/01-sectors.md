# Sectors

Nine pieces, nine of nine done. One per sector type in `01-cosmology.md`, including the three that were
unassigned.

**Canon correction — types 3, 4 and 5 were never free.**

The first draft of this file invented three sector types for these slots, on the authority of
`01-cosmology.md`, which said they were *"OPEN — unassigned."* **That was wrong and had been wrong since
Pass 1.** `server/lib/map.js` defines all three, names them, gives them descriptions, and
`generateGameMap` rolls each at **5% of every sector on every map** — fifteen per cent of the galaxy
between them. The client has been printing their names to players in two files the whole time.

The real ones, from `SECTOR_TYPES`:

- **3 — Unstable Star.** *"An unstable star that emits dangerous radiation."* Not colonizable. No
  `hazardous` flag and no `dangerLevel`, so mechanically it is currently inert.
- **4 — Brown Dwarf.** *"A failed star with no planets."* Not colonizable, not hazardous.
- **5 — Small Moon.** *"A small moon without an atmosphere."* Not colonizable, not hazardous.

The pieces below are written to those. **The Wreck Field and the Dead Lamp are cut** — they were good
ideas attached to slots that were already occupied, and they are logged in `08-open-questions.md` as
candidates for a *new* type if one is ever added rather than as descriptions of an existing one.

*The systemic fix is `tests/lore-sector-types-match-code.test.js`, which now fails if this table and
`SECTOR_TYPES` disagree.*

---

## 0 · Empty Space — "Nothing At All"

Third Officer Aubrin had eleven hours of nothing and used them to learn the ship.

Sector 4-A held one thing: the absence of things. No rock, no dust, no star inside two light-years. The
survey template had eleven fields and she wrote *nil* in ten of them, then stopped at the eleventh,
which asked for *hazards observed*, and found she could not honestly write *nil* there either.

She wrote: **nothing to hold, nothing to fear, nothing to gain. Recommend nobody comes back.**

Then she sat in the dark with the plot up and watched the crossing counter tick, because 4-A is on the
only line between two things that matter, and every fleet that ever goes from one to the other will pass
through this exact nothing and file the exact same form.

Her grandfather had crossed here. She looked it up. Same eleven fields, same *nil*, forty years earlier,
in a hand she recognised.

She kept the form. It is the only thing anyone in her family has ever kept from a survey.

---

## 1 · Asteroid Belt — "The Shoal at 8-F" ↔

Gunner's Mate Tolliver never saw the thing that took the *Assurance*'s bow off.

Nobody does. That is the whole of it. At crossing speed the gravel arrives with the information about
the gravel, and there is no interval between the two in which a person can be useful. He was in the aft
magazine with his hand on a rack when the deck stopped being level, and by the time he understood that
the ship had been hit the ship had finished being hit.

They came out at 6-B with three of four. He spent the next two watches walking the hull with a lamp,
counting punctures. Nine hundred and forty. He wrote the number on a bulkhead in grease pencil because
there was no field on any form that wanted it.

Six months later they swept 8-F — held it, cleared it, threaded a corridor — and a convoy went through
without a mark.

Tolliver was aboard for that too. He went and stood in the aft magazine with his hand on the same rack,
for the whole crossing, and felt nothing whatsoever.

He has never been able to explain to anyone why that was worse.

---

## 2 · Black Hole — "The Mouth at Anselm"

There is no story from inside a mouth. This is the story of the form.

Chart-Warden Rell has filed eleven. The procedure is four lines long and she can do it in under a
minute, which is the part she dislikes.

*Fleet designation. Sector. Complement. Reason for loss.*

The fourth field is where it goes wrong, because the codes are hazard, enemy action, structural,
navigational error, other — and a mouth is none of them. Hazard implies the sector was known to be
dangerous. It was not known to be anything. That is what a mouth *is*: an absence in a docking schedule
that resolves, after some weeks, into a certainty.

She writes *hazard*. She has written *hazard* eleven times. Each time she has considered the margin and
each time she has decided that this is not the one worth ending her career over.

The chart gets a mark at Anselm. Every chart in every empire that ever crosses that region will carry
that mark, and every navigator will route around it, and none of them will know that it is there because
nineteen people went to find out.

That is how every mouth on every chart in the galaxy got there. Somebody was sent.

---

## 3 · Unstable Star — "Forty-One Minutes"

*"An unstable star that emits dangerous radiation."* Five per cent of every map.

The flare star at 11-D has a rhythm, and Sub-Lieutenant Osk of the Not-Yet found it by sitting still.

Everyone else had crossed at speed, taken a dose, filed it as radiation and routed around thereafter. Osk
parked at the outer margin for six days with the instruments open and did nothing at all, which her own
service found difficult to authorise.

Forty-one minutes. The star throws for about ninety seconds and then it is quiet for forty-one minutes,
and it has been doing that since before anybody was alive, and nobody had watched it long enough to
notice, because watching is not what fleets do.

She crossed on the fourth quiet and took nothing.

The report is two pages of numbers and one line of comment, and the line is why three empires hold
copies: **this is the only dangerous place in the galaxy that can be learned instead of bought.**

Her own people, characteristically, will not commit to whether the rhythm holds. Osk has crossed it
fourteen more times. It holds.

---

## 4 · Brown Dwarf — "A Failed Star With No Planets"

*"A failed star with no planets."* Five per cent of every map, and Assessor Tanu has certified
sixty-three of them and calls them the saddest sector type in the catalogue.

"It is not a hazard. Nothing there will hurt you. It is not a world; you cannot stand on it and there is
nothing in orbit to stand on either. It is a star that did not *quite*, and it has been sitting there for
about ten billion years being almost something."

Her certifications run to one line each. *Type four. Not colonizable. No hazard. Transit safe.*

What she has never put on a form: brown dwarfs are the best navigational marks in the galaxy. Dim enough
that nobody fights over them, bright enough to fix a position, and permanent.

"Half the traces in my cabinet are anchored on a dwarf. Somebody flying blind comes out, finds the dwarf,
and knows where they are. That is the entire service it performs and it will perform it for longer than
this species exists."

She has one on her wall. Survey plate, sector designation, no name.

"Nobody names them. I have thought about naming one."

---

## 5 · Small Moon — "Without An Atmosphere"

*"A small moon without an atmosphere."* Five per cent of every map, and Deputy Warden Halloway has
watched four empires bleed over exactly one of them.

Sector 2-E. No ore worth the shaft. No air, no water, no soil, nothing to colonise and nothing to farm.
By every measure on the Registry's assessment form it is worth precisely nothing.

She keeps the tally in the margin of the sector file, which is irregular, which she has stopped
apologising for. **Two thousand three hundred hulls** — for a rock you cannot live on.

The reason is not on the form either. 2-E sits at the junction of four traces. Whoever holds it does not
gain a world; they gain the ability to say who crosses, and in a galaxy where a route is the most valuable
object there is, a worthless rock in the right place is worth more than a large planet in the wrong one.

"That is the whole of it," Halloway says. "It is not real estate. It is a *door*, and it has no lock, so
we keep putting fleets in the doorway."

She has been out to look at it once. It is grey, it is nine kilometres across, and there is nothing there
at all.

---

## 6–9 · Colonizable Worlds — "The Ladder"

Tender Ossa of the Long Season has raised things on four kinds of world and she grades them the way a
grower grades soil, which is to say by what they take out of you.

**A six** is a rock with weather. You can stand on it in a suit and it will never be more than that, and
what it gives you is ore and a place to put a yard. Ossa has no affection for a six. Nobody does.
Nobody is *from* a six.

**A seven** will grow something if you argue with it. **An eight** grows willingly and hides a
problem — bad water, a season that comes in wrong, something in the dust — and every eight in the galaxy
is settled by people who found the problem in year three.

**A nine** is the good ground, and there are eleven of them within reach of anyone, and every single one
of them was fought over before the Lamps went out and is being fought over now.

"And the difference between a six and a nine," she says, "is about nine generations of somebody's family
deciding to stay. That is all terraforming is. People not leaving."

---

## 10 · Homeworld — "The World We Were Left On"

Convoy-Master Hallam has been to Kettering twice and both times she wanted to leave immediately.

It is a thin cold rock at a five-lane junction and nobody ever meant to live on it. Nine centuries of
Nomads used it as bunkerage and berthing and went straight back out, because the Fleet was the home and
Kettering was the yard.

Then the schedule stopped, and eleven thousand berths were left holding nothing, and now four per cent
of her people live down there among them, and the phrase her grandmother used — *the world we were left
on* — turns out not to have been poetry.

Nobody chose their capital. Not one of the twelve. Terra is eleven dead ports; Bell is nine launch
spines pointed at lanes that no longer go anywhere; the Second Shift is a slag heap that never got
recycled. Every homeworld in the galaxy is simply the place its people happened to be standing.

Hallam walked out onto the field the second time, at night, and looked at the berthing lights — eleven
thousand of them, swept and lit and empty, maintained out of the largest line in the Fleet's accounts
and never once queried.

"We keep the lights on," she said, "for a schedule that stopped."

Then she got back on her ship.
