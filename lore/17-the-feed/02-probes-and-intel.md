# Probes and Intel

Three events, and they carry the theme more directly than anything else in the feed: **knowledge is
bought, and the price is paid in advance.**

---

## 1 · Probe destroyed

**Current:** `Error: Our probe was destroyed while entering sector ${targetSector}.`

- **a** — `Error: Probe did not arrive at ${targetSector}. Three hundred of reckoning for one fact, and the fact is that we were right to send the probe and not the fleet.`
- **b** — `Error: We lost the probe at ${targetSector}. It bought us the one thing we needed to know about ${targetSector}, which is that we should not go there.`
- **c** — `Error: Probe lost, ${targetSector}. That is the cheapest that sector was ever going to be.`

## 2 · Sector flagged probe-hostile

**Current:** `Sector ${targetSector} is now flagged probe-hostile on your map.`

- **a** — `${targetSector} is flagged probe-hostile. Somebody over there is salting — feeding false traces to anything we send. That is legal and I have filed it as such.`
- **b** — `${targetSector} flagged: our probes are being given false charts and flying them. It is not interception. It is worse than interception.`
- **c** — `${targetSector} is probe-hostile. Their counter-intelligence is better than our probes. Recommend we fix the second problem rather than the first.`

**A note for whoever implements this.** The Star Nomads hold a funeral for a probe killed this way, and
they are the only people in the galaxy who do, because a salted probe is a machine that was given a false
schedule and flew into it — which is precisely what happened to the entire Nomad people. **If the player
is ever allied with the Fleet when this fires, Rell should say so, once, and never again:**

> `${targetSector} is probe-hostile. The Fleet will want to know; they hold a rite for this and I have never been able to explain to my own service why.`

## 3 · Probe unaffordable

**Current:** `Error: Probes cost ${PROBE_COST_CRYSTAL} crystal`

- **a** — `Error: A probe is ${PROBE_COST_CRYSTAL} crystal and we have not got it. The alternative is a fleet, and a fleet costs more than three hundred.`
- **b** — `Error: ${PROBE_COST_CRYSTAL} crystal for a probe. We are short. I would rather tell you that than watch you find out the other way.`
- **c** — `Error: We cannot afford the probe — ${PROBE_COST_CRYSTAL} crystal. Knowing is not free out here. It is just cheaper than the alternative.`

---

## Craft notes

**Event 1a is the thesis of the game in twenty-eight words**, and it is the line I would put on the store
page. It states the price, names what was purchased, and concludes that the trade was correct — and it is
still a loss, and Rell does not soften it.

**Event 2 is where the Intel branch stops being a stat.** The current string is accurate and inert.
Salting is not shooting a probe down; it is handing a machine a chart that is a lie and letting it fly.
Once the player understands that, Counter-Intelligence stops being a number and starts being something
they have an opinion about.

**Event 3 must not scold.** The player is being told they cannot afford information. All three variants
end by restating that the alternative is more expensive, because that is a *fact* and not a reproach, and
Rell never editorialises on a decision the player has not made yet.
