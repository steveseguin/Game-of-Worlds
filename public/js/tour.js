// tour.js - first-run orientation briefing.
//
// MATERIAL. The plate, the rail and the keys are style.css's own console atoms -
// .gp-plate, .gp-titlebar, .gp-key / .gp-key--amber - rather than values restated
// here. Borrowing the atoms is what stops this file drifting into a third visual
// language the next time the HUD is retuned. The local .tour-* rules are a
// low-specificity fallback for a page that lacks those atoms; on game.html
// style.css outranks every one of them.
//
// THREE THINGS THIS FILE MEASURES, none of which it used to.
//
// 1. WHAT THE STEP IS ACTUALLY POINTING AT. The step that teaches order-giving
//    used to frame the 535x390 minimap while its copy described the main hex map
//    and the sector panel - it lit the one thing it was not talking about and
//    dimmed both things it was. The map step now frames a MEASURED rectangle: the
//    3D viewport with whatever HUD is currently docked at its edges subtracted,
//    which is the board as the player actually sees it. Order-giving got its own
//    step on #sectordisplay, where the orders are.
//
// 2. HOW HARD THE SCRIM HITS. One 0.6 wash knocked the map from #0e1525 to
//    #050a12 - a 60% knock-down that took sector ownership hues and planet class
//    below the readability floor. GAMEPLAY SIGNAL IS SACRED even mid-tutorial, so
//    the scrim is now a two-stage penumbra: 0.28 for the first 26px around the
//    framed control, ~0.44 beyond it. The framed thing still separates, and an
//    amber ownership hex under the wash still reads amber.
//
// 3. WHERE THE PLATE GOES. Placement is a weighted global search, not a rule of
//    thumb. Every HUD panel carries a cost, the MAP KEY and the sector panel cost
//    six times what the chat feed does, and the solver sweeps the whole viewport
//    at three resolutions looking for the cheapest slot. If the cheapest slot
//    still lands on a protected panel it SHRINKS the plate and solves again, and
//    if that still fails it says so out loud (console.warn + data-fit="overlap")
//    instead of quietly printing over the map legend, which is what shipped.
(function () {
    'use strict';

    const STORAGE_KEY = 'gow-tour-dismissed-v1';
    const STYLE_ID = 'tour-console-style';
    const GAP = 14;   // clearance between the reticle and the briefing plate
    const EDGE = 12;  // keep-out from the window edge
    const HALO = 26;  // width of the softer inner ring of the scrim
    // Minimum air between the briefing plate and any HUD panel it does not
    // overlap. The solver used to charge for OCCLUSION only, so "3px clear" and
    // "40px clear" scored identically and it happily parked the plate 3px from
    // the FIRST STEPS checklist at 1920 - two raised plates with cast shadows,
    // both this file's family, reading as an accidental near-collision. It is the
    // same clearance the plate already keeps from the window edge.
    const GUTTER = 12;
    // Cost per pixel of gutter encroachment, per unit of panel weight. Sized
    // against the distance term below (16/px): a full 12px violation of the map
    // legend costs about as much as putting the plate 130px further from the
    // thing it describes, so the solver will happily walk around a panel but will
    // still choose a snug slot over an unreachable one.
    const GUTTER_COST = 18;
    // Flat surcharge for touching a PROTECTED panel at all, on top of the area
    // cost. It exists to keep the two penalties in the right order: without it,
    // the crowding term above (up to ~1.3k per panel, and several panels can be
    // crowded at once) could outbid a two-pixel clip of the command pad, and at
    // 1024x640 it did exactly that. Nothing may buy its way onto a protected
    // panel by being tidier somewhere else. It is flat, so among slots that all
    // hit something protected - which is the state at very small windows - the
    // ordering is unchanged and the compact-plate escalation still decides.
    const GUARD_PENALTY = 9000;

    const steps = [
        {
            id: 'step-resources',
            selector: '#resourceBar',
            code: 'TUT-01',
            title: 'Treasury',
            body: 'Metal, Crystal and Research pay for everything you build and everything you learn. The small figure under each is next turn\'s income.',
            placement: 'bottom'
        },
        {
            // The board itself. `region` wins over `selector`; the selector is the
            // fallback for a window with no 3D view, where the minimap IS the map.
            id: 'step-map',
            region: mapRegion,
            selector: '#minimapid',
            code: 'TUT-02',
            title: 'Tactical Display',
            body: 'The board. Every hex is a sector - click one to inspect it. Bright tiles are live sensor contact; dim tiles are memory from an older sweep.',
            placement: 'inside',
            // You cannot place a briefing off the board when the board is most of
            // the screen, and the lit region is the one place with no HUD in it.
            targetWeight: 0.25
        },
        {
            id: 'step-orders',
            selector: '#sectordisplay',
            code: 'TUT-03',
            title: 'Sector Orders',
            body: 'Whatever you select is reported here, and this is where orders are given. Move Ships dispatches an adjacent fleet into it.',
            placement: 'right'
        },
        {
            id: 'step-actions',
            selector: '#controlPadGUI',
            code: 'TUT-04',
            title: 'Command Pad',
            body: 'Buildings, defences and hulls are local to the owned sector you have selected. Research and the treasury are empire-wide.',
            placement: 'top'
        },
        {
            id: 'step-turns',
            selector: '#turnTimeBar',
            code: 'TUT-05',
            title: 'Turn Clock',
            body: 'Quick matches run on a short timer; Epic matches tick once a day. Queue your orders and log out - they resolve on the rollover.',
            placement: 'left'
        }
    ];

    // HUD furniture the briefing must not print over, and what each one COSTS.
    //
    // Area alone is the wrong metric and it is why the 1024x640 briefing sat on
    // the MAP KEY: the legend is small, so covering it was cheap, and it is the
    // player's only ownership/hazard key, so covering it was the most expensive
    // thing on screen. Anything at PROTECT or above is a panel the tutorial is
    // not allowed to quietly bury; below it is furniture we will trade away.
    const PROTECT = 3;
    const HUD_COST = {
        '#mapLegend': 6,        // the ownership + hazard key. First-class signal.
        '#sectordisplay': 5,    // the survey and every order button
        '#resourceBar': 4,
        '#turnTimeBar': 4,
        '#controlPadGUI': 3,
        '#event-panel': 3,
        '#minimapid': 2,
        '#onboardingCard': 2,
        '#avatar-notification-system': 2,
        '#empireSummary': 1.2,
        '#victoryProgress': 1.2,
        '#probeSuggestionCard': 1,
        '#viewTitle': 0.6,
        '#utilityButtons': 0.6,
        '#connectionInfo': 0.5,
        '#chatContainer': 0.4,
        '#chatFeed': 0.4,
        '#notification-container': 0.3
    };
    const HUD_SELECTORS = Object.keys(HUD_COST);

    let live = [];        // the steps whose targets actually exist this run
    let current = 0;
    let overlay = null;
    let halo = null;
    let spotlight = null;
    let reticle = null;
    let bubble = null;
    let repositionQueued = false;
    let watchTimer = null;
    let lastLayout = '';

    /* ------------------------------------------------------------------ */
    /* Chrome                                                              */
    /* ------------------------------------------------------------------ */

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #tour-overlay {
                position: fixed;
                inset: 0;
                z-index: 4000;
                pointer-events: none;
            }
            /* PENUMBRA, NOT A SLAB. Each ring is one element whose enormous
               box-shadow spread fills everything outside it, so two elements give
               a two-stage falloff: 0 inside the cutout, 0.28 for the first 26px,
               ~0.44 beyond. box-shadow blur cannot do this - the spec clips the
               shadow hard at the border box, so blur only softens the far edge
               that is 9999px off screen. Two solid layers, no blur, no canvas,
               and the map keeps its ownership hues under the wash. */
            #tour-halo, #tour-spotlight {
                position: fixed;
                border-radius: 2px;
                transition: top 0.2s ease, left 0.2s ease, width 0.2s ease, height 0.2s ease;
            }
            #tour-halo    { box-shadow: 0 0 0 9999px rgba(4, 8, 14, 0.22); }
            #tour-spotlight { box-shadow: 0 0 0 9999px rgba(4, 8, 14, 0.28); }

            /* TARGETING RETICLE. Deliberately NOT corner brackets: the minimap and
               half the HUD already wear 16px amber corner Ls, so a corner-bracket
               reticle landed a second identical mark 18px diagonally off the
               panel's own and read as a registration error, not as a reticle.
               Edge ticks sit at the middle of each side where no HUD furniture
               lives, they feather at the ends so they cannot be mistaken for a
               border, and the whole ring converges 14px on arrival so it is
               identifiable as motion. This is a selection indicator, not
               decoration. */
            #tour-ret {
                position: absolute;
                top: 0; right: 0; bottom: 0; left: 0;
                /* The amber ring carries a hard ink line just outside it. The map
                   is a lit 3D view whose background swings from near-black void
                   to a bright nebula, and a 0.5 amber hairline alone disappears
                   against the bright end; the dark companion gives it an edge to
                   sit on either way. */
                box-shadow:
                    inset 0 0 0 2px rgba(240, 162, 51, 0.55),
                    0 0 0 1px rgba(0, 0, 0, 0.7),
                    0 0 12px rgba(0, 0, 0, 0.45);
                animation: tourLock 0.46s cubic-bezier(0.16, 0.72, 0.24, 1) both;
            }
            @keyframes tourLock {
                0%   { top: -14px; right: -14px; bottom: -14px; left: -14px; opacity: 0; filter: brightness(2); }
                38%  { opacity: 1; }
                100% { top: 0; right: 0; bottom: 0; left: 0; opacity: 1; filter: brightness(1); }
            }
            #tour-ret i {
                position: absolute;
                filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.95));
            }
            #tour-ret i:nth-child(1), #tour-ret i:nth-child(2) {
                left: 50%;
                width: clamp(26px, 30%, 168px);
                height: 4px;
                transform: translateX(-50%);
                background: linear-gradient(90deg,
                    rgba(240, 162, 51, 0), var(--amber-hi, #ffce80) 40%,
                    #fff0d4 50%, var(--amber-hi, #ffce80) 60%, rgba(240, 162, 51, 0));
            }
            #tour-ret i:nth-child(1) { top: -3px; }
            #tour-ret i:nth-child(2) { bottom: -3px; }
            #tour-ret i:nth-child(3), #tour-ret i:nth-child(4) {
                top: 50%;
                width: 4px;
                height: clamp(22px, 30%, 126px);
                transform: translateY(-50%);
                background: linear-gradient(180deg,
                    rgba(240, 162, 51, 0), var(--amber-hi, #ffce80) 40%,
                    #fff0d4 50%, var(--amber-hi, #ffce80) 60%, rgba(240, 162, 51, 0));
            }
            #tour-ret i:nth-child(3) { left: -3px; }
            #tour-ret i:nth-child(4) { right: -3px; }

            #tour-bubble {
                position: fixed;
                z-index: 4001;
                pointer-events: auto;
                /* Fluid below ~1180px. A fixed 344px plate eats a third of a 1024
                   viewport, and every pixel of width it will not give up is a
                   pixel of HUD it has to sit on. */
                width: clamp(266px, 28vw, 344px);
                max-width: calc(100vw - 24px);
                padding: 1px 1px 0;
                border-radius: 3px;
                color: var(--text, #cdd6e6);
                font-family: var(--font-ui, 'Rajdhani', 'Segoe UI', system-ui, sans-serif);
                /* Fallback plate. .gp-plate in style.css supersedes all three of
                   these with !important on the game screen - but its --rivets
                   token floods the whole plate with its own last stop (a radial
                   gradient paints its final colour across the entire positioning
                   area), which is why this bubble sampled dead flat. The corrected
                   rivet recipe is declared once for the whole overlay domain,
                   #tour-bubble included, in notification-system.js; the long note
                   at its .notification/.confirm-modal rule is the explanation. */
                background: linear-gradient(180deg, #2b3447, #1d2433 52%, #141a26);
                border: 2px solid #05070d;
                box-shadow:
                    inset 2px 2px 0 rgba(176, 198, 232, 0.22),
                    inset -2px -2px 0 rgba(0, 0, 0, 0.62),
                    0 4px 0 #05070d,
                    0 12px 26px rgba(0, 0, 0, 0.55);
            }
            /* Fallback rail; .gp-titlebar supersedes it. */
            .tour-rail {
                margin: -1px -1px 9px;
                padding: 7px 11px 6px;
                font-family: var(--font-head, 'Russo One', sans-serif);
                font-size: 11px;
                letter-spacing: 0.07em;
                text-transform: uppercase;
                color: var(--amber-hi, #ffce80);
                background: linear-gradient(180deg, #1a222f, #0d121c);
                border-bottom: 2px solid #05070d;
            }
            #tour-bubble .tour-inner { padding: 0 12px 12px; }

            #tour-title {
                margin: 0 0 5px;
                font-family: var(--font-head, 'Russo One', sans-serif);
                font-size: 14px;
                letter-spacing: 0.045em;
                text-transform: uppercase;
                color: var(--amber-hi, #ffce80);
                text-shadow: 0 1px 0 #05070d;
            }
            #tour-body {
                font-size: 13.5px;
                line-height: 1.5;
                color: var(--text, #cdd6e6);
            }

            /* Progress readout: a segmented lamp strip and a stencilled count,
               seated in a groove. */
            #tour-bubble .tour-meter {
                display: flex;
                align-items: center;
                gap: 10px;
                margin: 11px 0 10px;
                padding-top: 9px;
                border-top: 2px solid var(--ink, #05070d);
                box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.05);
            }
            #tour-bubble .tour-pips { display: flex; flex: 1 1 auto; gap: 3px; }
            #tour-bubble .tour-pips b {
                flex: 1 1 auto;
                height: 7px;
                background: #05080e;
                box-shadow: inset 1px 1px 3px rgba(0, 0, 0, 0.9);
            }
            #tour-bubble .tour-pips b.on {
                background: linear-gradient(180deg, var(--amber-hi, #ffce80), var(--amber, #f0a233) 55%, var(--amber-lo, #9a5d11));
                box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
            }
            #tour-bubble .tour-count {
                font-family: var(--font-mono, 'Share Tech Mono', ui-monospace, monospace);
                font-size: 10px;
                letter-spacing: 0.14em;
                white-space: nowrap;
                color: var(--bronze, #c79a47);
            }

            #tour-bubble .tour-keys {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
            }
            #tour-bubble .tour-keys-right { display: flex; gap: 8px; }
            /* Geometry only - the key's material comes from .gp-key. */
            #tour-bubble .tour-key { padding: 8px 14px; font-size: 11px; }
            #tour-bubble #tour-skip { padding: 8px 11px; }

            /* COMPACT. Not a media query: the solver escalates to this when the
               full-size plate cannot clear a protected panel, whatever the window
               size. Roughly a fifth off the footprint, which is the difference
               between sitting on the MAP KEY and clearing it at 1024x640. */
            #tour-bubble.tour-compact { width: clamp(248px, 26vw, 316px); }
            #tour-bubble.tour-compact .tour-inner { padding: 0 10px 10px; }
            #tour-bubble.tour-compact .tour-rail,
            #tour-bubble.tour-compact .gp-titlebar { padding: 6px 9px 5px; font-size: 10px; }
            #tour-bubble.tour-compact #tour-title { font-size: 12.5px; margin-bottom: 3px; }
            #tour-bubble.tour-compact #tour-body { font-size: 12.5px; line-height: 1.4; }
            #tour-bubble.tour-compact .tour-meter { margin: 8px 0 8px; padding-top: 7px; }
            #tour-bubble.tour-compact .tour-key { padding: 6px 11px; font-size: 10.5px; }
            #tour-bubble.tour-compact #tour-skip { padding: 6px 9px; }

            /* Fallback key material, deliberately single-class so .game-page
               .gp-key (0,2,0) outranks it wherever style.css is present. */
            .tour-key {
                font-family: var(--font-head, 'Russo One', sans-serif);
                letter-spacing: 0.05em;
                text-transform: uppercase;
                color: var(--text, #cdd6e6);
                background: linear-gradient(180deg, #445064, #1d2433 55%, #141a26);
                border: 2px solid #05070d;
                border-radius: 2px;
                cursor: pointer;
                text-shadow: 0 1px 0 #05070d;
                box-shadow:
                    inset 1px 1px 0 rgba(255, 255, 255, 0.18),
                    inset -2px -2px 0 rgba(0, 0, 0, 0.55),
                    0 3px 0 #05070d;
            }
            .tour-key-amber {
                color: #2a1803;
                background: linear-gradient(180deg, #ffce80, #f0a233 52%, #9a5d11);
                text-shadow: 0 1px 0 rgba(255, 228, 175, 0.45);
            }
            .tour-key:disabled { cursor: default; }

            /* HOVER HAS TO BE DEFENDED. style.css still carries a legacy global
               button:hover:not(:disabled) with a flat rgba(60,68,98,0.95) fill,
               which scores (0,2,1) and therefore outranks .game-page
               .gp-key--amber at (0,2,0): put the pointer on NEXT and the amber
               primary flattens to a plain blue-grey slab with dark-brown text.
               The capture caught it on three of four steps at 1024x640.
               Restated here from the SAME tokens the atom uses, in a custom
               property, so a palette retune still carries - the values are not a
               second opinion, only a higher-specificity copy of the first. */
            #tour-bubble .tour-key {
                --key-face: linear-gradient(180deg, var(--steel-hi, #445064), var(--steel-3, #1d2433) 55%, var(--steel-4, #141a26));
            }
            #tour-bubble .tour-key-amber {
                --key-face: linear-gradient(180deg, var(--amber-hi, #ffce80), var(--amber, #f0a233) 52%, var(--amber-lo, #9a5d11));
            }
            #tour-bubble .tour-key:hover:not(:disabled) { background: var(--key-face); }

            @media (max-width: 520px) {
                #tour-bubble { width: calc(100vw - 24px); }
                #tour-body { font-size: 12.5px; }
            }
            @media (prefers-reduced-motion: reduce) {
                #tour-ret { animation: none; }
                #tour-halo, #tour-spotlight { transition: none; }
            }
        `;
        document.head.appendChild(style);
    }

    function createOverlay() {
        overlay = document.createElement('div');
        overlay.id = 'tour-overlay';
        halo = document.createElement('div');
        halo.id = 'tour-halo';
        spotlight = document.createElement('div');
        spotlight.id = 'tour-spotlight';
        reticle = document.createElement('u');
        reticle.id = 'tour-ret';
        reticle.innerHTML = '<i></i><i></i><i></i><i></i>';
        spotlight.appendChild(reticle);
        overlay.appendChild(halo);
        overlay.appendChild(spotlight);
        document.body.appendChild(overlay);
    }

    function createBubble() {
        bubble = document.createElement('div');
        bubble.id = 'tour-bubble';
        bubble.className = 'gp-plate';
        bubble.setAttribute('role', 'dialog');
        bubble.setAttribute('aria-label', 'Orientation briefing');
        bubble.innerHTML = `
            <div class="gp-titlebar tour-rail" id="tour-rail" data-code="TUT-01">Orientation</div>
            <div class="tour-inner">
                <div id="tour-title"></div>
                <div id="tour-body"></div>
                <div class="tour-meter">
                    <span class="tour-pips" id="tour-pips" aria-hidden="true"></span>
                    <span class="tour-count" id="tour-count"></span>
                </div>
                <div class="tour-keys">
                    <button type="button" id="tour-skip" class="gp-key tour-key">Dismiss</button>
                    <div class="tour-keys-right">
                        <button type="button" id="tour-prev" class="gp-key tour-key">Back</button>
                        <button type="button" id="tour-next" class="gp-key gp-key--amber tour-key tour-key-amber">Next</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(bubble);
        bubble.querySelector('#tour-skip').addEventListener('click', endTour);
        bubble.querySelector('#tour-prev').addEventListener('click', () => move(-1));
        bubble.querySelector('#tour-next').addEventListener('click', () => move(1));
    }

    /* ------------------------------------------------------------------ */
    /* Measurement                                                         */
    /* ------------------------------------------------------------------ */

    function visibleRect(el) {
        if (!el) return null;
        const cs = window.getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return null;
        const r = el.getBoundingClientRect();
        return (r.width > 2 && r.height > 2) ? r : null;
    }

    function box(left, top, right, bottom) {
        return { left, top, right, bottom, width: right - left, height: bottom - top };
    }

    function overlapArea(a, b) {
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        return (w > 0 && h > 0) ? w * h : 0;
    }

    /**
     * How badly two boxes crowd each other, in pixels of missing gutter.
     *
     * The separating axis is the one with the LARGEST gap: two boxes 3px apart
     * horizontally but 400px apart vertically are 400px apart, not 3. Overlap
     * (every gap negative) returns 0 because occlusion is already priced by area
     * - this term exists only for the case the area test cannot see, which is
     * exactly the one that shipped: a plate that clears its neighbour by three
     * pixels and therefore costs nothing at all.
     */
    function encroachment(a, b) {
        const gap = Math.max(
            b.left - a.right,
            a.left - b.right,
            b.top - a.bottom,
            a.top - b.bottom
        );
        if (gap < 0 || gap >= GUTTER) return 0;
        return GUTTER - gap;
    }

    /**
     * The board as the player sees it: the 3D viewport with whatever HUD is
     * docked at its edges subtracted.
     *
     * #galaxy3d is `position:fixed;inset:0`, so its own rect is the whole window
     * and framing it would frame nothing. What we want is the clear band, and the
     * only honest way to get it is to measure: a panel squeezes the band in from
     * the side it sits on, judged on whether it actually overlaps the middle of
     * the band rather than on a hardcoded idea of which panels are "the left
     * column". The HUD moves; this keeps working when it does.
     */
    function mapRegion() {
        const view = document.getElementById('galaxy3d') || document.querySelector('#galaxy3d canvas');
        const base = visibleRect(view);
        if (!base) return null;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let left = Math.max(base.left, 0);
        let right = Math.min(base.right, vw);
        let top = Math.max(base.top, 0);
        let bottom = Math.min(base.bottom, vh);
        const cx = (left + right) / 2;
        const cy = (top + bottom) / 2;

        const rects = HUD_SELECTORS
            .map(sel => visibleRect(document.querySelector(sel)))
            .filter(Boolean);

        // Sideways: only panels crossing the vertical middle of the band count,
        // so a top-left resource bar does not pretend to be a left column.
        const vBand = (bottom - top) * 0.18;
        rects.forEach(r => {
            if (r.bottom < cy - vBand || r.top > cy + vBand) return;
            if ((r.left + r.right) / 2 < cx) left = Math.max(left, Math.min(r.right, cx - 60));
            else right = Math.min(right, Math.max(r.left, cx + 60));
        });
        // Up and down: only panels that straddle a real share of the band width.
        rects.forEach(r => {
            const share = (Math.min(r.right, right) - Math.max(r.left, left)) / Math.max(1, r.width);
            if (share < 0.3) return;
            if ((r.top + r.bottom) / 2 < cy) top = Math.max(top, Math.min(r.bottom, cy - 60));
            else bottom = Math.min(bottom, Math.max(r.top, cy + 60));
        });

        let region = box(left + 2, top + 2, right - 2, bottom - 2);
        if (region.width < 140 || region.height < 140) return null;
        // A window with the HUD hidden leaves the "band" as the whole screen, and
        // a spotlight over everything is a scrim over nothing. Frame the middle.
        if (region.width * region.height > vw * vh * 0.72) {
            region = box(
                Math.round(vw * 0.19), Math.round(vh * 0.09),
                Math.round(vw * 0.81), Math.round(vh * 0.91)
            );
        }
        return region;
    }

    /**
     * The rect this step frames: its measured region, else its selector.
     *
     * `el` is the element the rect CAME FROM, and it matters. A step with both a
     * region and a fallback selector that reported the selector's element anyway
     * had the solver strike that panel off the obstacle list - so the map step,
     * whose fallback is the minimap, treated the minimap as free space and parked
     * the briefing on top of it while the region it was actually framing sat
     * empty. Only exclude the panel you are genuinely pointing at.
     */
    function stepRect(step) {
        if (!step) return null;
        if (typeof step.region === 'function') {
            let r = null;
            try { r = step.region(); } catch (err) { r = null; }
            if (r && r.width > 2 && r.height > 2) return { rect: r, el: null };
        }
        if (step.selector) {
            const el = document.querySelector(step.selector);
            const r = visibleRect(el);
            if (r) return { rect: box(r.left, r.top, r.right, r.bottom), el };
        }
        return null;
    }

    /** Every HUD box on screen right now with its cost, minus the step's own. */
    function obstacles(target) {
        const found = [];
        HUD_SELECTORS.forEach(sel => {
            const el = document.querySelector(sel);
            if (!el) return;
            if (target && (el === target || el.contains(target) || target.contains(el))) return;
            const rect = visibleRect(el);
            if (rect) found.push({ sel, rect, weight: HUD_COST[sel] || 1 });
        });
        return found;
    }

    /**
     * Find the cheapest slot for the briefing plate.
     *
     * Twenty side-and-alignment candidates was a rule of thumb, and rules of
     * thumb are how the plate ended up on the MAP KEY: every candidate was pinned
     * to an edge of the target, so when no edge was clean it took the least-bad
     * edge and stopped looking. This sweeps the WHOLE viewport at three
     * resolutions - 24px, then 8px, then 3px around the winner - scoring each
     * slot on weighted occlusion, weighted CROWDING, and its distance from the
     * thing it describes. About 3,800 rectangle tests, once per step; it does not
     * run per frame.
     *
     * The crowding term is what stops the plate landing three pixels off the
     * FIRST STEPS checklist at 1920 (measured: tour right edge x1562, checklist
     * left edge x1565). Occlusion area alone cannot see that, because there is
     * none - and "not overlapping" is a much weaker property than "composed".
     */
    function solve(target, step, targetEl) {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const w = bubble.offsetWidth;
        const h = bubble.offsetHeight;
        const blockers = obstacles(targetEl);
        const tw = typeof step.targetWeight === 'number' ? step.targetWeight : 3;
        const side = step.placement;
        const maxLeft = Math.max(EDGE, vw - w - EDGE);
        const maxTop = Math.max(EDGE, vh - h - EDGE);

        const score = (left, top) => {
            const b = box(left, top, left + w, top + h);
            let cost = overlapArea(b, target) * tw;
            let guarded = 0;
            for (let i = 0; i < blockers.length; i++) {
                const hit = overlapArea(b, blockers[i].rect);
                if (hit) {
                    cost += hit * blockers[i].weight;
                    if (blockers[i].weight >= PROTECT) {
                        guarded += hit;
                        cost += GUARD_PENALTY;
                    }
                    continue;
                }
                // Clear of it, but is it clear ENOUGH? Two raised plates 3px
                // apart read as a failed alignment, not as a composition.
                const crowd = encroachment(b, blockers[i].rect);
                if (crowd) cost += crowd * blockers[i].weight * GUTTER_COST;
            }
            // Stay near what you are describing. Distance is measured edge to
            // edge, so anywhere inside or touching the target costs nothing.
            const dx = Math.max(target.left - b.right, b.left - target.right, 0);
            const dy = Math.max(target.top - b.bottom, b.top - target.bottom, 0);
            cost += Math.sqrt(dx * dx + dy * dy) * 16;
            // A gentle nudge toward the side the step asked for, easily overruled
            // by a panel that would actually be covered.
            const onSide = side === 'bottom' ? b.top >= target.bottom - 2
                : side === 'top' ? b.bottom <= target.top + 2
                    : side === 'right' ? b.left >= target.right - 2
                        : side === 'left' ? b.right <= target.left + 2
                            : true;
            if (!onSide) cost += 2600;
            // COMPOSITION, for a step that frames something big enough to sit
            // inside. A briefing about the board belongs ON the board, at the foot
            // of the lit region and horizontally centred: the map stays readable
            // above it and the plate is nearest the pad it hands off to.
            //
            // Both halves are needed. Without the containment penalty a slot that
            // hangs half off the lit region is CHEAPER than one fully on it (the
            // target only costs a quarter weight), so the plate crept into the
            // top-right corner and crowded the checklist. Without the tiebreak
            // every fully-inside slot scores identically and the sweep takes
            // whichever it happened to test first - the middle of the board. The
            // penalty is the plate's own maximum target cost, so it self-scales
            // and cannot outrank a genuinely clean slot elsewhere.
            if (side === 'inside') {
                const contained = b.left >= target.left && b.right <= target.right
                    && b.top >= target.top && b.bottom <= target.bottom;
                if (!contained) cost += w * h * tw + 1;
                else {
                    cost -= (b.top - target.top) * 6;
                    cost += Math.abs((b.left + b.right) / 2 - (target.left + target.right) / 2) * 2;
                }
            }
            return { cost, guarded };
        };

        let best = { left: EDGE, top: EDGE, cost: Infinity, guarded: Infinity };
        const sweep = (l0, t0, l1, t1, stepPx) => {
            for (let top = t0; top <= t1; top += stepPx) {
                const ty = Math.max(EDGE, Math.min(top, maxTop));
                for (let left = l0; left <= l1; left += stepPx) {
                    const lx = Math.max(EDGE, Math.min(left, maxLeft));
                    const s = score(lx, ty);
                    if (s.cost < best.cost - 0.5) best = { left: lx, top: ty, cost: s.cost, guarded: s.guarded };
                }
            }
        };
        sweep(EDGE, EDGE, maxLeft, maxTop, 24);
        sweep(best.left - 24, best.top - 24, best.left + 24, best.top + 24, 8);
        sweep(best.left - 8, best.top - 8, best.left + 8, best.top + 8, 3);

        // Name the offender so a failure is diagnosable rather than mysterious.
        let worst = null;
        if (best.guarded > 0) {
            const b = box(best.left, best.top, best.left + w, best.top + h);
            blockers.forEach(o => {
                const hit = overlapArea(b, o.rect);
                if (o.weight >= PROTECT && hit > 0 && (!worst || hit > worst.area)) {
                    worst = { panel: o.sel, area: Math.round(hit) };
                }
            });
        }
        return { left: best.left, top: best.top, guarded: best.guarded, worst };
    }

    /**
     * Solve, and if the plate still lands on a protected panel, shrink it and
     * solve again. Failing that, SAY SO. The old solver could not tell the
     * difference between "found a clean slot" and "gave up", so it buried the map
     * legend at 1024x640 in silence.
     */
    function placeBubble(target, step, targetEl) {
        bubble.classList.remove('tour-compact');
        let fit = solve(target, step, targetEl);
        if (fit.guarded > 0) {
            bubble.classList.add('tour-compact');
            const compact = solve(target, step, targetEl);
            if (compact.guarded < fit.guarded) fit = compact;
            else bubble.classList.remove('tour-compact');
        }
        bubble.style.left = `${Math.round(fit.left)}px`;
        bubble.style.top = `${Math.round(fit.top)}px`;
        bubble.dataset.fit = fit.guarded > 0 ? 'overlap' : 'clear';
        if (fit.guarded > 0 && fit.worst) {
            console.warn(`[tour] ${step.code} briefing could not clear the HUD: `
                + `${fit.worst.area}px^2 over ${fit.worst.panel}`);
        }
        return fit;
    }

    function placeSpotlight(target, rearm) {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const pad = 4;
        // Clamped into the window on purpose: the shadow fills everything OUTSIDE
        // these rects, so clipping the rect to the viewport is exactly the same
        // picture as letting it hang off the edge - without the fixed-position
        // element that hangs off an edge and invents a scrollbar.
        const set = (el, inset) => {
            const left = Math.max(-2, target.left - inset);
            const top = Math.max(-2, target.top - inset);
            el.style.left = `${Math.round(left)}px`;
            el.style.top = `${Math.round(top)}px`;
            el.style.width = `${Math.round(Math.max(0, Math.min(target.right + inset, vw + 2) - left))}px`;
            el.style.height = `${Math.round(Math.max(0, Math.min(target.bottom + inset, vh + 2) - top))}px`;
        };
        set(spotlight, pad);
        set(halo, pad + HALO);
        // Re-arm the lock-on for a NEW step only. The layout watchdog can re-solve
        // several times while the HUD settles, and a reticle that replays its
        // convergence on every one of those reads as a stutter, not as an
        // arrival.
        if (rearm) {
            reticle.style.animation = 'none';
            void reticle.offsetWidth;
            reticle.style.animation = '';
        }
    }

    /* ------------------------------------------------------------------ */
    /* Steps                                                               */
    /* ------------------------------------------------------------------ */

    function renderStep() {
        const step = live[current];
        if (!step) return endTour();
        const target = stepRect(step);
        if (!target) {
            // The panel this step describes is not on screen at this window size
            // (applyResponsiveLayout hides the minimap and the legend on small
            // ones). Drop the step rather than point at nothing.
            live.splice(current, 1);
            if (!live.length) return abortTour();
            if (current >= live.length) current = live.length - 1;
            return renderStep();
        }

        bubble.querySelector('#tour-rail').setAttribute('data-code', step.code);
        bubble.querySelector('#tour-title').textContent = step.title;
        bubble.querySelector('#tour-body').textContent = step.body;
        bubble.querySelector('#tour-count').textContent = `STEP ${current + 1} / ${live.length}`;
        bubble.querySelector('#tour-pips').innerHTML =
            live.map((_, i) => `<b class="${i <= current ? 'on' : ''}"></b>`).join('');

        const nextBtn = bubble.querySelector('#tour-next');
        const prevBtn = bubble.querySelector('#tour-prev');
        nextBtn.textContent = current === live.length - 1 ? 'Done' : 'Next';
        prevBtn.disabled = current === 0;

        placeSpotlight(target.rect, true);
        placeBubble(target.rect, step, target.el);
        lastLayout = layoutSignature(step);
    }

    function reposition() {
        repositionQueued = false;
        if (!bubble || !overlay) return;
        const step = live[current];
        const target = stepRect(step);
        if (!target) return renderStep();
        placeSpotlight(target.rect, false);
        placeBubble(target.rect, step, target.el);
        lastLayout = layoutSignature(step);
    }

    function queueReposition() {
        if (repositionQueued) return;
        repositionQueued = true;
        requestAnimationFrame(reposition);
    }

    /**
     * A SOLVED PLACEMENT IS ONLY AS GOOD AS THE LAYOUT IT WAS SOLVED AGAINST.
     *
     * The HUD is assembled by several scripts and laid out by
     * applyResponsiveLayout(), which runs on far more than resize - panels appear,
     * the right-hand stack re-flows, the legend hides and comes back. Solve one
     * frame too early and the answer is right about a screen that no longer
     * exists: caught at 1280x800, where step one reported a clean slot and then
     * the MAP KEY re-appeared underneath it, 5,719px^2 of the one panel the
     * weights exist to protect. Nothing fires a resize event for that.
     *
     * So the tour watches. Four times a second it hashes the target and every HUD
     * box, and re-solves only when the hash actually changed - about eighteen
     * getBoundingClientRect calls per tick, for the few seconds a briefing is
     * open, and zero work when nothing moved.
     */
    function layoutSignature(step) {
        const box4 = r => `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`;
        const target = stepRect(step);
        let sig = target ? box4(target.rect) : 'x';
        for (let i = 0; i < HUD_SELECTORS.length; i++) {
            const r = visibleRect(document.querySelector(HUD_SELECTORS[i]));
            sig += r ? `|${box4(r)}` : '|-';
        }
        return sig;
    }

    function watchLayout() {
        if (!bubble || !overlay) return;
        const step = live[current];
        if (!step) return;
        if (layoutSignature(step) !== lastLayout) queueReposition();
    }

    function move(delta) {
        const next = current + delta;
        if (next >= live.length) return endTour();
        current = Math.max(0, next);
        renderStep();
    }

    function onKey(event) {
        if (event.key !== 'Escape') return;
        const tag = event.target && event.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        endTour();
    }

    /* ------------------------------------------------------------------ */
    /* Lifecycle                                                           */
    /* ------------------------------------------------------------------ */

    function teardown() {
        if (watchTimer) clearInterval(watchTimer);
        watchTimer = null;
        lastLayout = '';
        window.removeEventListener('resize', queueReposition);
        document.removeEventListener('keydown', onKey, true);
        if (overlay) overlay.remove();
        if (bubble) bubble.remove();
        overlay = null;
        halo = null;
        spotlight = null;
        reticle = null;
        bubble = null;
        current = 0;
        live = [];
    }

    /** Close without recording a decision: the player never made one. */
    function abortTour() {
        teardown();
    }

    /** Close because the player dismissed or finished it. This is the only path
        that writes the flag - a torn-down-because-nothing-loaded tour used to
        write it too, and silently burned the tutorial for that browser. */
    function endTour() {
        teardown();
        try {
            localStorage.setItem(STORAGE_KEY, '1');
        } catch (err) {
            try { sessionStorage.setItem(STORAGE_KEY, '1'); } catch (err2) { /* private mode */ }
        }
    }

    function isDismissed() {
        try {
            if (localStorage.getItem(STORAGE_KEY) === '1') return true;
        } catch (err) { /* fall through to session storage */ }
        try {
            return sessionStorage.getItem(STORAGE_KEY) === '1';
        } catch (err) {
            return false;
        }
    }

    function startTour(force = false) {
        if (overlay || bubble) return;
        if (!force && isDismissed()) return;

        live = steps.filter(step => stepRect(step));
        if (!live.length) return;

        ensureStyles();
        createOverlay();
        createBubble();
        current = 0;
        renderStep();
        window.addEventListener('resize', queueReposition);
        document.addEventListener('keydown', onKey, true);
        watchTimer = setInterval(watchLayout, 250);
    }

    window.Tour = { start: startTour, end: endTour };

    // The HUD is assembled by several scripts and then laid out by
    // applyResponsiveLayout(), so "load + 1.2s" was a bet, not a fact. Poll for
    // the briefing's own targets and open when they are actually there.
    window.addEventListener('load', () => {
        if (isDismissed()) return;
        let tries = 0;
        const attempt = () => {
            if (overlay || bubble || isDismissed()) return;
            const ready = steps.filter(step => stepRect(step)).length;
            if (ready >= 3 || (tries >= 8 && ready > 0)) {
                startTour(false);
                return;
            }
            if (tries++ < 14) setTimeout(attempt, 450);
        };
        setTimeout(attempt, 900);
    });
})();
