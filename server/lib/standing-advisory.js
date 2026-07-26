/**
 * standing-advisory.js - the Registry's opening word on a cluster.
 *
 * WHY THIS EXISTS. This is a primarily multiplayer game with many end states, so no match can ever be
 * authored. The device borrowed here is *Curse of Strahd*'s Tarokka reading (lore/29-borrowed-machinery.md
 * B1): draw at the start, change nothing about the rules, and the run stops feeling predetermined and
 * starts feeling like it was dealt to you. The received account of why that works is exactly our problem -
 * it makes a randomised experience feel personalised rather than generic.
 *
 * TWO PROPERTIES, AND BOTH MATTER.
 *
 * 1. **It is true.** Every figure is counted off the generated map. If the advisory says two mouths are
 *    charted, `generateGameMap` rolled two black holes. That turns flavour into information a player can
 *    learn to read, which is the only kind of flavour this setting respects - and it means the text can
 *    never contradict the board, because it is derived from it.
 *
 * 2. **It is deterministic.** Which phrasing is used comes from a hash of the game id, exactly as
 *    `sector-names.js` derives permanent chart names, so a reconnect or a server restart reads the same
 *    advisory back. A reading that changes when you refresh is not a reading.
 *
 * WHAT IT MUST NOT SAY. Nothing about where anything is - the whole map is fogged at turn one and this
 * is not an intelligence leak. Counts and character only. And nothing about artifacts: a relic's location
 * is a discovery (lore/27-the-unattributed.md) and even the total would be a head start.
 */

/** Deterministic non-negative hash. Same construction as sector-names.js, for the same reason. */
function seedFrom(gameId) {
    const text = `advisory:${gameId}`;
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash);
}

/** Pick deterministically from a list, offset so different lines of one advisory do not rhyme. */
function draw(seed, offset, options) {
    return options[(seed + offset * 7) % options.length];
}

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve'];

function count(n) {
    return n < NUMBER_WORDS.length ? NUMBER_WORDS[n] : String(n);
}

/** Sentence-initial counts have to be capitalised, and "16" must not become "16". */
function Count(n) {
    const word = count(n);
    return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * Yield thresholds below which the advisory calls a cluster poor.
 *
 * MEASURED, NOT GUESSED. The first version of this file used `< 95`, which is dead code: across 300
 * generated 14x8 maps the average colonizable-world bonus runs
 *
 *     crystal  min 130 · p10 142 · median 150 · p90 158 · max 167
 *     metal    min 127 · p10 141 · median 151 · p90 160 · max 168
 *
 * so neither branch could ever fire and every advisory ended on the same line. 145 sits around the
 * fifteenth percentile, which makes a resource warning uncommon rather than never.
 * `tests/standing-advisory.test.js` fails if a generator change makes these unreachable again.
 */
const POOR_CRYSTAL = 145;
const POOR_METAL = 145;

/** Sector-type tallies, straight off the generated map. */
function survey(map) {
    const tally = { mouths: 0, shoals: 0, stars: 0, colonizable: 0, large: 0, metal: 0, crystal: 0, worlds: 0 };
    for (const sector of map || []) {
        const type = Number(sector && (sector.type ?? sector.sectortype)) || 0;
        if (type === 1) tally.shoals += 1;
        if (type === 2) tally.mouths += 1;
        if (type === 3) tally.stars += 1;
        if (type >= 6 && type <= 10) {
            tally.colonizable += 1;
            tally.metal += Number(sector.metalbonus) || 100;
            tally.crystal += Number(sector.crystalbonus) || 100;
            tally.worlds += 1;
        }
        if (type === 9) tally.large += 1;
    }
    tally.metalAvg = tally.worlds ? tally.metal / tally.worlds : 100;
    tally.crystalAvg = tally.worlds ? tally.crystal / tally.worlds : 100;
    return tally;
}

/**
 * Compose the advisory. Returns an array of plain lines, each one a separate feed entry, so it reads
 * like a document being read out rather than a wall of text.
 */
function compose(gameId, map) {
    const s = seedFrom(gameId);
    const t = survey(map);
    const lines = [];

    // 1 - the survey's own reliability. Pure character, and it sets the register.
    lines.push(draw(s, 1, [
        'Standing advisory, this cluster. The survey is old and the amendments are older. Read it as a rumour with paperwork.',
        'Standing advisory, this cluster. Two offices submitted charts and they do not agree. Both are filed.',
        'Standing advisory, this cluster. The last survey was signed by somebody who did not return to countersign it.',
        'Standing advisory, this cluster. Everything below was bought. None of it was bought recently.'
    ]));

    // 2 - the mouths. The one figure that is worth a life, so it is never dressed up.
    if (t.mouths === 0) {
        lines.push('No collapsars are charted here. That is not the same as none being present; it means nobody has lost a fleet to one yet.');
    } else {
        lines.push(`${Count(t.mouths)} ${t.mouths === 1 ? 'mouth is' : 'mouths are'} charted in this cluster. `
            + `Every one of those entries was made because a fleet was sent and did not come back. `
            + `${t.mouths === 1 ? 'It is' : 'They are'} not marked on your chart yet.`);
    }

    // 3 - the shoals, framed as the opportunity they are. This is Law 6 and the fiction is told to
    //     treat it as sacred (lore/11-laws-of-the-world.md, lore/03-themes.md).
    if (t.shoals === 0) {
        lines.push('No shoals are recorded. Nothing here can be made permanently safe, and nothing here has to be paid for twice.');
    } else {
        lines.push(`${Count(t.shoals)} ${t.shoals === 1 ? 'shoal' : 'shoals'} recorded. `
            + draw(s, 3, [
                'Each one is a road that has not been paid for.',
                'Sweep them and they stay swept. It is the only promise this office can make.',
                'They will cost you hulls once and nothing ever again.',
                'The people who sweep those will be dead long before the last convoy uses them.'
            ]));
    }

    // 4 - the economy, as a warning about what will run short first.
    if (t.crystalAvg < POOR_CRYSTAL) {
        lines.push(draw(s, 4, [
            'Reckoning is thin in this cluster. Budget your probes; the alternative is a fleet, and a fleet costs more.',
            'Crystal yields here are below standard. Expect to choose between knowing and moving.'
        ]));
    } else if (t.metalAvg < POOR_METAL) {
        lines.push(draw(s, 5, [
            'Ore is poor here. Hulls will come slowly and you will feel every one you lose.',
            'Metal yields are below standard. This is a cluster that rewards not losing things.'
        ]));
    } else {
        lines.push(`${Count(t.colonizable)} worlds can be settled, ${count(t.large)} of them good ground. `
            + draw(s, 6, [
                'Somebody will hold the good ones by the third season. It may as well be us.',
                'The good ground was fought over before the Lamps went out. It will be again.'
            ]));
    }

    return lines;
}

module.exports = { compose, survey, seedFrom, POOR_CRYSTAL, POOR_METAL };
