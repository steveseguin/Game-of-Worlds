/**
 * advisor.js - Race-flavored advisor voice for game events.
 *
 * Watches game events and delivers short, characterful lines through the
 * avatar notification system — mockery, panic, gloating, and the occasional
 * begrudging compliment. Each race has a voice; lines are picked per event.
 *
 * API:
 *   Advisor.setRace(raceId)
 *   Advisor.say(eventKey, context)       // fire a specific event quip
 *   Advisor.observe(rawServerMessage)    // pattern-match server text → quips
 */
const Advisor = (function () {
    // Voice styles. Races map onto one of these so 12 races stay manageable.
    const VOICES = {
        dry: {     // Terran default: deadpan professional
            probeLost: [
                "Our probe exploded. It died doing what probes do best: disappointing us.",
                "Probe lost. The good news is it found something. The bad news is everything else.",
                "Telemetry ended abruptly. I've billed it as 'field testing.'"
            ],
            blackHole: [
                "We found a black hole. The fleet found it first.",
                "The fleet's final report: 'spaghetti.' My condolences.",
                "Gravity: 1. Our navigation officer: 0."
            ],
            asteroidLoss: [
                "We lost ships in the asteroid field. Control the sector and the rocks stop winning.",
                "The asteroids took their toll. Literally. They charge by the hull.",
                "Some ships didn't make it. The rocks remain unapologetic."
            ],
            asteroidEscape: [
                "We threaded the asteroid field untouched. Statistically embarrassing — for the rocks.",
                "No losses. The pilots are insufferably proud now."
            ],
            colonized: [
                "Colony established. Try not to misplace civilization.",
                "Another world joins us. The paperwork is already late.",
                "Flag planted. The locals (rocks) offered no resistance."
            ],
            battleStart: [
                "Enemy fleet engaged. They appear optimistic.",
                "Combat under way. I've prepared both speeches.",
                "Weapons free. Do try to look surprised when we win."
            ],
            battleWon: [
                "Your fleet survived. Statistically annoying for them.",
                "Victory. The debris field is mostly theirs, which is the polite arrangement.",
                "We won. I've scheduled modest gloating at 0800."
            ],
            battleLost: [
                "Defeat. I recommend describing it as 'aggressive reconnaissance.'",
                "We lost the engagement. The enemy sends their regards. Repeatedly.",
                "That went poorly. Bold strategy. Terrible, but bold."
            ],
            researchDone: [
                "Research complete. The scientists want a parade. I offered a memo.",
                "New technology online. Please read the manual before detonating anything.",
                "Breakthrough achieved. Morale up, supervision still advised."
            ],
            enemySighted: [
                "Enemy contact on long-range sensors. They appear to be admiring your planets.",
                "Hostiles detected. Shall I pencil in a war?"
            ],
            lowCrystal: [
                "Crystal reserves are thin. Probes don't grow on trees. Nothing does, here.",
                "We're short on crystal. The refinery hums an apologetic tune."
            ],
            colonyReady: [
                "The colony ship is ready. Try not to misplace civilization.",
                "Colony ship fueled. Pick a nice planet. Or a terrible one — your call."
            ],
            shipBuilt: [
                "New hull off the line. It still smells of solder and optimism.",
                "Ship delivered. The yard crew requests you stop scratching them on asteroids."
            ],
            turnStart: [
                "New turn. The galaxy remains unimpressed but watchful.",
                "Resources are in. Spend them like someone's watching — someone is."
            ],
            gameWon: ["Victory! History will record this as inevitable. I'll make sure of it."],
            gameLost: ["Defeat. I've drafted a strongly-worded surrender."]
        },
        cold: {    // Machine/ascended races: precise, faintly contemptuous
            probeLost: [
                "Probe terminated. Data acquisition: partial. Sentiment: none.",
                "Unit expendable. Loss within parameters. Your distress is noted and discarded."
            ],
            blackHole: [
                "Fleet mass reassigned to singularity. Inefficient.",
                "Gravitational event. Survivors: zero. Lesson: priceless."
            ],
            asteroidLoss: [
                "Hull attrition recorded. Recommendation: own the rocks.",
                "Losses sustained. The asteroids do not negotiate. Neither do I."
            ],
            asteroidEscape: ["Field traversed. Zero losses. Probability defied; do not rely on it."],
            colonized: [
                "World assimilated into the collective ledger.",
                "Colony online. Productivity expectations: immediate."
            ],
            battleStart: ["Engagement initiated. Calculating enemy regret."],
            battleWon: ["Victory computed. Enemy projections were... amusing."],
            battleLost: ["Defeat registered. Recalibrating. Do not repeat this input."],
            researchDone: ["Knowledge integrated. The galaxy grows smaller and more obedient."],
            enemySighted: ["Foreign signature detected. Threat assessment: temporary."],
            lowCrystal: ["Crystal reserves suboptimal. Adjust priorities."],
            colonyReady: ["Colonization vector available. Select target. Avoid sentiment."],
            shipBuilt: ["New unit operational. It will serve. Or it will be scrap. Both acceptable."],
            turnStart: ["Cycle begins. Allocate. Execute. Repeat."],
            gameWon: ["Victory condition satisfied. As projected."],
            gameLost: ["Defeat. This outcome has been archived under 'anomalies.'"]
        },
        feral: {   // Swarm/warrior races: hungry, gleeful, blunt
            probeLost: [
                "The little probe is gone. The void chewed it. Send another — the void is still hungry.",
                "Probe dead. It screamed in radio. Lovely."
            ],
            blackHole: [
                "The dark mouth ate our fleet! Do not feed it again.",
                "Ships gone. The hole is fat with them. We remember this place."
            ],
            asteroidLoss: [
                "Rocks bit us! Take the field and the rocks become OUR teeth.",
                "Hulls cracked. The swarm endures. Barely. Annoyingly."
            ],
            asteroidEscape: ["We slipped between the stones. The stones are furious."],
            colonized: [
                "New ground! Dig in. Multiply. Decorate later.",
                "The world is ours. It tastes like metal and promise."
            ],
            battleStart: ["BLOOD IN THE BLACK! At last!", "They came to fight! How thoughtful. Eat them."],
            battleWon: ["Their fleet is confetti! Glorious!", "We won! Their wreckage makes fine nesting."],
            battleLost: ["We lost?! Unacceptable. Grow more ships. Sharpen everything."],
            researchDone: ["New cleverness! Strap it to something fast and pointy."],
            enemySighted: ["Prey on sensors. They call themselves an empire. Adorable."],
            lowCrystal: ["The crystal runs dry. The swarm grumbles. Feed it."],
            colonyReady: ["A seed-ship waits! Throw it at the stars!"],
            shipBuilt: ["A new fang for the swarm!"],
            turnStart: ["The cycle turns. Hunt well."],
            gameWon: ["THE GALAXY IS OURS! Try to look surprised."],
            gameLost: ["Beaten... this once. The swarm forgets nothing."]
        }
    };

    // Race id → voice. (1 Terran, 2 Silicon, 3 Zephyr, 4 Crystalline, 5 Void,
    // 6 Mechanicus, 7 Bioform, 8+ default by feel.)
    const RACE_VOICE = {
        1: 'dry', 2: 'cold', 3: 'feral', 4: 'cold', 5: 'cold',
        6: 'cold', 7: 'feral', 8: 'dry', 9: 'dry', 10: 'cold', 11: 'feral', 12: 'dry'
    };

    let raceId = 1;
    const recent = new Map(); // eventKey -> timestamp, basic anti-spam
    const COOLDOWN_MS = { turnStart: 240000, lowCrystal: 180000, default: 8000 };

    function setRace(id) {
        const numeric = Number(id);
        if (Number.isFinite(numeric) && numeric > 0) {
            raceId = numeric;
            if (window.AvatarNotifications?.setRace) {
                window.AvatarNotifications.setRace(numeric);
            }
        }
    }

    function pick(list) {
        return list[Math.floor(Math.random() * list.length)];
    }

    function say(eventKey, context = {}) {
        const voice = VOICES[RACE_VOICE[raceId] || 'dry'];
        const lines = voice[eventKey];
        if (!lines || lines.length === 0) return;

        const now = Date.now();
        const cooldown = COOLDOWN_MS[eventKey] || COOLDOWN_MS.default;
        if (recent.has(eventKey) && now - recent.get(eventKey) < cooldown) return;
        recent.set(eventKey, now);

        let line = pick(lines);
        if (context.sector) {
            line += ` (Sector ${context.sector})`;
        }

        const tone = /Won|colonized|researchDone|asteroidEscape|gameWon/.test(eventKey) ? 'success'
            : /Lost|blackHole|battleLost|gameLost/.test(eventKey) ? 'error'
            : /battleStart|enemySighted|asteroidLoss/.test(eventKey) ? 'warning'
            : 'info';

        if (window.AvatarNotifications?.show) {
            window.AvatarNotifications.show(line, tone);
        } else if (window.NotificationSystem?.notify) {
            window.NotificationSystem.notify('Advisor', line, tone === 'error' ? 'error' : 'info', 6000);
        }
    }

    // Pattern-match raw server text → advisor events.
    const OBSERVERS = [
        { re: /probe was destroyed in sector ([0-9A-F]+)/i, event: 'probeLost', sector: 1 },
        { re: /BLACK HOLE.*crushed|crushed by the immense gravity/i, event: 'blackHole' },
        { re: /destroyed our entire fleet|lost .* ships to asteroids/i, event: 'asteroidLoss' },
        { re: /avoided being hit/i, event: 'asteroidEscape' },
        { re: /Fleet claimed sector ([0-9A-F]+)|Success: Colonized sector (\d+)/i, event: 'colonized', sector: 1 },
        { re: /Battle report: Victory in sector ([0-9A-F]+)/i, event: 'battleWon', sector: 1 },
        { re: /Battle report: Defeat in sector ([0-9A-F]+)/i, event: 'battleLost', sector: 1 },
        { re: /Success: Purchased/i, event: 'researchDone' },
        { re: /Success: Built (Colony Ship)/i, event: 'colonyReady' },
        { re: /Success: Built (?!Colony)/i, event: 'shipBuilt' },
        { re: /An enemy fleet (was destroyed|lost)/i, event: 'enemySighted' }
    ];

    function observe(message) {
        if (typeof message !== 'string') return;
        for (const watcher of OBSERVERS) {
            const match = watcher.re.exec(message);
            if (match) {
                const context = {};
                if (watcher.sector && match[watcher.sector]) {
                    context.sector = match[watcher.sector];
                }
                say(watcher.event, context);
                return;
            }
        }
    }

    return { setRace, say, observe };
})();

if (typeof window !== 'undefined') {
    window.Advisor = Advisor;
}
