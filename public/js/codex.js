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
 * The strip is a REAL TABLIST (see build() below) and the panel it drives is a real modal
 * dialog (the controller is in game.html). Nothing in here writes an inline style any more:
 * the material is `.codex-*` in css/style.css, so the codex is the same beveled console as
 * the HUD it opens over instead of the flat blue card it used to be.
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

                <p class="codex-aside">And in every capital the same project is quietly underway:
                rebuild a Lamp. Relight the lanes. Put the galaxy back the way it was.</p>
            `
        },
        {
            id: 'sectors',
            label: 'Sectors',
            html: `
                <p class="codex-note">Hover any sector you have explored for its type and yields.
                Under fog you are told nothing, because nothing is known.</p>
                <table class="codex-table">
                    <tbody>
                        ${[
                            ['Empty Space', 'Nothing to hold, nothing to fear, nothing to gain.'],
                            ['Asteroid Belt', 'A <em>shoal</em>. Half your hulls crossing, a quarter arriving — and safe forever once swept. Yields ore once secured.'],
                            ['Black Hole', 'A <em>mouth</em>. No roll, no survivors. Every one on the chart was found by a fleet that did not come back.'],
                            ['Unstable Star', 'Free to cross, impossible to keep &mdash; the exact inverse of a shoal. Nothing here will touch a fleet and nothing here will ever be yours.'],
                            ['Brown Dwarf', 'A failed star. Too dim to fight over, bright enough to fix a position by. Permanent.'],
                            ['Small Moon', 'Worthless as ground, decisive as a position. A rock at a junction of traces is a door.'],
                            ['Micro Planet', 'Ore, and somewhere to put a yard. Nobody is from a micro planet.'],
                            ['Small Planet', 'It will grow something if you argue with it.'],
                            ['Medium Planet', 'Grows willingly, and hides a problem. You find the problem in year three.'],
                            ['Large Planet', 'Good ground. Every one within reach was fought over before the Lamps went out.'],
                            ['Homeworld', 'Where you were standing when the Lamps went out. Nobody chose their capital.']
                        ].map(([name, line]) => `
                            <tr>
                                <td class="codex-term">${name}</td>
                                <td class="codex-def">${line}</td>
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
                <p class="codex-note">Twelve civilisations, and one question: <em>how do you cross a
                dark you cannot see into?</em> Every locked branch and forbidden hull is one of them
                answering it, and paying for the answer.</p>
                <table class="codex-table">
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
                                <td class="codex-term">${race}</td>
                                <td class="codex-def">${answer}</td>
                                <td class="codex-aside">refuses: ${refuses}</td>
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
                <table class="codex-table">
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
                                <td class="codex-term">${term}</td>
                                <td class="codex-def">${def}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `
        }
    ];

    let built = false;

    /* A REAL TABLIST, NOT FIVE STYLED BUTTONS.
     *
     * What was here was a row of <button>s with an inline style string swapped on click.
     * Three separate problems, all of them felt rather than theoretical:
     *
     *   - Nothing announced it as a tab strip. A screen reader read five buttons and
     *     then, further down the document, a slab of prose with no stated relationship
     *     to any of them, and no way to tell which button had produced it.
     *   - Arrow keys did nothing and all five tabs sat in the Tab order, so walking past
     *     the strip cost five presses — and the reader below it was not focusable at all,
     *     so a keyboard user could not scroll the thing they had just opened. The ARIA
     *     pattern is one stop for the whole strip plus arrows inside it.
     *   - Selection was carried by `background: rgba(255,255,255,0.10)` against
     *     `transparent`. That is a ~2% luminance step: the selected tab was, in practice,
     *     not marked at all. It is now a latched amber key that also sits lower in its
     *     socket, so the state survives greyscale.
     *
     * Roving tabindex, Left/Right/Home/End, automatic activation (the panels are static
     * strings, so there is nothing to defer).
     */
    const TAB_ID = id => 'codexTab-' + id;

    /** Render the tab bar and wire it. Idempotent - safe to call more than once. */
    function build() {
        const tabs = document.getElementById('codexTabs');
        const body = document.getElementById('codexBody');
        const help = document.getElementById('codexHelpPanel') || document.getElementById('codexHelp');
        if (!tabs || !body || !help || built) return;

        const all = [{ id: 'help', label: 'Quick Help' }].concat(SECTIONS);

        const keys = () => Array.prototype.slice.call(tabs.children);

        const show = (id, moveFocus) => {
            const section = SECTIONS.find(s => s.id === id);
            help.style.display = section ? 'none' : '';
            body.innerHTML = section ? section.html : '';
            body.style.display = section ? '' : 'none';
            // The reader is one panel that changes contents, so the name it reports has
            // to change with them, or every lore tab announces as "The Galaxy".
            if (section) body.setAttribute('aria-labelledby', TAB_ID(id));
            keys().forEach(b => {
                const on = b.dataset.codexTab === id;
                b.setAttribute('aria-selected', on ? 'true' : 'false');
                b.tabIndex = on ? 0 : -1;
                if (on && moveFocus) b.focus();
            });
        };

        tabs.innerHTML = '';
        all.forEach(entry => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'codex-tab';
            b.id = TAB_ID(entry.id);
            b.textContent = entry.label;
            b.dataset.codexTab = entry.id;
            b.setAttribute('role', 'tab');
            b.setAttribute('aria-controls', entry.id === 'help' ? 'codexHelpPanel' : 'codexBody');
            b.addEventListener('click', () => show(entry.id, false));
            tabs.appendChild(b);
        });

        /* AN OVERFLOWING STRIP WITH A HIDDEN SCROLLBAR IS A HIDDEN SECTION.
         *
         * The strip suppresses its scrollbar (a 15px browser bar inside a 32px key well
         * reads as damage), which is fine until it actually overflows — and then two of
         * the five sections sat off the right edge with no bar, no fade and no arrow.
         * A player on a phone or a short landscape window had no way to know the lore
         * tabs existed at all.
         *
         * Under 560px the stylesheet now wraps the strip to two rows, so there is
         * nothing to scroll. This covers the band in between: wide enough to stay on
         * one row, too narrow to fit it. MEASURED rather than guessed, and measured
         * from a ResizeObserver rather than on build, because the whole dialog is
         * display:none until it is opened and every dimension reads 0 until then.
         */
        function marks() {
            const slack = tabs.scrollWidth - tabs.clientWidth;
            const scrollable = slack > 2;
            tabs.classList.toggle('can-scroll-left', scrollable && tabs.scrollLeft > 2);
            tabs.classList.toggle('can-scroll-right', scrollable && tabs.scrollLeft < slack - 2);
        }
        tabs.addEventListener('scroll', marks, { passive: true });
        if (typeof ResizeObserver === 'function') new ResizeObserver(marks).observe(tabs);
        else window.addEventListener('resize', marks);

        tabs.addEventListener('keydown', event => {
            const order = keys();
            const at = order.indexOf(document.activeElement);
            if (at < 0) return;
            let next = null;
            if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (at + 1) % order.length;
            else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (at - 1 + order.length) % order.length;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = order.length - 1;
            if (next === null) return;
            event.preventDefault();
            show(order[next].dataset.codexTab, true);
        });

        built = true;
        show('help', false);
        marks();
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
