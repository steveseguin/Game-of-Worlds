# Refusals — and where the humour goes

Three events, and a charter.

An audit of this folder found that in a hundred thousand words there was **almost no humour and almost no
joy** — that the Star Nomads are described as the funniest people in the galaxy and never given a funny
scene, and that Liaison Fourth is potentially hilarious and is only ever used for pathos. That is a real
defect. Saga and Sandman are funny, and it is load-bearing rather than decorative: a register with no
relief stops registering.

**A refusal is where the wit belongs.** Rell telling you that you cannot do a thing is low-stakes, fires
constantly, and is the one place dryness reads as character instead of flippancy. Nobody has died. You have
merely tried to spend money you have not got.

---

## The charter

1. **Never funny about a loss.** Not once, not obliquely, not with a lightening of tone. Hazards, battles,
   probes and notifications are humour-free forever.
2. **Dry, never quippy.** No exclamations. No wordplay. No fourth wall. The joke is always an
   understatement, and it is usually about bureaucracy or about another civilisation being immovable.
3. **Rell is never funny at the player's expense.** They are funny at the *situation's* expense, and
   occasionally at their own service's.
4. **Roughly one refusal in three should have any wit in it at all.** The rest are plain. A feed that is
   consistently witty is a feed nobody trusts with bad news.

---

## 1 · Cannot afford movement

**Current:** `Error: Not enough crystal for movement (need ${moveCost})`

- **a** — `Error: We cannot pay for that crossing — ${moveCost} crystal. I can show you the ledger or you can take my word for it, and the ledger is duller.`
- **b** — `Error: ${moveCost} crystal to move that fleet and we have not got it. Reckoning is what we burn to know where we are, and we are currently rich in ships and poor in knowing.`
- **c** — `Error: Insufficient crystal — ${moveCost} needed.`

## 2 · Not enough ships in a sector

**Current:** `Error: Not enough ships in sector ${sourceSector}`

- **a** — `Error: There are not that many hulls at ${sourceSector}. I have counted them twice, which is one more time than the order required.`
- **b** — `Error: ${sourceSector} does not have the hulls for that. Whatever the fleet panel told you, the manifest is the manifest.`
- **c** — `Error: Not enough hulls at ${sourceSector}.`

## 3 · Generic gate — technology or requirement not met

**Current:** `Error: ${check.reason}`

*This one passes through an upstream reason string, so the wrapper is all we control. Keep it thin.*

- **a** — `Error: ${check.reason}`
- **b** — `Error: ${check.reason} I have it in front of me if you want to argue with it.`
- **c** — `Error: ${check.reason} That is the requirement, not my opinion of it.`

---

## Craft notes

**1a is the model line for this whole file.** *I can show you the ledger or you can take my word for it,
and the ledger is duller.* Nobody has died, Rell has been asked to do an impossible thing, and the joke is
about paperwork — which is the only subject Terrans are funny about, per `14-peoples/01-terran.md`.

**2a is the second model.** *I have counted them twice, which is one more time than the order required.*
That is a Chart-Warden's entire personality in fourteen words, and it is funny because it is sincere.

**Three further humour slots exist elsewhere in the feed and no more.** They are deliberately rationed:

- `04-research-and-doctrine.md` event 4a — *"I asked one of their liaisons why, once, and we were both
  there for some time."* (Fourth.)
- `03-colonies-and-building.md` event 4a — *"More capacity, which means more hulls, which means more
  manifests. I am not complaining."*
- `03-colonies-and-building.md` event 6c — *"Two would not produce twice as much; we have tried it as an
  empire and it is in the literature."*

**Five jokes in a hundred-and-eight-line script.** That is the correct ratio for this register: enough that
the player learns Rell has a sense of humour, few enough that they wait for it. A sixth would start to cost
the feed its authority, and the feed's authority is the only reason event 6 in
`01-movement-and-hazards.md` works at all.

**Where the rest of the humour should go — a note for later passes.** Not here. The genuinely funny material
in this setting is in *scenes between civilisations*, and it is untouched: a Void Walker enduring a
four-hour Titan meal; Fourth's eleven wrong answers about what a scout is for; a Terran envoy on Sarn's
World filing a complaint about the absence of kitchens. Those are `18-`-and-later work, and the audit was
right that they are missing.
