# Battle

Two events, and they fire at the loudest moments in the game, which is exactly why Rell gets *quieter*
here. The 3D battle theatre and the audio are already doing spectacle. The feed's job is the ledger.

---

## 1 · Battle won

**Current:** `Battle report: Victory in sector ${sectorLabel}. Enemy losses ${defenderLosses}, your losses ${attackerLosses}.`

- **a** — `Battle report: ${sectorLabel} held. Their losses ${defenderLosses}, ours ${attackerLosses}. I have both manifests. I would rather have neither.`
- **b** — `Battle report: Victory, ${sectorLabel}. ${defenderLosses} of theirs, ${attackerLosses} of ours. The sector is ours and the arithmetic is in our favour, and that is the whole of what I can say for it.`
- **c** — `Battle report: ${sectorLabel} taken. Enemy ${defenderLosses}, ours ${attackerLosses}. Somebody in their service is writing to families tonight, and so am I.`

## 2 · Battle lost

**Current:** `Battle report: Defeat in sector ${sectorLabel}. Enemy losses ${attackerLosses}, your losses ${defenderLosses}.`

- **a** — `Battle report: ${sectorLabel} lost. Ours ${defenderLosses}, theirs ${attackerLosses}. I have written to fourteen families this season and I would appreciate a reason not to write more.`
- **b** — `Battle report: Defeat, ${sectorLabel}. We lost ${defenderLosses}; they lost ${attackerLosses}. The crews did not arrive. The sector is theirs.`
- **c** — `Battle report: ${sectorLabel} is theirs. ${defenderLosses} of ours against ${attackerLosses} of theirs. I will have the full telemetry by morning, for whatever that is worth to the fourteen.`

---

## Craft notes

**Both events keep the numbers first**, exactly as the current strings do, because the player needs them
and because Rell's whole register is *number, consequence, recommendation.* Nothing here is decoration
laid over the data; the data is the sentence.

**Rell is quieter in victory than in defeat**, which is the reverse of the genre convention and the single
most characterising choice available in this file. Variant 1a — *I have both manifests. I would rather have
neither* — is the closest Rell ever comes to an opinion about the war itself, and it fires on a **win**.

**2a is the only line in the entire feed that asks the player for something.** *I would appreciate a
reason not to write more.* It is not a rebuke and it must not be delivered as one; it is a professional
stating a workload. Use it sparingly — if the variant rotation is implemented, weight 2a to roughly one
firing in four, so that it lands as a person rather than a nag.

**The stealth case.** When the enemy is the Shadow Realm and their stealth signature beats the player's
detection, `resolveBattle` returns a summary instead of full telemetry. That deserves its own line and it
is nearly free:

> `Battle report: ${sectorLabel}. I have the outcome and I do not have the composition — their signature was better than our sensors. I can tell you that we lost ${defenderLosses}. I cannot tell you to what.`

That is the one place in the game where the Shadow Realm's entire mechanical identity becomes something
the player *feels* rather than reads in a race blurb.
