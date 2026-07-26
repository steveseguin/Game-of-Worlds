# Act One — playable

Status: **PROPOSED**, and production-bound. Every line here fires through machinery that already
exists: the event feed (`17-the-feed/`), the advisor (`public/js/advisor.js`), a briefing screen, and
the map. **No scene requires an engine feature the game does not have.** Triggers are events
`server.js` already emits.

This document exists to fix a specific defect. The report card graded **Agency D+** with the note:
*"nearly every piece of fiction is a report of something already finished; twenty-four stories and not
one shows a character doing the thing while you watch."* Everything in `lore/` up to now is
recollection. This is not. People act here, under pressure, and their choices cause what happens
next.

**How to read the format.** `▸ TRIGGER` is an engine event. Indented lines are narrator copy. Scenes
marked **SCENE** are briefing-screen text, present tense.

---

## Mission 1 — "The Lamps Are Out"

**Teaches:** blind transit; that losses are normal and knowledge is bought.
**Opponent:** none.
**Objective:** reach and colonise the world at 6-B, four sectors out.
**Failure:** turn 12 with no colony.

**The design constraint that makes it work:** there is no safe route. Both approaches **cross** an
unswept shoal — 5-C on one line, 5-E on the other — and crucially neither shoal is the *destination*,
so both are **transit** rolls at 50% per hull, not arrival rolls at 25%. Four hulls, expected survivors
two. The mission cannot be completed without losing hulls, and that is not a failure state; it is the
game's opening statement, and the player must be allowed to discover it rather than be told.

*(Getting this wrong is easy and I did, in the first draft of this document: I put the shoal at 6-B
itself. A shoal that is the destination is already an arrival roll — the fleet is decelerating anyway —
which would make Sesse's choice below meaningless. The shoal has to be somewhere she is passing
through. See Laws 1–3 in `11-laws-of-the-world.md`.)*

### SCENE — the launch bay, before anything

*Ordel Gate. A hull is being loaded. Rell is at a rail with a clipboard; below, a young navigator is
arguing with a loadmaster about mass.*

> **RELL:** Navigator.
>
> **SESSE:** *(not looking up)* Warden. He wants nine tonnes of spare plate and I want nine tonnes of
> reckoning, and one of us is going to lose.
>
> **RELL:** Which of you is right?
>
> **SESSE:** He is. That is what is annoying about it.
>
> *(Rell writes something. Sesse notices.)*
>
> **SESSE:** What are you putting down?
>
> **RELL:** Your name, and that you said that.
>
> **SESSE:** Is that good or bad?
>
> **RELL:** It is filed. Three routes out of this system, Navigator. Two of them killed somebody last
> year. Pick.

That is the whole briefing. No history, no Trellis, no Unarriving. The player learns the premise from
the last four words.

### The crossing

▸ **fleet departs**
> Fleet away, four hulls. Navigator Sesse has the lead. She is twenty-six and she has flown this
> approach exactly never, which is true of everybody now.

▸ **fleet mid-transit** *(one turn later)*
> No contact. That is normal — she is between stars at light speed and she cannot see what is in front
> of her, and neither can I. We find out when she arrives.

▸ **belt roll, partial loss** *(the expected outcome)*
> Fleet arrived, 6-B. One did not. There is a shoal at 5-C and it is on the chart now — hold it and
> sweep it, and we will not pay for that crossing twice.

▸ **immediately after, once only — this is the mission's hinge**
> And a note for the record. Sesse decelerated inside the crossing. Nobody ordered it; doctrine forbids
> it, because slowing in a lane is how you lose a formation. She says she caught the leading edge and
> had about two seconds, and she used them.
>
> Three of four came back. At crossing speed the plot said two.

▸ **colony founded**
> Colony confirmed, 6-B. First permanent structure. Somebody will be born there.

### SCENE — the debrief

*A small room. Sesse standing. Rell seated, with the form.*

> **SESSE:** I know.
>
> **RELL:** Say it anyway.
>
> **SESSE:** I decelerated inside an unswept crossing without authority. It is in the standing orders as
> a hazard to the formation and it is a reprimand.
>
> **RELL:** It is.
>
> **SESSE:** Are you going to ask me why?
>
> **RELL:** No. I am going to ask you what you saw, and I am going to write that in section six, and
> then I am going to write the reprimand in section four, and both of those things are going to be
> true.
>
> *(Beat.)*
>
> **SESSE:** It was closer than the chart said. The chart was fine. The rocks moved.
>
> **RELL:** *(writing)* The rocks moved.
>
> **SESSE:** Warden — is the reprimand going to follow me?
>
> **RELL:** Yes.
>
> **SESSE:** Then why do you look pleased?
>
> **RELL:** I do not look pleased. I look like somebody who has just been handed a fact for the price of
> one hull instead of two.

**Why this is the mission's real content.** Sesse *acts*. She breaks doctrine on her own initiative,
under pressure, in two seconds, and it works — and she is punished for it, correctly, by somebody who
knows she was right. Nobody explains the theme. The player has watched a person make a choice that
cost her something and bought everybody else something.

It also plants Deceleration Doctrine, which is a real technology in `13-wonders/05-void-walkers.md`,
and which the Void Walkers will not adopt for another forty years because Wren dies with it.

---

## Mission 2 — "Sweep"

**Teaches:** probes; that a held shoal becomes permanently safe; that the map is something you make.
**Opponent:** none.
**Objective:** establish a clean trace between two clusters — two shoals swept.
**Failure:** running out of reckoning before either is held.

**The design:** the player is given exactly enough crystal for two probes and four crossings. The
arithmetic only closes if they probe first. This is the mission where *nineteen against eleven* — Unit
Four Hundred and Six's calculation in `15-series-twelve/02-silicon.md` — becomes something the player
does with their own hands.

### SCENE — the trace market, and the mission's comedy

*A Nomad convoy in dock. Keth has a table out. Rell is examining a chart and being watched.*

> **KETH:** That one is good.
>
> **RELL:** This one is mine.
>
> **KETH:** It is a copy of yours, which is a different object, and I am selling it to you at a
> discount because of the sentimental connection.
>
> **RELL:** You are selling me my own chart.
>
> **KETH:** I am selling you *confidence in* your own chart. Yours was filed eight years ago. Mine was
> flown in the spring. Same line on the paper, Warden. Completely different promise.
>
> *(Rell puts it down. Picks up another.)*
>
> **RELL:** And this?
>
> **KETH:** That one I would not sell you.
>
> **RELL:** Why not?
>
> **KETH:** Because you would fly it, and then I would have to explain to my mother's cousin why the
> Registry woman is not coming back, and she liked you, and I would rather keep the chart.
>
> *(He takes it off the table.)*
>
> **KETH:** Two probes. Buy two probes, fly nothing you have not paid for, and come back and buy the
> good one when you can afford it. That is free advice and it is the most expensive thing on this
> table.

That is the humour slot, and it does three jobs at once: it teaches trace decay (Law 10), it teaches
that probing beats flying, and it is genuinely warm. `17-the-feed/06-refusals.md` rations comedy to
places where nobody has died. A market is such a place.

### The sweep

▸ **probe survives**
> Probe home from 8-F. It is a shoal, and it is a bad one, and we now know that for three hundred
> instead of for a fleet.

▸ **probe salted or lost** *(if the player over-probes into hostile space)*
> Probe did not arrive at 8-F. Three hundred of reckoning for one fact, and the fact is that we were
> right to send the probe and not the fleet.

▸ **belt secured — the mission's payoff, and the best moment in the game**
> Shoal at 8-F swept — charted, cleared, corridored. It is a road now and it will stay one. It goes on
> the chart under a Registry designation, which I will read out and which nobody will remember.

▸ **first traffic across the swept shoal**
> Convoy crossed 8-F. Nothing was hit and nothing was going to be. That is the first thing this galaxy
> has given us instead of charged us for.

▸ **second shoal held — objective complete**
> Clean trace, end to end. Two shoals, six hulls, and a road that did not exist in the spring.
> Somebody will use this in ninety years and will not know what it cost, and that is the point of
> doing it.

### SCENE — the naming

*Rell, alone, with the chart ledger and a pen. Sesse is not in this scene and will not be in another
one.*

> **RELL:** *(reading)* Designation eight-F. Swept. Corridor marked. Registry name assigned by
> schedule.
>
> *(A pause. She looks at the assigned name, and does not like it.)*
>
> **RELL:** The *Diligence* went in first at 8-F and did not come out. Four months ago her navigator was
> in a launch bay at Ordel arguing with a loadmaster about nine tonnes of plate, and she was right, and
> I wrote it down because it was funny.
>
> *(She turns the ledger a few degrees, squaring it.)*
>
> **RELL:** She transmitted the partial chart before the crossing, because that is the standing order and
> she was the sort of officer who follows one. So the shoal is on the chart, and the corridor is marked,
> and there is a road there — and the reason we have any of it is a signal she sent four minutes before
> she stopped existing.
>
> That is what the standing order is *for*. I have defended it in three hearings and I have never once
> been able to say it out loud like that.
>
> *(She strikes the assigned name through, once, cleanly, and writes in the margin.)*
>
> **RELL:** Sesse's Crossing.
>
> *(She caps the pen.)*
>
> **RELL:** That is irregular. It will be queried and I will lose the query, because a margin is not a
> field and I have read the finding that says so.
>
> *(Beat.)*
>
> **RELL:** It is also the only thing I can actually do.

**Why the scene is written this way, and what it is asking for.** Rell writes the name **by hand, in a
margin, irregularly** — the third Terran in this folder to do that, after Halloway's twenty-two words
and Yard Nine's variance to the variance. The through-line is deliberate: in this empire the only way
to record something true is to break the form.

And it is an argument for a feature. `server/lib/sector-names.js` already generates a name and the
sweep already writes it, so today the map fills with *assigned* names — which is the Registry doing its
job and is exactly what Rell is objecting to. **The picker is what turns her margin into a field.**
Until it exists, this scene is the game asking for it out loud.

---

## Mission 3 — "Anything That Floats"

**Teaches:** economy, spaceport tiers, colony ships, fleet capacity. First contact.
**Opponent:** **Zephyr Swarm.** Chosen deliberately — a player who has just learned that losses hurt
now meets a civilisation for whom they do not.
**Objective:** out-expand the Swarm across a contested cluster.
**Failure:** the Swarm holds more of the cluster on turn 30.

**The turn, and the player must arrive at it themselves:** you cannot out-expand the Swarm. Their hulls
cost 30% less and there are tens of thousands. You win by **taking the shoals** — the Swarm floods
through unswept sectors and bleeds, and once you own the crossings the arithmetic inverts.

### First contact — and the Swarm's contradiction, sharpened

▸ **first Zephyr contact**
> Contact. It is the Swarm. I am going to read you their hail verbatim because I cannot summarise it
> in a way that stays true.
>
> *"We are here also. There is a great deal of we. We do not want your worlds; we want to be in more
> of the places. This is not the same and we are told it is harder to negotiate with."*

▸ **the Swarm crosses an unswept shoal in force**
> Nine hundred of theirs went into 4-C. Something under half came out. They are still coming.
>
> They will do that again tomorrow. They are not being brave and they are not being callous. They
> genuinely cannot resolve a loss that size into anybody in particular, and I have read their language
> notes and there is no construction for it.

▸ **the mission's quiet horror, fired once, mid-mission**
> A Swarm element lost connection crossing 4-C. Four hundred hulls, cut off on the far side.
>
> The rest of them have not acknowledged it. Not out of coldness — a fragment has no standing in their
> law and no word describing what it is, so there is nothing for them to acknowledge *with*.
>
> Those four hundred are alone out there and their own people cannot perceive that this has happened.
> I do not have anywhere to put that, so I am putting it in the log.

That third beat is the whole Zephyr design working: the report card noted that the Swarm and the
Quantum were *"closer to a concept than a contradiction."* This is the contradiction made concrete —
**a people whose greatest strength manufactures a kind of suffering they are constitutionally unable
to see** — and the player watches it happen live rather than reading about the Remainder seventy years
later.

### The rising pressure — Escalation

▸ **turn 18, the far edge of the map, once**
> Survey brought back something from the northern margin. Not a fleet — a *marker*. A stamped plate,
> bolted to a rock, in Mechanicus shift-script.
>
> It is an annotation. It says the sector requires a heavier hull, and it gives a date, and the date is
> two hundred years ago.
>
> It also gives a review interval. Warden — I have done the arithmetic twice. It comes due this
> decade.

▸ **turn 26, once**
> The northern margin has movement. Seven hulls, patched plate, four eras of it, no reconnaissance
> screen, advancing at about three-fifths standard.
>
> They are annotating as they go. They are not lost and they are not searching.
>
> They are on a schedule.

**This fixes a real defect.** The report card graded **Escalation C+** with the note *"the setting has
no rising pressure — the threat is undesigned by rule, the Ancients are passive, and nothing is
coming."* Something is coming, and it always was: the Endless Yard has been advancing on a filed work
order for two centuries, the Ancients' watch logged it passing at one sector in **AU 68**
(`15-series-twelve/09-ancients.md`), and nobody was dispatched. It simply had no clock the player could
read. Now it has one, and it starts ticking in mission 3.

It is also the correct kind of pressure for this setting: not a villain, not an invasion. **A work
order with no completion condition, arriving on time.**

---

## What Act One establishes, and in what order

| | Mission 1 | Mission 2 | Mission 3 |
|---|---|---|---|
| **Mechanic** | blind transit, hazards | probes, sweeping, traces | economy, expansion, capacity |
| **Theme** | knowledge is bought | you make the map | some people do not count the cost |
| **Someone acts** | Sesse decelerates without orders | Keth refuses a sale | a Swarm fragment is cut off |
| **Cost** | her record | the good chart | four hundred, unmourned |
| **Rell changes** | files a true thing she dislikes | names a place | logs something she has nowhere to put |
| **Emotional register** | tense, procedural | warm, funny | unnerving |

**Causality between missions is therefore/but, not and-then:**

Mission 1 ends with a shoal on the chart and a navigator reprimanded for surviving — **therefore**
mission 2 is about buying knowledge instead of paying in hulls, **but** the good chart is not for sale
— **therefore** you sweep your own crossings and the map acquires your names — **but** the crossings
you swept are exactly the ones the Swarm is about to flood, **therefore** mission 3 is won by holding
roads rather than racing for worlds.

---

## Implementation notes

**Everything above is a trigger and a string.** No new systems.

| Beat type | How it fires |
|---|---|
| Scenes | Briefing-screen text, already in the mission flow |
| `▸` lines | The existing feed path in `server.js`, mission-scoped |
| Verbatim hails | Rell quoting, per the one-voice rule in `05-characters.md` |
| Once-only beats | A per-mission fired-flag; the advisor already has cooldowns |
| The naming beat | `server/lib/sector-names.js`, already shipped |

**Two things deliberately not done here.** No branching dialogue — the player's agency is their move
orders, which is the strongest form available and needs no dialogue tree. And no new voice: Sesse,
Keth and the Swarm are all *quoted by Rell*, so the recording scope stays at one performer.

**Build order**, per `06-campaign.md`: missions 1, 2 and 4 first. Mission 3 is written here because it
carries the Escalation fix and the Zephyr contradiction, and those needed to exist somewhere.
