# Research and Doctrine

Seven events. Two jobs here. Research completion has to carry the *excavation* theme — a breakthrough is
catching up with the dead, not a leap forward. And the doctrine refusals are the only place in the shipped
game where a race's identity is stated to the player, so they have to say something true about that
civilisation rather than just reporting a lock.

---

## 1 · Research complete

**Current:** `Success: Researched ${tech.name} Lv${check.nextLevel}`

- **a** — `Success: ${tech.name} programme concluded, level ${check.nextLevel}. We have caught up to something that was standard in the Concord. I would like to be pleased about it.`
- **b** — `Success: ${tech.name} Lv${check.nextLevel}. Rediscovered rather than discovered, but it works, and it is ours now.`
- **c** — `Success: ${tech.name} to level ${check.nextLevel}. Filed with the specification, so we do not have to find it twice.`

**And one special case worth the branch.** When the completed tech is the last available level of anything
in the ORBITAL branch — the Warp Gate line, the closest thing anyone can build to the Trellis:

> `Success: ${tech.name} Lv${check.nextLevel}. That is Trellis work. Crude, single-span, and ours, and eleven other empires are trying to do the same thing this season.`

## 2 · Tech branch closed to this race

**Current:** `Error: ${raceName} cannot research ${tech.name} — that path is closed to them.`

- **a** — `Error: ${raceName} will not research ${tech.name}. Not cannot — will not, and they have had a long time to change their minds.`
- **b** — `Error: ${tech.name} is closed to ${raceName}. It is a doctrine, not a gap. Ask them about it sometime; you will get an answer and it will be sincere.`
- **c** — `Error: ${raceName} does not take that path. Every empire buys its strengths somewhere, and this is where they paid.`

## 3 · Tech level capped for this race

**Current:** `Error: ${raceName} can only research ${tech.name} to Lv${techCap}.`

- **a** — `Error: ${raceName} take ${tech.name} to Lv${techCap} and no further. Past that it stops being their kind of problem.`
- **b** — `Error: Lv${techCap} is where ${raceName} stop with ${tech.name}. They are not behind. They arrived, looked at it, and declined.`
- **c** — `Error: ${tech.name} caps at Lv${techCap} for ${raceName}.`

## 4 · Hull outside doctrine

**Current:** `Error: ${race.name} cannot build ${shipData.name} — it's outside their doctrine.`

- **a** — `Error: ${race.name} do not build the ${shipData.name}. I asked one of their liaisons why, once, and we were both there for some time.`
- **b** — `Error: No ${shipData.name} from ${race.name}. There is a reason and it is four hundred years old and they will not be talked out of it.`
- **c** — `Error: ${race.name} have never built a ${shipData.name}. Not this generation — *never*.`

## 5 · Shipyard level insufficient

**Current:** `Error: ${shipData.name} requires Military Shipyards ${yardsNeeded} (Shipyards branch)`

- **a** — `Error: ${shipData.name} needs Military Shipyards ${yardsNeeded}. The hull is not the problem; the yard that builds it is.`
- **b** — `Error: Shipyards ${yardsNeeded} for a ${shipData.name}. We can draw one today and we cannot lay one down.`
- **c** — `Error: ${shipData.name} requires Military Shipyards ${yardsNeeded}, Shipyards branch.`

## 6 · Local spaceport insufficient

**Current:** `Error: ${shipData.name} requires a local Spaceport ${portLevelNeeded}`

- **a** — `Error: A ${shipData.name} needs a level ${portLevelNeeded} port *at that sector*. Hulls are built where they are built; nobody tows one.`
- **b** — `Error: Not there. ${shipData.name} wants a Spaceport ${portLevelNeeded} on site.`
- **c** — `Error: Local Spaceport ${portLevelNeeded} required for ${shipData.name}.`

## 7 · Spaceport upgrade gated

**Current:** `Error: Spaceport ${nextLevel} requires Military Shipyards ${tier.research}`

- **a** — `Error: Port level ${nextLevel} needs Military Shipyards ${tier.research} first. The research comes before the concrete; it always has.`
- **b** — `Error: Spaceport ${nextLevel} is gated on Shipyards ${tier.research}.`
- **c** — `Error: We know how to build a level ${nextLevel} port in theory. Shipyards ${tier.research} is where the theory stops.`

---

## Craft notes

**Event 1 is the excavation theme and it is easy to lose.** The current string is a congratulation. All
three variants keep the achievement and remove the triumph, because in this setting a completed technology
is *catching up with the dead* — and 1a says so outright, once, in the only place a player will accept it.

**Events 2, 3 and 4 are the most valuable copy in this file** and they are currently pure UI text. This is
the only moment in normal play when the game tells a player anything about a race's *character*, and the
whole `14-peoples/` folder exists behind these three strings.

The rule they all follow: **will not, rather than cannot.** The Silicon Collective will not build
missiles. The Mechanicus have never built a scout. The Titan shipwright's art has no small form. Every
lock in `RACE_ACCESS` is a conviction, and a refusal message that says *"outside their doctrine"* has told
the player nothing, while *"not cannot — will not, and they have had a long time to change their minds"*
has told them there is a civilisation on the other end of it.

**Event 4a is the only joke in this file** and it is Rell's driest: *I asked one of their liaisons why,
once, and we were both there for some time.* That is Liaison Fourth, and a player who has read the codex
will know it, and a player who has not will simply find it funny.
