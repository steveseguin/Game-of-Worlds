# Themes, Tone, and the Writing Rules

Status: tone register **LOCKED** 2026-07-25 (`08-open-questions.md` Q2). Everything else
**PROPOSED**.

This is the most practical document in the folder. It is what you hand someone — including
me, three months from now — before they write a single line of game copy.

---

## The themes

Three, in order of load-bearing importance. A theme is only real if it shows up in the
mechanics, so each is listed with the rule that carries it.

### 1. Knowledge is bought, and someone else always pays for it
> *Carried by: probes, fog of war, blind transit, swept shoals, stolen traces.*

Everything the player knows about the galaxy was purchased. Not researched — purchased, with
hulls and crews. The chart on your desk is a casualty list rearranged into a useful shape.

This is the theme that makes the game's core loop *mean* something, and it should be present
in the smallest copy. When a probe dies, the feed should not say "probe destroyed." It should
convey that three hundred units of reckoning have been converted into one fact, and the fact
is *there is a shoal at 6-B*, and that is a good trade, and it is still a loss.

### 2. Everyone is standing in a ruin and calling it a country
> *Carried by: homeworlds you didn't choose, Warp Gates, the tech tree, Scientific Victory.*

No empire in this game is ascendant. They are all salvage operations with flags. The most
advanced technology any of them can build is a crude, single-span imitation of infrastructure
their great-grandparents used without thinking about it. Every research breakthrough is a
*rediscovery*, and the tech tree is not a ladder upward — it is an excavation.

The tone consequence: **no triumphalism in progress copy.** A completed technology is not a
leap forward. It is catching up with the dead.

### 3. The thing you want is the thing you should fear
> *Carried by: Scientific Victory, the Galactic Wonder, the campaign's final choice.*

Restoration is the universal goal and the universal error. Every empire wants the roads back.
The roads are why the dark came, and turning them back on lets it return.

This is the theme that makes the game *about* something rather than merely set somewhere. Use
it sparingly and never explain it before the campaign earns it.

### And the thing that keeps it from being miserable

A fourth, quieter one, and without it the whole thing curdles:

**People are competent, and competence is a comfort.** The crews in this galaxy are good at
their jobs. Navigators are careful. Chart-Wardens keep clean books. Ordnance officers check
their work. When a fleet dies in a shoal it is not because anybody was foolish — it is because
the galaxy is like that now, and the survivors will file an accurate report and go back out.

Get this wrong and you have grimdark. Get it right and you have something much rarer in the
genre: a game with the emotional register of a competent institution doing dangerous work.
That is the feeling of the good submarine films, of *Apollo 13*, of a lifeboat crew. It is
warmer and far more gripping than despair.

---

## Tone register

**LOCKED: weathered professional.** Somewhere between a naval logbook and a well-run
disaster. Specific, dry, occasionally beautiful by accident. The characters do not describe
their own feelings and the writing does not describe them either; feeling comes from what is
recorded and what is left out.

The art direction supports this. `docs/art-direction/` calls for a 1990s command-briefing
station — physical, industrial, installed. That is a *working space*, not a throne room, and
the writing should match it. Nobody monologues in a room with a maintenance panel.

### What we sound like

> Fleet arrived, sector 6-B. Four hulls did not. There is a shoal at 6-B; it is now on the
> chart. Recommend we hold it and sweep — we will not have to pay for that crossing twice.

Look at what that does. It reports, it costs something, it takes the loss seriously without
adjectives, and it ends with a professional recommending the correct decision. Four sentences,
no emotion words, and the emotion is entirely there.

### What we never sound like

> The galaxy trembles as your mighty armada surges forth to claim its destiny!

Bad because it is generic, bad because it is loud, and worst because it could be any game.

> lol RIP those guys 💀

No.

> The screams of the dying echo eternally in the void, for in the grim darkness of the future
> there is only war.

Also no. That is a different, excellent game, and copying its register would make ours look
like a tribute act.

### The arc words — one question, asked of everybody

**Added 2026-07-26** (`29-borrowed-machinery.md` B2). *Planescape: Torment* asks *"what can change the
nature of a man?"* over and over, every companion answers differently, and the received reading is that
the player's answer is a reflection of **the player** rather than of the protagonist. That is the most
efficient unifying device in the medium and it costs nothing but discipline.

**We already had the question and were not using it as arc words.** It is in the shipped Codex, in the
Twelve tab:

> **How do you cross a dark you cannot see into?**

Every locked branch and forbidden hull in `races.js` is one of the twelve answering it, and paying for the
answer. Every character in `10-the-long-file/` and `15-series-twelve/` answers it with what they did.

**From now on it is the folder's spine, under three rules:**

1. **Never print it as a thesis.** It appears as a question, in somebody's mouth, or not at all. A
   document that states *"the theme of this setting is…"* has stopped being the setting.
2. **Every race answers it in its own grammar, once, and never explains.** Terra writes it down. The
   Zephyr send enough that some arrive. The Bioform decline the premise. Several files already do this
   by accident; the next editorial pass on `12-civilisations/` and `14-peoples/` should make it
   deliberate.
3. **The player answers it mechanically, and is never asked.** Probe or send a fleet. Sweep it or route
   around it. Hold the shoal or take the planet. That is the Planescape trick done properly — the answer
   is assembled out of decisions rather than dialogue options, and it is *theirs*.

### The one licensed elevation — and why the charter needs it

**Added 2026-07-26.** The register above is correct and stays locked, and it has a cost that was
showing: it is superb at grief, cost and procedure, and it **structurally forbids awe.** *Occasionally
beautiful by accident* means beauty is never aimed at. *Characters do not describe their own feelings*
means nobody in a hundred and sixty thousand words is ever allowed to be **proud.**

That produced a real defect rather than a matter of taste. `11-laws-of-the-world.md` Law 6 says sweeping
is *"the single positive-sum mechanic in the setting and the fiction should treat it as **sacred**."*
This document was telling writers to treat something as sacred and simultaneously banning the only
register in which they could. Every piece about sweeping was therefore about the hulls it cost, and none
was about the road.

**So: elevation is licensed, for exactly one subject.**

| | |
|---|---|
| **Licensed for** | The permanence Law 6 creates. Swept ground. A corridor that used to kill people and now does not. A first crossing. The moment somebody stands on something that will outlast them |
| **Not licensed for** | Combat. Conquest. Fleets. Wonders. Victory. Anything a player *beats* |
| **Because** | The setting has precisely one thing that is pure gain and permanent, and it is the thing the player actually does. Awe spent anywhere else is the register in "What we never sound like" |

**Four rules, and they are what keep this from becoming the thing we mock above.**

1. **The pride is never in oneself.** It is in what other people paid for. A swept chain is ninety years
   of strangers' dead, and a courier flying it is a beneficiary, not a hero. *That* is the emotion the
   folder was missing — not triumph, **inheritance.**
2. **No adjective does the work.** Elevation comes from the *fact*, held still: nothing in these eleven
   sectors can kill you, and that has not been true for anybody since AU 0. If the sentence needs
   *magnificent* to land, the fact underneath it is not big enough.
3. **It must cost the character something to say.** Wren is irritated rather than haunted; the same
   discipline applies upward. Somebody moved should be embarrassed about it, or professional about it,
   or busy.
4. **Never at the expense of Law 1.** Sweeping makes space *safe*. It does not restore *sight*. A swept
   corridor is not lit and nobody in it can see ahead — what they get is the absence of the arithmetic,
   which is a better feeling and a true one.

**The model piece is `24-anthology/16-the-first-clean-run.md`.** If elevation is ever needed again, match
that and no further; it is deliberately the only one of its kind in a hundred and six pieces, and the
ratio is the reason it works.

### Three specific rules of voice

1. **Never say "destroyed" about people.** Ships are destroyed. Crews **did not arrive.**
   This is the narrator's verbal tic and it is the most efficient characterisation device in
   the whole project — one word choice, repeated four hundred times, and the player eventually
   notices and it lands like a punch. Do not overuse it in dialogue where it would be
   conspicuous; it belongs in the event feed, where it is habit.
2. **Numbers, not scale words.** "Nineteen hulls" beats "a vast fleet." "Two crossings" beats
   "repeated attempts." If you don't know the number, don't reach for an adjective — cut the
   clause.
3. **No one narrates their own doctrine.** A Mechanicus officer does not say "we of the Works
   believe reconnaissance is a moral failure." A Mechanicus officer says "no scouts. Advance."
   The player derives the belief. This rule alone is the difference between good and terrible
   faction writing.

---

## Naming conventions

Consistency here does more work than history does. Full inventory in `07-glossary.md`; these
are the generative rules.

- **Places** get a designation and a nickname. Formally sectors are grid references — `6-B`,
  `14-H` — because that is what the game displays. Named places are named after the ship or
  captain that first survived them: *Anselm's Reach*, *the Vail Shoal*, *Kettering*. This is
  how real charts work and it embeds the theme in the map: **every named place in the galaxy is
  named after somebody's expensive mistake.**
- **Ships** are named by the culture that built them and should be immediately identifiable
  as such: Terran ships get virtues and rivers (*Diligence*, *Ganges Reach*), Nomad ships get
  the names of routes they no longer fly, Mechanicus hulls get serial designations and are
  never named, Zephyr hulls are not individuated at all.
- **Races** have two names: the **Registry name** (what the Terran archive calls them, which
  is what the game already ships — "Mechanicus", "Zephyr Swarm") and an **endonym** (what they
  call themselves). This is not decoration; it lets us keep every string in the code as canon
  while adding real depth, and the gap between the two names is often the fastest way to
  characterise a relationship. **LOCKED**: Registry names are the shipped strings and never
  change.
- **People** get rank plus one short name. Two-syllable maximum for anyone who appears in
  voice-over. Avoid apostrophes entirely. If a name is hard to say aloud, an actor will say it
  four different ways across a session and we will pay to fix it.

---

## The checklist

Before any piece of game text ships, five questions:

1. **Could this line appear in another space game?** If yes, cut it and write the version that
   only fits this one.
2. **Does it cost something?** Almost every event in this galaxy has a price. If the copy
   doesn't name it, the copy is decoration.
3. **Am I explaining a belief that should be demonstrated?** Delete the explanation. Keep the
   behaviour.
4. **Is there a number available?** Use it.
5. **Does it contradict the code?** The code wins. Always. Check `01-cosmology.md`.
