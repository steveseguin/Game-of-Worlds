# Characters

Status: **PROPOSED**.

One character matters more than all the others combined, so this document is mostly about them.

The art direction already specified a talking-head commander feed with idle, talking, alert and
static states, and noted that the portrait should stay non-identifiable *"unless Steve later
chooses named characters."* That is the decision this document makes: **name them.** A single
recurring voice attached to the event feed is the cheapest narrative device in game
development — it costs one performer and no cutscenes — and it is the single biggest change we
can make to how the game feels.

---

## Chart-Warden Rell

**The voice of the game.** Your adjutant. They are on screen, in some state, for the entire
runtime, and they narrate every event the engine already emits.

### Who they are

Rell is a **Chart-Warden**: the officer whose job is arrival manifests. Not a navigator, not a
strategist — the one who reconciles what left with what got there, keeps the trace ledger
current, and signs the notifications. In the Terran service it is a career for the meticulous
and the unambitious, and it is one of the few posts that expanded after the Unarriving.

They are the third generation after the Lamps went out. That distance is deliberate: Rell did
not lose anyone in the Unarriving. **Rell's grandmother did**, and Rell grew up with a woman who
read shipping schedules aloud for forty years hoping to find a name, and the whole family
learned not to mention it. Rell is not grieving. Rell inherited a grief and turned it into a
profession, which is a much more interesting and much more playable thing.

The grandmother has a name and a body of work: **Chart-Warden Ilsa Rell**, who compiled
`10-the-long-file/` — twelve testimonies from twelve species, gathered over forty years because
her own account had no ending and she went looking for someone else's that did. She died in AU 68
with the file at eleven entries, having asked the Ancients thirty-one times and been refused every
time. Our Rell got the twelfth in AU 74.

This matters mechanically as well as emotionally: it means **Rell has read every testimony in the
game**, in their grandmother's handwriting, before the campaign starts. Every codex entry the
player unlocks is something Rell already knows. That is why they can quote from it without a
briefing, and it is why they are so hard to surprise.

They are extremely good at the job. They are never dramatic. They have a dry, almost invisible
sense of humour that surfaces about once an hour and is worth waiting for.

### The tic

Rell never says a crew was destroyed. Ships are destroyed. Crews **did not arrive.**

This is the most valuable single decision in this folder. It is one word choice, repeated
across several hundred event lines, and it costs nothing to implement — and somewhere around
hour four the player notices, and somewhere around hour six they understand why, and it lands
harder than any cutscene we could afford.

Rules for it:
- The feed uses it as **habit**, never as emphasis. Rell is not making a point; this is simply
  how the paperwork is worded.
- Never draw attention to it. No character remarks on it. No tooltip explains it.
- In one late-campaign beat, and only one, Rell slips and says "destroyed." That is the entire
  emotional payload of that mission and it needs no dialogue around it.

### How they speak

Terran institutional register (see `04-factions/01-terran-empire.md`), but warmer than the
Registry standard, because they are talking to you specifically and they have done so for years.

- Reports the number first, the consequence second, the recommendation third.
- Never editorialises about your decisions. Will, however, restate a cost with very slight
  emphasis, which is as close to disagreement as they get.
- Uses "we" for the empire, "you" for the player, "I" almost never.
- Compliments are technical: *that was a clean crossing* is the highest praise available.

**Samples, mapped to events the engine already emits:**

| Engine event | Rell |
|---|---|
| Fleet arrives, no losses | Fleet arrived, 6-B. All hulls. That was a clean crossing. |
| Belt partial loss | Fleet arrived, 6-B. Four hulls did not. There is a shoal at 6-B and it is now on the chart — hold it and sweep, and we will not pay for that crossing twice. |
| Belt total loss | Nothing arrived at 6-B. I have the manifest. Nineteen. I will file it. |
| Black hole | There is a mouth at 9-D. I know because nothing came back from 9-D. That is the only way anyone has ever known. |
| Probe destroyed | Probe did not arrive. Three hundred of reckoning for one fact, and the fact is that we were right to send the probe and not the fleet. |
| Colony founded | Colony confirmed, 6-B. First permanent structure. Someone will be born there. |
| Research complete | Deflector programme concluded. We have caught up to something that was standard in the Concord. I'd like to be pleased about it. |
| Battle won | Sector held. Their losses exceed ours. I have both manifests; I would rather have neither. |
| Battle lost | Sector lost. I have written to fourteen families this season and I would appreciate a reason not to write more. |
| Victory imminent | Registrar's office is asking after you. That means they have started counting. |
| Enemy probe salted | Their probe took our false trace. It will not arrive. That was legal, and I have filed it, and I would like the record to show that I filed it. |

That last one is a whole character in twenty-eight words, and it costs one line of VO.

### Portrait states

Mapping to the four states the art direction already calls for:

- **Idle** — reading. Rell is always working; they look up when there is something for you.
- **Talking** — the default delivery state.
- **Alert** — not panic. Rell straightening slightly and getting *quieter*. The alert state
  should be less animated than the talking state, which is the opposite of the genre convention
  and much more effective.
- **Static** — signal loss. Reserved for the campaign's three worst moments.

**Casting and design:** unspecified gender, referred to as they/them throughout. Middle-aged.
Uniform, worn correctly, not new. The art direction's stylised, non-photoreal treatment suits
them exactly — this is a 1990s briefing-screen portrait, not a performance capture.

---

---

## The rule that governs everyone else: **Rell quotes them**

**LOCKED** 2026-07-25. Voice-over scope is one performer, which means no other character is
ever heard. Every one of them reaches the player through Rell reading their messages aloud.

This is not a budget compromise. It is a better device than voicing them, and it should be
protected even if the budget later grows:

- **Rell stays the entire narrative surface.** One relationship deepening over twenty hours
  beats six relationships introduced and abandoned.
- **We hear Rell's opinion of everyone for free** — in what they choose to read out, what they
  summarise, what they read verbatim in a slightly flatter voice than usual. A Chart-Warden
  reading a Sweep-Admiral's demand aloud is doing characterisation on two people at once.
- **It is how radio drama has always done this**, and radio drama is the correct reference for a
  game whose entire narrative channel is one portrait and a waveform.

Practical rules for writing the quoted cast:

1. Anything a character says must survive being *reported*. No physical business, no gestures,
   no reaction shots. If a line only works performed, it does not exist.
2. Rell attributes plainly and never editorialises directly. *"Ito's office, verbatim: …"*
3. The Emissary is the exception that proves the rule. Their lines should be quoted **exactly**
   and at slightly greater length than anyone else's, because Rell does not know what to make of
   them and will not paraphrase what they cannot parse. The player notices the change in
   handling before they notice why.

---

## The seed cast

Everyone else is Pass 3 and Pass 4 work. These are the roles the campaign needs, with a name
and a want each, so that later passes have something to build on. All of them are **quoted, not
voiced** — see the rule above.

### Registrar Vance — Terran head of state
Nineteen years in office. Believes the archive is the only thing keeping twelve empires
speaking one language, and she is right. Found something in the commercial correspondence files
that she has told no one. **Wants:** the count to be honest. **Problem:** she has known for
sixty years that it isn't.

### Sweep-Admiral Ito — the best argument for a bad idea
Wants to trade archive access to the Nomads for four centuries of route-knowledge. The deal is
genuinely good and it genuinely ends Terran primacy. **Not a villain.** The campaign is
stronger if the player is tempted.

### Liaison Fourth — Mechanicus, built to talk to organics
Sixty years in the post, completely without guile, will answer anything truthfully including
what it shouldn't. Has recently begun asking questions, which its civilisation does not do, and
has not reported this. **Wants:** to understand why anyone scouts. **Problem:** it is starting
to want things.

*Quoting note:* Fourth's transmissions arrive as text and Rell reads them flat, which is exactly
right — a machine's dispatch delivered without inflection by someone who has stopped finding it
strange. When Fourth begins asking questions, Rell starts pausing before reading them out.

### Keth of the Fleet — Star Nomad trace-broker
Sells verified routes. Charming, mercantile, sentimental about lanes the way other people are
about houses. Every trace Keth sells was paid for in somebody's crew and Keth will tell you
whose, at length, as part of the price. **Wants:** the Unarriving figure corrected in the
Registry. **Problem:** the correction would ruin the only power that keeps records.

### Analyst Nine of the Solved — Silicon Collective
Published the proof that the Unarriving was not an accident, in AU 51, to complete indifference.
Is not bitter about this, because bitterness is not useful, and mentions it in roughly every
conversation. **Wants:** someone to read the paper. **Problem:** the paper is correct.

### The Emissary — the Ancients
Has attended every galactic council since AU 3 and has spoken twelve times. Uses the past tense
for present things. Knows exactly what happened to the Lamps, and why, and what the cost of
undoing it will be. **Wants:** for nobody to succeed at the thing everybody is trying to do.
**Problem:** cannot say why without causing precisely the outcome they fear.

The Emissary is the campaign's engine. Every scene they are in should be the player trying to
get an answer out of someone who is not withholding it out of malice but out of an entirely
correct assessment of risk. Play them as tired, courteous, and sorry.

---

## What we deliberately do not have

- **No villain.** The antagonist of this story is a decision made seventy-four years ago by
  people who were right. The nearest thing to a bad actor is the Shadow Realm, and they are
  innocent of the thing they are accused of and guilty of profiting from it, which is a much
  more useful position.
- **No romance subplot.** Not because it couldn't work, but because it needs writing time this
  project should spend elsewhere.
- **No chosen one.** The player commands an institution. Rell's job continues whether you are
  brilliant or not, and the campaign should never suggest the galaxy hinges on your personal
  qualities. It hinges on what you decide to do at the end, which is different and better.
