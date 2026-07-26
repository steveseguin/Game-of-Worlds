# Turn and Victory

Four wire events. These carry no `Success:` / `Error:` prefix — they are `newturn::`, `turnclock::`,
`victoryprogress::` and `gameover::` — so the copy attaches to whatever the client renders alongside them,
and it is the one part of this script that needs a UI decision rather than a string swap.

---

## 1 · Turn begins — `newturn::`

Fires every turn, so most of the time it should say **nothing at all.** A narrator who speaks on every
tick becomes wallpaper.

**Recommendation: Rell speaks on roughly one turn in five, and always because something is true.**

- **a** — `Turn ${turn}. Income is in, the yards are clear, and there is nothing on my desk that will not keep.`
- **b** — `Turn ${turn}. Two manifests to reconcile and then I am yours.`
- **c** — `Turn ${turn}.`
- **d** *(only when the player holds a newly swept shoal)* — `Turn ${turn}. The corridor at ${sectorId} carried traffic all season and took nothing. That is what we bought it for.`
- **e** *(only when the player lost hulls last turn)* — `Turn ${turn}. I have the notifications drafted. They can wait until you have decided what to do.`

## 2 · Clock — `turnclock::`

No narration. Ever. A countdown does not need a voice, and Rell reading a timer aloud would undo the
entire character.

**One exception, at the very end of the timer, and only in the final ten seconds of a turn where the player
has an unspent order:** a single line, once per game maximum.

> `Whatever you are going to do, do it. I will file it either way.`

## 3 · Victory progress — `victoryprogress::`

Fires when a player crosses a threshold on any of the five conditions. This is where the game's own win
screens argue with each other (see `00-premise.md`), and Rell should not sound the same about all five.

**Domination** — `We hold ${percent}% of the colonisable worlds. The Registrar's office is asking after you. That means they have started counting.`

**Elimination** — `${playerName} has no worlds left. There is a manifest for that too and I have filed it.`

**Economic** — `We have accumulated ${total}. Safety is apparently a thing that can be afforded. I would like that to be true.`

**Scientific** — `${researched} of ${total} technologies. At the end of that list is a Lamp, and everyone in this galaxy knows it, and nobody has said so in a chamber.`

**Time** — `Turn ${turn} of ${limit}. Whoever is holding the most ground when the clock stops is the answer. It is not a good answer. It is the one the rules give.`

**And a warning line, when a *rival* crosses a threshold:**

> `${empire} is close. I have their public filings and I have our estimate of what they are not filing, and the gap between those two numbers is the only thing I can tell you with confidence.`

## 4 · Game over — `gameover::`

One line per outcome. **No variants.** This is the last thing the player hears.

**Victory by Domination** — `It is done. Three-quarters of the worlds and a chart that reaches all of them. I have the manifests for what that cost and I am not going to read them to you tonight.`

**Victory by Elimination** — `We are the last empire with a world. I would like to record that I do not know what to write in the third paragraph. There is no pre-printed text for this.`

**Victory by Economic** — `The reserve is full. Eleven months of everything, and then some. My great-grandmother would have understood exactly what we have done and why.`

**Victory by Scientific** — `The tree is complete. Every technology available to us, and the last of them is a specification for a Lamp, and it is buildable, and I am going to file this report before anyone asks me what I think.`

**Victory by Time** — `The clock has stopped and we are holding the most. Nobody won. Somebody is standing.`

**Defeat** — `${empire} has it. I am closing the series. For what it is worth, and I am aware of how little that is: everything we swept is still swept. The shoals we cleared are clear for whoever comes next, including them. That part does not un-happen.`

---

## Craft notes

**Silence is a design choice here and it is the most important one in the file.** Events 1 and 2 fire on
every turn and every second respectively, and the temptation is to fill them. Filling them destroys Rell.
The narrator has to be *worth listening to*, which means being absent most of the time.

**The five victory lines are the payoff for `00-premise.md`.** The game already ships five win conditions
that are five different answers to *the galaxy was safe once — do we want it back, or do we want to know
why we lost it?* — and until now nothing in the game has noticed. The Scientific line is the one that
matters: *at the end of that list is a Lamp, and everyone in this galaxy knows it, and nobody has said so in
a chamber.*

**The defeat line is deliberately the warmest thing in the whole script.** *Everything we swept is still
swept. That part does not un-happen.* It is the thesis of `15-series-twelve/` — the Sweeping is working,
and nobody notices because everyone only sees their own losses — delivered at the exact moment a player has
only seen their own losses.

It is also the only line in the feed that is kind to the player, and it fires when they have lost, and that
is where it should be.
