/**
 * codex.js - The setting, reachable from inside the game.
 *
 * Adds lore tabs to the existing help overlay. It does not replace Quick Help: that is the
 * new-player path and it stays the default tab.
 *
 * WHY THIS EXISTS. The project has a large amount of written setting and, until now, none of it
 * could be reached by a player. Everything they could learn about the galaxy came from event
 * copy. This is the cheapest possible fix, because the panel was already built and styled -
 * `helpOverlay` in game.html, with open/close already wired - so the only thing missing was
 * content and a way to switch between it.
 *
 * Source: lore/26-encyclopedia.md, condensed for screen. Figures marked in that document as
 * code-verified are the ones quoted here; sector names and the eleven type lines are the same
 * strings the map tooltip uses (public/js/ui.js SECTOR_LORE) and are checked against
 * server/lib/map.js by tests/lore-sector-types-match-code.test.js.
 *
 * Editing rules:
 *   - This is a panel, not a bible. If a section needs scrolling twice, it is too long.
 *   - Never quote a number that is not in lore/26-encyclopedia.md with a checkmark.
 *   - No accent-coloured edges. Neutral borders only.
 */
const Codex = (function () {
    const SECTIONS = [
        {
            id: 'galaxy',
            label: 'The Galaxy',
            html: `
                <p><strong>Nobody alive built the Trellis.</strong> For as long as anyone had records
                there were lanes between the stars — surveyed, swept, and lit by beacons called
                <em>Lamps</em> that let a ship at superluminal speed see what lay ahead. Twelve species
                grew on that network the way vines grow on a frame.</p>

                <p><strong>Then the Lamps went out.</strong> For nine days, ships in transit simply
                failed to arrive. The number lost is not known, because the count was kept by the
                Trellis. That was seventy-four years ago.</p>

                <p><strong>Now every crossing is blind.</strong> A ship above light speed receives no
                information about what is in front of it — the information arrives when the ship does.
                At that speed a gravel bank is ordnance and a collapsed star is an unmarked grave.</p>

                <p><strong>So knowledge is bought, and somebody else always paid for it.</strong> Every
                route on your chart was flown and survived by a crew you never met. To own a sector is
                to have paid for the knowledge of it.</p>

                <p style="opacity:0.72;">And in every capital the same project is quietly underway:
                rebuild a Lamp. Relight the lanes. Put the galaxy back the way it was.</p>
            `
        },
        {
            id: 'sectors',
            label: 'Sectors',
            html: `
                <p style="opacity:0.78;">Hover any sector you have explored for its type and yields.
                Under fog you are told nothing, because nothing is known.</p>
                <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
                    <tbody>
                        ${[
                            ['Empty Space', 'Nothing to hold, nothing to fear, nothing to gain.'],
                            ['Asteroid Belt', 'A <em>shoal</em>. Half your hulls crossing, a quarter arriving — and safe forever once swept. Yields ore once secured.'],
                            ['Black Hole', 'A <em>mouth</em>. No roll, no survivors. Every one on the chart was found by a fleet that did not come back.'],
                            ['Unstable Star', 'Throws radiation on a rhythm. The one dangerous place that can be learned instead of bought.'],
                            ['Brown Dwarf', 'A failed star. Too dim to fight over, bright enough to fix a position by. Permanent.'],
                            ['Small Moon', 'Worthless as ground, decisive as a position. A rock at a junction of traces is a door.'],
                            ['Micro Planet', 'Ore, and somewhere to put a yard. Nobody is from a micro planet.'],
                            ['Small Planet', 'It will grow something if you argue with it.'],
                            ['Medium Planet', 'Grows willingly, and hides a problem. You find the problem in year three.'],
                            ['Large Planet', 'Good ground. Every one within reach was fought over before the Lamps went out.'],
                            ['Homeworld', 'Where you were standing when the Lamps went out. Nobody chose their capital.']
                        ].map(([name, line]) => `
                            <tr>
                                <td style="padding:5px 10px 5px 0;vertical-align:top;white-space:nowrap;font-weight:600;">${name}</td>
                                <td style="padding:5px 0;vertical-align:top;opacity:0.75;">${line}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `
        },
        {
            id: 'twelve',
            label: 'The Twelve',
            html: `
                <p style="opacity:0.78;">Twelve civilisations, and one question: <em>how do you cross a
                dark you cannot see into?</em> Every locked branch and forbidden hull is one of them
                answering it, and paying for the answer.</p>
                <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
                    <tbody>
                        ${[
                            ['Terran Empire', 'Write everything down', 'To specialise in anything'],
                            ['Silicon Collective', 'Compute it', 'Ordnance you cannot recall'],
                            ['Zephyr Swarm', 'Send enough that some arrive', 'Any hull that could be mourned'],
                            ['Crystalline Entity', 'Endure it', 'Weapons that are not part of the body'],
                            ['Void Walkers', 'Outrun it', 'Armour, as an admission of slowness'],
                            ['Mechanicus', 'Do not look', 'Reconnaissance, entirely'],
                            ['Bioform Collective', 'Grow into it', 'Fortification, and the Trellis itself'],
                            ['Star Nomads', 'Never stop', 'To want a planet'],
                            ['The Ancients', 'We remember when it was light', 'To explain themselves'],
                            ['Quantum Entities', 'Decline to have crossed it', 'Being definitely anywhere'],
                            ['Titan Lords', 'Be too large for it to matter', 'Haste, and smallness'],
                            ['Shadow Realm', 'The dark suits us', 'To be counted']
                        ].map(([race, answer, refuses]) => `
                            <tr>
                                <td style="padding:5px 10px 5px 0;vertical-align:top;white-space:nowrap;font-weight:600;">${race}</td>
                                <td style="padding:5px 10px 5px 0;vertical-align:top;opacity:0.8;">${answer}</td>
                                <td style="padding:5px 0;vertical-align:top;opacity:0.55;">refuses: ${refuses}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `
        },
        {
            id: 'words',
            label: 'Words',
            html: `
                <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
                    <tbody>
                        ${[
                            ['Shoal', 'An asteroid belt. Navigator&rsquo;s word, and the only one anybody uses.'],
                            ['Mouth', 'A collapsed star. Not a hazard — an absence.'],
                            ['Swept', 'A shoal you hold: charted, cleared, corridored. Safe forever, and it yields ore. The one thing in this galaxy that stays fixed once you fix it.'],
                            ['Trace', 'A route somebody flew and survived. The most valuable object there is. Traces decay, because gravel drifts.'],
                            ['Clean crossing', 'A transit with no losses. The highest praise a Chart-Warden gives.'],
                            ['Reckoning', 'Refined crystal. What you burn to know where you are — probes, movement, spycraft. It is spent, never recovered.'],
                            ['Salting', 'Feeding an enemy probe a false trace so it flies where the trace says. Lawful, and the Star Nomads hold a funeral for it.'],
                            ['The Whisper', 'The surviving relay net. Carries voice anywhere, instantly. Carries no cargo, no people, and no sight — which is why you can talk to an empire you can never reach.'],
                            ['The Unarriving', 'The nine days. In speech, people say <em>when the Lamps went out</em>.'],
                            ['Did not arrive', 'Ships are destroyed. Crews did not arrive.']
                        ].map(([term, def]) => `
                            <tr>
                                <td style="padding:5px 10px 5px 0;vertical-align:top;white-space:nowrap;font-weight:600;">${term}</td>
                                <td style="padding:5px 0;vertical-align:top;opacity:0.75;">${def}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `
        }
    ];

    let built = false;

    function tabStyle(active) {
        return 'background:' + (active ? 'rgba(255,255,255,0.10)' : 'transparent')
            + ';border:1px solid rgba(255,255,255,0.10);border-radius:7px;'
            + 'color:' + (active ? '#e8ecff' : 'rgba(232,236,255,0.6)') + ';'
            + 'font-weight:600;font-size:11.5px;letter-spacing:0.4px;padding:5px 10px;cursor:pointer;';
    }

    /** Render the tab bar and wire it. Idempotent - safe to call more than once. */
    function build() {
        const tabs = document.getElementById('codexTabs');
        const body = document.getElementById('codexBody');
        const help = document.getElementById('codexHelp');
        if (!tabs || !body || !help || built) return;

        const all = [{ id: 'help', label: 'Quick Help' }].concat(SECTIONS);

        const show = id => {
            help.style.display = id === 'help' ? '' : 'none';
            const section = SECTIONS.find(s => s.id === id);
            body.innerHTML = section ? section.html : '';
            body.style.display = section ? '' : 'none';
            [...tabs.children].forEach(b => {
                b.setAttribute('style', tabStyle(b.dataset.codexTab === id));
            });
        };

        tabs.innerHTML = '';
        all.forEach(entry => {
            const b = document.createElement('button');
            b.textContent = entry.label;
            b.dataset.codexTab = entry.id;
            b.setAttribute('style', tabStyle(entry.id === 'help'));
            b.addEventListener('click', () => show(entry.id));
            tabs.appendChild(b);
        });

        built = true;
        show('help');
    }

    return { build, SECTIONS };
})();

if (typeof window !== 'undefined') {
    window.Codex = Codex;
    // The overlay markup is present from first paint, so building on DOMContentLoaded is enough.
    // game.html also calls build() when the panel opens, which is the belt to this braces.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', Codex.build);
    } else {
        Codex.build();
    }
}
