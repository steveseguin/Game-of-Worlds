/**
 * onboarding.js - First-game guided checklist
 *
 * Watches the commands the player sends (and key server replies) and checks
 * off the core loop: select home, build, research, probe, move, colonize,
 * end turn. Designed to teach the probe-vs-move risk decision and the
 * colony-ship flow without blocking anything.
 *
 * Loaded before connect.js; connect.js calls Onboarding.attach(websocket)
 * after opening the socket and Onboarding.observe(message) for each
 * incoming message.
 *
 * PRESENTATION. This shipped as a rounded translucent card with a mint accent
 * border and inline styles on every row - generic web chrome sitting in the
 * right-hand instrument column next to the event panel and the standing
 * advisory. It is now the same seated module they are: it takes style.css's
 * .gp-plate body and .gp-titlebar rail, a stencilled OPS-05 code, a segmented
 * lamp strip for progress, recessed sockets for the tick boxes and a sunken
 * well for the next-action hint. The .ob-* rules here carry structure only; the
 * material comes from the shared atoms, so a retune of the console retunes this
 * with it.
 *
 * GEOMETRY IS NOT OURS. applyResponsiveLayout() stacks this panel in the right
 * column and sets width/right/top/max-height with !important. The inline
 * position below is only what it looks like for the frame before that first
 * runs; do not grow it into a second opinion about where the panel goes.
 */
window.Onboarding = (function () {
    const STORAGE_KEY = 'gow-onboarding-v1';
    const STYLE_ID = 'onboarding-console-style';

    // `where` is the destination stencil in the right-hand column of each row.
    // The card is 340px wide once applyResponsiveLayout has it and the longest
    // label stops at about 45% of that, so half the panel was unallocated dark
    // space. A checklist that says WHERE each step happens as well as WHAT it is
    // is a better checklist, and it earns the width instead of padding it.
    const STEPS = [
        {
            id: 'inspect',
            label: 'Inspect a sector',
            where: 'MAP',
            hint: 'Click your gold homeworld tile (or the Home button).',
            outgoing: ['//sector:']
        },
        {
            id: 'build',
            label: 'Construct a building',
            where: 'BUILD',
            hint: 'Build tab: a Metal Extractor keeps your economy growing.',
            outgoing: ['//buybuilding:']
        },
        {
            id: 'ship',
            label: 'Build a ship',
            where: 'FLEET',
            hint: 'Fleet tab: scouts are cheap eyes; colony ships claim planets.',
            outgoing: ['//buyship:']
        },
        {
            id: 'research',
            label: 'Research a technology',
            where: 'TECH',
            hint: 'Research tab: each colored branch is a different playstyle.',
            outgoing: ['//buytech:'],
            incoming: [/^Success: Researched /]
        },
        {
            id: 'probe',
            label: 'Probe an unknown sector',
            where: 'MAP',
            hint: 'Probes cost 300 crystal but spare your ships from hazards.',
            outgoing: ['//probe:']
        },
        {
            id: 'move',
            label: 'Move your fleet',
            where: 'MAP',
            hint: 'Select a tile next to your ships. Beware asteroid belts and black holes!',
            outgoing: ['//move', '//sendmmf:', '//mmf']
        },
        {
            id: 'colonize',
            label: 'Colonize a planet',
            where: 'COLONY',
            hint: 'Move a colony ship to a planet whose terraform requirement you meet.',
            outgoing: ['//colonize'],
            incoming: [/^Success: Colonized /]
        },
        {
            id: 'endturn',
            label: 'End your turn',
            where: 'TURN',
            hint: 'Done for now? End the turn instead of waiting out the clock.',
            outgoing: ['//start']
        }
    ];

    // Drawn, so its size and weight are this file's rather than the font's - and
    // so it matches the same mark on the toast plates and the advisory key.
    const GLYPH_CLOSE = '<svg class="ob-mark" viewBox="0 0 12 12" aria-hidden="true" focusable="false">'
        + '<path d="M2.6 2.6 9.4 9.4M9.4 2.6 2.6 9.4" fill="none" stroke="currentColor" '
        + 'stroke-width="2" stroke-linecap="square"/></svg>';

    let state = { done: {}, dismissed: false, celebrated: false };
    let card = null;

    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) state = { ...state, ...JSON.parse(raw) };
        } catch (err) { /* private mode etc. */ }
    }

    function save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (err) { /* ignore */ }
    }

    function allDone() {
        return STEPS.every(step => state.done[step.id]);
    }

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            /* HEIGHT IS A BUDGET, NOT A PREFERENCE. applyResponsiveLayout stacks
               this above the event panel and the standing advisory and hides
               whatever no longer fits above the map legend, so every pixel this
               panel gains is taken off the panel below it. The first cut of this
               design ran 304px and pushed the event feed off the screen for the
               whole of a new player's first game. The list runs at 11.5/1.2 and
               the sockets, meter and hint well are all trimmed to land at the
               height the old card had - measured, not eyeballed. */
            #onboardingCard {
                width: 236px;
                padding: 1px 1px 0;
                border-radius: 3px;
                font-family: var(--font-ui, 'Rajdhani', 'Segoe UI', system-ui, sans-serif);
                font-size: 11.5px;
                color: var(--text, #cdd6e6);
                /* Fallback plate; .gp-plate supersedes all three with !important. */
                background: linear-gradient(180deg, #2b3447, #1d2433 52%, #141a26);
                border: 2px solid #05070d;
                box-shadow:
                    inset 2px 2px 0 rgba(176, 198, 232, 0.22),
                    inset -2px -2px 0 rgba(0, 0, 0, 0.62),
                    0 4px 0 #05070d,
                    0 12px 26px rgba(0, 0, 0, 0.55);
            }
            /* Fallback rail; .gp-titlebar supersedes it. */
            .ob-rail {
                position: sticky;
                top: 0;
                z-index: 3;
                margin: -1px -1px 7px;
                padding: 5px 10px 4px;
                font-family: var(--font-head, 'Russo One', sans-serif);
                font-size: 10px;
                line-height: 1.15;
                letter-spacing: 0.07em;
                text-transform: uppercase;
                color: var(--amber-hi, #ffce80);
                background: linear-gradient(180deg, #1a222f, #0d121c);
                border-bottom: 2px solid #05070d;
            }
            /* data-code brings a "position: relative" with it (style.css sets that
               on every [data-code] element) and that rule is declared after
               .gp-titlebar - so a titlebar carrying a code silently stops
               sticking. The card scrolls when the right column is short, so put
               the sticky back. */
            #onboardingCard .ob-rail {
                position: sticky;
                top: 0;
                z-index: 3;
                margin-bottom: 6px;
                padding: 5px 10px 4px;
                font-size: 10px;
                line-height: 1.15;
            }
            /* The stencilled code normally parks at right: 11px. The hide key lives
               there, so the code steps aside for it rather than printing under it. */
            #onboardingCard .ob-rail::after { right: 36px; }
            #onboardingCard .ob-hide {
                position: absolute;
                box-sizing: border-box;
                display: flex;
                align-items: center;
                justify-content: center;
                top: 3px;
                right: 6px;
                width: 21px;
                height: 17px;
                padding: 0;
            }
            #onboardingCard .ob-hide .ob-mark {
                display: block;
                width: 9px;
                height: 9px;
                color: var(--text, #cdd6e6);
            }
            /* Face restated on hover: a legacy global button:hover:not(:disabled)
               in style.css scores (0,2,1) and outranks .gp-key's own face at
               (0,2,0), so without this the hide key flattens to a plain blue-grey
               slab under the pointer. */
            #onboardingCard .ob-hide:hover:not(:disabled) {
                background: linear-gradient(180deg, var(--steel-hi, #445064), var(--steel-3, #1d2433) 55%, var(--steel-4, #141a26));
            }
            #onboardingCard .ob-hide:hover .ob-mark { color: var(--bright, #eef3fb); }
            #onboardingCard .ob-body { padding: 0 10px 9px; }

            /* The count rides in the rail. It had a segmented lamp strip of its own
               for one revision, which looked right and was pure redundancy - every
               row below already shows its own socket lit or dark - and it cost 17px
               of a budget the event panel needed back. */
            #onboardingCard .ob-count {
                margin-left: 7px;
                font-family: var(--font-mono, 'Share Tech Mono', ui-monospace, monospace);
                font-size: 10px;
                letter-spacing: 0.1em;
                color: var(--bronze, #c79a47);
            }

            /* THE ROW IS A FOUR-COLUMN INSTRUMENT: a cue gutter, a lamp in its
               socket, the label, and a destination stencil right. The dotted
               leader between the last two is what makes the width read as
               allocated rather than abandoned - it is a schedule, not a card with
               a dead half. (Neutral steel at 16%, not an accent: this is a leader
               rule inside content, never an edge treatment on the panel.) */
            #onboardingCard .ob-list { margin: 0; padding: 0; list-style: none; }
            #onboardingCard .ob-row {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 1px 0;
                line-height: 1.22;
            }
            /* THE HIERARCHY RUNS FORWARDS. What shipped had it backwards: the done
               tick was 2px of --amber-hi and the active marker was a 6x6 square of
               the duller --amber inset 3px inside its socket, so bright-and-big
               landed on the step you had already finished and small-and-dim on the
               one you are meant to do next. The active lamp is now the hero and
               the done tick retires to bronze. */
            #onboardingCard .ob-cue {
                position: relative;
                flex: 0 0 auto;
                width: 6px;
                height: 12px;
            }
            #onboardingCard .ob-row.is-active .ob-cue::after {
                content: "";
                position: absolute;
                left: 0;
                top: 3px;
                width: 0;
                height: 0;
                border-left: 5px solid var(--amber-hi, #ffce80);
                border-top: 3px solid transparent;
                border-bottom: 3px solid transparent;
                filter: drop-shadow(0 0 3px rgba(255, 206, 128, 0.55));
            }
            /* Machined socket: a rim, a lip and a lamp. Background and border used
               to be the same near-black on a #1d2433 plate, which made eight
               identical holes the most prominent shape in the panel and read as
               missing artwork. */
            #onboardingCard .ob-box {
                position: relative;
                box-sizing: border-box;
                flex: 0 0 auto;
                width: 12px;
                height: 12px;
                background: #090e16;
                border: 1px solid #05070d;
                box-shadow:
                    inset 1px 1px 3px rgba(0, 0, 0, 0.9),
                    inset -1px -1px 0 rgba(176, 198, 232, 0.12),
                    0 1px 0 rgba(176, 198, 232, 0.06);
            }
            /* THE LAMP ONLY EXISTS WHEN IT IS ON.
               A previous pass gave every pending row an UNLIT lamp - an 8x8 fill
               of #1b2331 inside the socket - on the theory that a lit lamp reads
               better against an unlit one than against a hole. Measured on the
               shipped frame it did the opposite: six identical mid-grey chips
               stacked down the left of the panel and became the most prominent
               shape in it, brighter and larger than either state that carries
               information, so the DEFAULT state out-shouted "done" and "do this
               next" both. It also read as unloaded artwork.
               A pending step is now a genuinely empty recessed socket - rim, lip
               and #090e16 bed, nothing in it - so the eye can count the ticks and
               find the amber marker without six grey blocks competing. This rule
               is the whole lamp: no base fill to override, and the done state no
               longer has to hide one. */
            #onboardingCard .ob-row.is-active .ob-box::before {
                content: "";
                position: absolute;
                inset: 2px;
                background: linear-gradient(180deg, #ffe6bd, var(--amber-hi, #ffce80) 55%, var(--amber, #f0a233));
                box-shadow: 0 0 6px rgba(255, 206, 128, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.55);
            }
            /* The done tick is VERDIGRIS, the console's role for "a thing was
               gained or secured" - the same green the toast plates and the
               standing advisory now use for a completed event, and the same hue
               the map key uses for a sector you hold. It was bronze, which is the
               emphasis role: every finished row read as an emphasised row. The
               three-state lightness hierarchy the labels carry (done 0.38L,
               pending 0.58L, active 0.94L) is untouched - only the lamp changes,
               and the tick still reads at 12px in greyscale because it is a
               drawn mark in a socket rather than a colour swatch. */
            #onboardingCard .ob-row.is-done .ob-box::after {
                content: "";
                position: absolute;
                left: 4px;
                top: 1px;
                width: 2px;
                height: 6px;
                border: 2px solid var(--verdigris, #6ba880);
                border-top: 0;
                border-left: 0;
                transform: rotate(40deg);
            }
            /* NO STRIKE-THROUGH. A rule drawn through the x-height of 11.5px
               Rajdhani turns the label into mush, and striking text out is a
               word-processor affordance - nothing else in this console does it.
               The dimmed label and the tick in its socket already say "done". */
            #onboardingCard .ob-label { flex: 0 1 auto; color: var(--muted, #8b94a8); }
            #onboardingCard .ob-row.is-active .ob-label { color: var(--bright, #eef3fb); font-weight: 600; }
            #onboardingCard .ob-row.is-done .ob-label { color: var(--faint, #5e6678); font-weight: 400; }

            #onboardingCard .ob-lead {
                flex: 1 1 auto;
                min-width: 6px;
                height: 0;
                margin: 1px 6px 0;
                border-bottom: 1px dotted rgba(176, 198, 232, 0.16);
            }
            #onboardingCard .ob-where {
                flex: 0 0 auto;
                font-family: var(--font-mono, 'Share Tech Mono', ui-monospace, monospace);
                font-size: 9px;
                letter-spacing: 0.1em;
                color: var(--faint, #5e6678);
            }
            #onboardingCard .ob-row.is-active .ob-where { color: var(--bronze, #c79a47); }

            /* Next action, sunk into the plate so it reads as a printed order
               rather than another line of the list. The tag runs inline with the
               copy: on its own line it cost 14px of a budget that has none. It is
               stencilled in the same recessed socket as the toast code chips, and
               UPPERCASE - every other mono mark in this product is (OPS-05,
               TUT-02, ADV-06, MSG, WRN, OK, ERR) and one title-case tag broke a
               language that is otherwise strictly kept. */
            #onboardingCard .ob-next {
                /* Flex, not an inline tag: with the tag inline the wrapped second
                   line ran back under it instead of aligning with the first, which
                   on a two-line hint is the only thing you notice. */
                display: flex;
                align-items: flex-start;
                margin-top: 6px;
                padding: 5px 7px;
                background: #05080e;
                border: 2px solid #05070d;
                box-shadow: inset 2px 2px 5px rgba(0, 0, 0, 0.78);
                line-height: 1.3;
                color: var(--text, #cdd6e6);
            }
            #onboardingCard .ob-next-text { flex: 1 1 auto; min-width: 0; }
            #onboardingCard .ob-next-tag {
                flex: 0 0 auto;
                margin-right: 7px;
                padding: 3px 5px 2px;
                font-family: var(--font-mono, 'Share Tech Mono', ui-monospace, monospace);
                font-size: 9px;
                letter-spacing: 0.12em;
                line-height: 1;
                text-transform: uppercase;
                color: var(--bronze, #c79a47);
                background: #05080e;
                box-shadow: inset 2px 2px 4px rgba(0, 0, 0, 0.85);
            }
        `;
        document.head.appendChild(style);
    }

    function ensureCard() {
        if (card || state.dismissed || allDone()) return;
        if (!window.location.pathname.includes('game.html')) return;
        ensureStyles();
        card = document.createElement('aside');
        card.id = 'onboardingCard';
        card.className = 'gp-plate';
        card.setAttribute('aria-label', 'First steps checklist');
        // Only what applyResponsiveLayout has not taken over yet.
        card.style.cssText = 'position:fixed;right:16px;top:230px;z-index:140;';
        card.addEventListener('click', event => {
            if (event.target.closest('#onboardingHide')) {
                state.dismissed = true;
                save();
                render();
            }
        });
        document.body.appendChild(card);
        render();
    }

    function render() {
        if (!card) return;
        if (state.dismissed) {
            card.remove();
            card = null;
            return;
        }
        const doneCount = STEPS.filter(step => state.done[step.id]).length;
        const next = STEPS.find(step => !state.done[step.id]);
        const rows = STEPS.map(step => {
            const done = Boolean(state.done[step.id]);
            const active = Boolean(next && next.id === step.id);
            const cls = done ? 'ob-row is-done' : active ? 'ob-row is-active' : 'ob-row';
            return `<li class="${cls}"><span class="ob-cue"></span><span class="ob-box"></span>`
                + `<span class="ob-label">${step.label}</span><span class="ob-lead"></span>`
                + `<span class="ob-where">${step.where}</span></li>`;
        }).join('');
        card.innerHTML = `
            <div class="gp-titlebar ob-rail" data-code="OPS-05">First Steps<span
                class="ob-count">${doneCount}/${STEPS.length}</span><button type="button" id="onboardingHide"
                class="gp-key ob-hide" title="Hide checklist" aria-label="Hide checklist">${GLYPH_CLOSE}</button></div>
            <div class="ob-body">
                <ol class="ob-list">${rows}</ol>
                ${next ? `<div class="ob-next"><span class="ob-next-tag">Next</span><span class="ob-next-text">${next.hint}</span></div>` : ''}
            </div>
        `;
    }

    function complete(stepId) {
        if (state.done[stepId]) return;
        state.done[stepId] = true;
        save();
        render();
        if (allDone() && !state.celebrated) {
            state.celebrated = true;
            save();
            if (window.NotificationSystem?.notify) {
                window.NotificationSystem.notify('Checklist complete', 'You know the core loop. Expand carefully - every move is a trade-off.', 'success', 8000);
            }
            setTimeout(() => {
                if (card) { card.remove(); card = null; }
            }, 6000);
        }
    }

    function observeOutgoing(command) {
        const text = String(command || '');
        STEPS.forEach(step => {
            (step.outgoing || []).forEach(prefix => {
                if (text.indexOf(prefix) === 0) complete(step.id);
            });
        });
    }

    function observe(message) {
        const text = String(message || '');
        // Surface the checklist once the game is actually running.
        if (text.indexOf('startgame::') === 0 || text.indexOf('techstate::') === 0) {
            ensureCard();
        }
        STEPS.forEach(step => {
            (step.incoming || []).forEach(pattern => {
                if (pattern.test(text)) complete(step.id);
            });
        });
    }

    function attach(ws) {
        if (!ws || ws.__onboardingWrapped) return;
        ws.__onboardingWrapped = true;
        const originalSend = ws.send.bind(ws);
        ws.send = function (data) {
            try {
                observeOutgoing(data);
            } catch (err) { /* never break the wire */ }
            return originalSend(data);
        };
    }

    load();
    return { attach, observe };
})();
