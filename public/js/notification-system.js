/**
 * notification-system.js - transient console messages, loading state and modals
 *
 * FOUR THINGS TO KNOW BEFORE EDITING.
 *
 * 1. notify(title, message, type, duration) is the API the rest of the client
 *    actually calls - roughly twenty-five sites across connect.js, game.js,
 *    advisor.js and onboarding.js - and it did not exist. Only show(message,
 *    type, duration, title) was ever exported, with the arguments in the other
 *    order. Every unguarded call threw a TypeError inside a WebSocket handler
 *    (battle detected, battle summary, probe intel, game over, standing orders,
 *    enemy fleet movement); every guarded one silently did nothing. notify() is
 *    now a first-class member and show() is kept for the older signature.
 *
 * 2. Placement is measured. Toasts used to be pinned at top:20px right:20px,
 *    which is where the turn clock, the utility keys and the event panel live -
 *    a message would cover the clock it was telling you about. They now sit in
 *    the clear band at the bottom of the tactical view, found by measuring the
 *    3D viewport and subtracting whatever HUD is currently occupying its edges.
 *    They are also click-through: a transient message must never intercept an
 *    order the player is giving to the map underneath it.
 *
 * 3. EVERY PLATE IN THIS FILE IS THE SHARED ATOM. .notification and the loading
 *    rig used to declare their own linear-gradient(180deg,#2b3447,#1d2433 52%,
 *    #141a26) while the tour bubble, the checklist, the confirm modal and the
 *    advisory all took style.css's riveted .gp-plate - so one owner shipped two
 *    materials, and they appeared together in the same frame (measured: toast
 *    face #22293a and loader #222a3b against tour card #161a22 and checklist
 *    #0b0f17 - the hand-rolled pair lighter and bluer, with no rivets and no
 *    grain). Both now carry `gp-plate`, and the local rules are written as
 *    var(--token, <literal>) so a page WITHOUT the atom gets the same layers
 *    rather than a flat slab. Retuning --face/--grain now moves all six
 *    surfaces at once, which is the whole point of an atom. --rivets is the
 *    exception and is restated in full below - style.css's copy floods the
 *    plate, see the long note at the .notification/.confirm-modal rule.
 *
 * 4. SEVERITY IS FOUR ROLES, NOT ONE FAMILY WITH FOUR NAMES. Pixel-sampled from
 *    the shipped build: the info chip was #bb9143 and the success chip #bf9445 -
 *    the same bronze - and the two gauges were #cd9f5b and #ce9f5c. So a turn
 *    report, a swept shoal and a fleet engagement all arrived as amber-on-dark
 *    at 9-13px in peripheral vision and only ERR broke out. In a game you triage
 *    at a glance that is a readability failure, not a polish note.
 *
 *      information  steel   #cdd6e6  - here is a fact
 *      completed    verdigris#6ba880 - a thing was gained or secured
 *      decide       amber   #ffce80  - this wants an order
 *      loss         crimson #ff7f63  - something was destroyed
 *
 *    The verdigris is not a new hue invented for this file: it is the map's own
 *    "Owned/live" key colour taken to readout brightness, so "a good thing
 *    happened" is told in the same green the board already uses for "this is
 *    yours". All four roles drive the chip, the title AND the dwell gauge
 *    together, and the chip still spells the kind (MSG / OK / WRN / ERR) so the
 *    distinction survives greyscale and colour-blind viewing on its own.
 *
 * No coloured edge borders anywhere: colour lives in type, in instrument faces
 * and in the gauge fill, never as a stripe on a container.
 */

const NotificationSystem = (function() {
    let container = null;
    let activeNotifications = [];
    let notificationId = 0;
    let placeQueued = false;

    const MAX_VISIBLE = 4;

    // Nominal pitch of one gauge segment, in CSS px, and the range the measured
    // count is allowed to land in. 14px reads as a machined notch at 1x; much
    // finer and a full-width gauge turns into a dotted rule, much coarser and the
    // drain becomes four big jumps. The real count is measured per toast from the
    // gauge's own width so the ticks land exactly on the steps() boundaries - see
    // render().
    const GAUGE_PITCH = 14;
    const GAUGE_SEG_MIN = 5;
    const GAUGE_SEG_MAX = 18;

    // Kind -> stencilled code + role. `role` names the colour role, and every
    // channel (chip ink, title ink, gauge fill) is driven from it.
    const KINDS = {
        success: { code: 'OK', role: 'verdigris' },
        warning: { code: 'WRN', role: 'amber' },
        error: { code: 'ERR', role: 'red' },
        info: { code: 'MSG', role: 'steel' }
    };

    // Drawn, not typed. The close mark was a 12px multiplication sign in a 20x18
    // box with line-height:1 and no vertical centring, so its baseline parked it
    // in the upper third of every key on screen - a systematic misalignment. Ten
    // pixels of geometry, centred by flexbox, identical on every machine.
    const GLYPH_CLOSE = '<svg class="close-mark" viewBox="0 0 12 12" aria-hidden="true" focusable="false">'
        + '<path d="M2.6 2.6 9.4 9.4M9.4 2.6 2.6 9.4" fill="none" stroke="currentColor" '
        + 'stroke-width="2" stroke-linecap="square"/></svg>';

    // Hazard stamps for the order dialog. Same two marks the map key uses - a
    // triangle for a shoal, an eclipsed disc for a void - but STAMPED rather
    // than typed: a filled body with the caution mark punched back out of it in
    // ink, which is how a real caution plate is made and how every other
    // instrument face in this console carries a symbol.
    //
    // They were hairline outlines at 1.7 stroke on a 16 viewBox, rendered at
    // 19px inside a 34px socket: measured at 12x, two thirds of the socket was
    // empty black. On the one frame titled CERTAIN LOSS that reads as a
    // placeholder box with a system glyph dropped in it. The body now fills 26
    // of the socket's 34px and carries the socket's own ink as a keyline, so
    // the stamp is material rather than void.
    const GLYPH_HAZARD = {
        shoal: '<svg viewBox="0 0 26 26" aria-hidden="true" focusable="false">'
            + '<path d="M13 2.2 25.2 23.4H0.8Z" fill="currentColor" stroke="#05070d" stroke-width="1.5" stroke-linejoin="miter"/>'
            + '<path d="M13 9.6v6.2" fill="none" stroke="#05070d" stroke-width="2.8"/>'
            + '<rect x="11.6" y="17.6" width="2.8" height="2.8" fill="#05070d"/></svg>',
        void: '<svg viewBox="0 0 26 26" aria-hidden="true" focusable="false">'
            + '<circle cx="13" cy="13" r="11.3" fill="currentColor" stroke="#05070d" stroke-width="1.5"/>'
            + '<circle cx="13" cy="13" r="4.6" fill="#05070d"/></svg>'
    };

    // Aliases the call sites actually use.
    function normalizeType(type) {
        const key = String(type || 'info').toLowerCase();
        if (key === 'warn') return 'warning';
        if (key === 'fail' || key === 'danger') return 'error';
        return KINDS[key] ? key : 'info';
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    }

    // Initialize notification system
    function initialize() {
        // connect.js calls this too, so a second run must not build a second
        // container with the same id and a second copy of the stylesheet.
        if (container) return;
        container = document.createElement('div');
        container.id = 'notification-container';
        container.className = 'notification-container';
        document.body.appendChild(container);

        addStyles();
        placeContainer();
        window.addEventListener('resize', queuePlacement);
    }

    /* ------------------------------------------------------------------ */
    /* Placement                                                           */
    /* ------------------------------------------------------------------ */

    // HUD furniture that occupies the edges of the tactical view.
    const EDGE_PANELS = ['#controlPadGUI', '#chatContainer', '#chatFeed', '#minimapid', '#mapLegend'];

    function visibleRect(el) {
        if (!el) return null;
        const cs = window.getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return null;
        const rect = el.getBoundingClientRect();
        return (rect.width > 2 && rect.height > 2) ? rect : null;
    }

    /**
     * Park the stack in the clear band along the bottom of the 3D view.
     *
     * The band starts as the viewport's own box and is eaten into by whatever is
     * currently docked at its edges: the command pad and chat on the left, the
     * minimap and legend on the right. A panel sitting in the middle of the band
     * (nothing does today, but the HUD moves) pushes the stack up above it rather
     * than being covered.
     */
    function placeContainer() {
        placeQueued = false;
        if (!container) return;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const view = document.getElementById('galaxy3d');
        const box = visibleRect(view);

        const style = container.style;
        if (!box || box.width < 260 || box.height < 220) {
            // No tactical view (or no room in it): fall back to the top-right,
            // below the hull rail so it is not printed over the top strip.
            style.left = 'auto';
            style.right = '16px';
            style.bottom = 'auto';
            style.top = '60px';
            style.transform = 'none';
            style.maxWidth = `${Math.min(400, vw - 32)}px`;
            style.alignItems = 'flex-end';
            return;
        }

        let left = box.left + 14;
        let right = Math.min(box.right, vw) - 14;
        let bottom = Math.min(box.bottom, vh) - 18;
        const bandTop = bottom - 320;

        EDGE_PANELS.forEach(selector => {
            const rect = visibleRect(document.querySelector(selector));
            if (!rect) return;
            if (rect.bottom < bandTop || rect.top > bottom) return;
            if (rect.right <= left || rect.left >= right) return;
            if (rect.left <= left + 1) left = Math.max(left, rect.right + 14);
            else if (rect.right >= right - 1) right = Math.min(right, rect.left - 14);
            else bottom = Math.min(bottom, rect.top - 14);
        });

        if (right - left < 260) {
            // The sides ate the band. Take the full width of the view instead and
            // float above everything docked in it.
            left = box.left + 14;
            right = Math.min(box.right, vw) - 14;
            EDGE_PANELS.forEach(selector => {
                const rect = visibleRect(document.querySelector(selector));
                if (rect && rect.right > left && rect.left < right) bottom = Math.min(bottom, rect.top - 14);
            });
        }

        style.left = `${Math.round((left + right) / 2)}px`;
        style.right = 'auto';
        style.top = 'auto';
        style.bottom = `${Math.round(Math.max(12, vh - bottom))}px`;
        style.transform = 'translateX(-50%)';
        style.maxWidth = `${Math.round(Math.max(240, Math.min(440, right - left)))}px`;
        style.alignItems = 'stretch';
    }

    function queuePlacement() {
        if (placeQueued) return;
        placeQueued = true;
        requestAnimationFrame(placeContainer);
    }

    /* ------------------------------------------------------------------ */
    /* Styles                                                              */
    /* ------------------------------------------------------------------ */

    function addStyles() {
        if (document.getElementById('notification-system-styles')) return;
        const style = document.createElement('style');
        style.id = 'notification-system-styles';
        style.textContent = `
            /* THE FOURTH ROLE. The console palette was steel + amber/bronze +
               crimson, which is three roles for four states, so "a thing was
               completed" had to borrow bronze from "here is a fact" and the two
               became indistinguishable at 9.5px. This is the map key's own
               Owned/live hue (#4d7355 on the chip, the same 141deg) taken to
               readout brightness - a green that already means "yours" on the
               board now means "gained" in the messages about the board.
               Declared on :root so the lobby and the shop get it too.

               RETUNED TO PATINA. The first cut was #61b971 - hue 133, saturation
               36% - which is a leaf/mint green, and in a frame of steel and
               bronze it was the one hue that did not belong to the era. It is
               now #6ba880: same hue family, saturation down to 26%, LUMINANCE
               HELD (contrast against the plate face measures 5.6:1, was 6.4:1,
               both clear of the 4.5:1 floor) so nothing gets harder to read.
               Every green mark in this domain - toast chip, toast title, dwell
               gauge, advisory chip, advisory copy, checklist tick - reads the
               token, so this is the only place the hue is decided. */
            :root {
                --verdigris:    #6ba880;
                --verdigris-hi: #95c6a5;
                --verdigris-lo: #315e40;
            }

            .notification-container {
                position: fixed;
                /* Above the shop sheet (9999) and the battle theater (5000), below
                   this module's own loading rig and modal (10003). Moving it down
                   into the HUD band looks tidier and hides payment results behind
                   the shop that produced them. */
                z-index: 10001;
                display: flex;
                flex-direction: column;
                gap: 8px;
                width: max-content;
                /* Click-through. A message that appears over the map must never
                   swallow the order the player is in the middle of giving. */
                pointer-events: none;
                font-family: var(--font-ui, 'Rajdhani', 'Segoe UI', system-ui, sans-serif);
            }

            /* THE PLATE FACE, AND WHY NONE OF IT WAS IN THE PIXELS.
               A radial gradient paints its LAST stop across the whole background
               positioning area, not just out to its radius. style.css carries a
               comment about exactly that trap on the hull rail - and its own
               --rivets token still has it:

                 radial-gradient(circle 2.2px at 9px 9px,
                     rgba(190,206,232,0.55), rgba(10,14,22,0.9) 72%)

               is not a 2.2px fastener on a steel plate. It is a 90%-opaque
               #0a0e16 SHEET with one highlight in its corner, and four of them
               stack to opaque. Pixel-sampled from the shipped build: the toast
               face, the modal body, the advisory body and the checklist body all
               read rgb(10,14,22) - the exact colour of that stop - at every
               height, while the authored --face gradient underneath was never
               once visible, and three of the four rivets were buried under the
               sheet drawn by the first.

               Restated here for THIS FILE'S SURFACES ONLY. The token belongs to
               style.css and the HUD panels are not ours to repaint; a custom
               property set on the element wins over the inherited one, so this
               fixes the overlay domain without touching anything else. Two
               changes, both of them removals of something that should not have
               been there: every rivet now ends at rgba(0,0,0,0) so it stops
               flooding, and each is a HEAD OVER A SOCKET - a 3.5px dome lit from
               the up-key with a 4.2px shadow seated down and right of it -
               because one flat 2.2px dot can only ever read as a dead subpixel,
               which is precisely how the single surviving rivet shipped.

               Measured after: face top rgb(46,55,74), face bottom rgb(27,33,45),
               all four rivets present. Before: rgb(10,14,22) everywhere.

               The 3px corner is deliberately KEPT. .game-page .gp-plate gives
               every neighbouring HUD panel the same 3px, and on a 2px ink border
               it renders as ~1px of softening - measured on the event panel and
               on a toast in the same frame, they are identical. Squaring these
               would make the overlays the odd kit, not the matching one. */
            .notification,
            .confirm-modal,
            .loading-indicator,
            .speech-bubble,
            #onboardingCard,
            #tour-bubble {
                --rivets:
                    radial-gradient(circle 3.5px at 9px 9px,
                        rgba(214,231,252,0.78) 0 0.9px, rgba(146,168,202,0.5) 1.9px,
                        rgba(6,9,15,0.72) 2.8px, rgba(0,0,0,0) 3.5px),
                    radial-gradient(circle 4.2px at 10px 10px,
                        rgba(0,0,0,0.6) 0 2.7px, rgba(0,0,0,0) 4.2px),
                    radial-gradient(circle 3.5px at calc(100% - 9px) 9px,
                        rgba(214,231,252,0.78) 0 0.9px, rgba(146,168,202,0.5) 1.9px,
                        rgba(6,9,15,0.72) 2.8px, rgba(0,0,0,0) 3.5px),
                    radial-gradient(circle 4.2px at calc(100% - 8px) 10px,
                        rgba(0,0,0,0.6) 0 2.7px, rgba(0,0,0,0) 4.2px),
                    radial-gradient(circle 3.5px at 9px calc(100% - 9px),
                        rgba(214,231,252,0.78) 0 0.9px, rgba(146,168,202,0.5) 1.9px,
                        rgba(6,9,15,0.72) 2.8px, rgba(0,0,0,0) 3.5px),
                    radial-gradient(circle 4.2px at 10px calc(100% - 8px),
                        rgba(0,0,0,0.6) 0 2.7px, rgba(0,0,0,0) 4.2px),
                    radial-gradient(circle 3.5px at calc(100% - 9px) calc(100% - 9px),
                        rgba(214,231,252,0.78) 0 0.9px, rgba(146,168,202,0.5) 1.9px,
                        rgba(6,9,15,0.72) 2.8px, rgba(0,0,0,0) 3.5px),
                    radial-gradient(circle 4.2px at calc(100% - 8px) calc(100% - 8px),
                        rgba(0,0,0,0.6) 0 2.7px, rgba(0,0,0,0) 4.2px);
            }

            /* SHARED PLATE, LOCAL STRUCTURE. --grain and --face are still written
               as var(--token, <the same literal the token holds>): on the game
               screen .game-page .gp-plate supersedes all of it with !important
               and the atom layers apply; anywhere else these fallbacks paint the
               identical ones. What stays local is geometry only. */
            .notification,
            .confirm-modal,
            .loading-indicator {
                background:
                    var(--rivets),
                    var(--grain, repeating-linear-gradient(90deg,
                        rgba(255,255,255,0.028) 0 1px, rgba(0,0,0,0.032) 1px 3px)),
                    var(--face, linear-gradient(180deg, #2b3447, #1d2433 52%, #141a26));
                /* One value for every layer. A gradient has no intrinsic size, so
                   each layer is already exactly the positioning area and tiles
                   inside itself - the old six-value list was per-layer bookkeeping
                   for layers that never needed it, and it silently mis-paired the
                   moment the rivet count changed. */
                background-repeat: no-repeat;
                border: 2px solid var(--ink, #05070d);
                border-radius: 3px;
                box-shadow: var(--plate-shadow,
                    inset 2px 2px 0 rgba(176, 198, 232, 0.22),
                    inset -2px -2px 0 rgba(0, 0, 0, 0.62),
                    0 4px 0 #05070d,
                    0 12px 26px rgba(0, 0, 0, 0.55));
                color: var(--text, #cdd6e6);
            }

            .notification {
                position: relative;
                box-sizing: border-box;
                display: flex;
                align-items: flex-start;
                gap: 10px;
                width: 100%;
                min-width: 240px;
                padding: 9px 10px 10px;
                overflow: hidden;
                pointer-events: none;
                animation: notifyRaise 0.22s ease-out;
                /* The plate atom carries a 26px blur shadow, and up to four of
                   these slide in over a live WebGL canvas during a battle. Without
                   the hint the entry animation repaints that blur every frame on
                   the compositor's critical path; with it the toast is its own
                   layer and the slide is a transform. Bounded by MAX_VISIBLE, so
                   this is never more than four promoted layers. */
                will-change: transform, opacity;
            }

            @keyframes notifyRaise {
                from { transform: translateY(14px); opacity: 0; }
                to   { transform: translateY(0);    opacity: 1; }
            }
            @keyframes notifyRetire {
                from { transform: translateY(0);   opacity: 1; }
                to   { transform: translateY(-6px); opacity: 0; }
            }
            .notification.removing { animation: notifyRetire 0.24s ease-in forwards; }

            /* Stencilled kind code in a recessed socket. This is the channel that
               survives greyscale - it spells the kind - and it is now also the
               first place the ROLE COLOUR lands, because a chip that is bronze
               for both "MSG" and "OK" was carrying no colour information at all. */
            .notification-code {
                flex: 0 0 auto;
                margin-top: 1px;
                padding: 3px 5px 2px;
                font-family: var(--font-mono, 'Share Tech Mono', ui-monospace, monospace);
                font-size: 9.5px;
                letter-spacing: 0.12em;
                line-height: 1;
                color: var(--text, #cdd6e6);
                background: #05080e;
                box-shadow: inset 2px 2px 4px rgba(0, 0, 0, 0.85);
            }
            .notification.success .notification-code { color: var(--verdigris, #6ba880); }
            .notification.warning .notification-code { color: var(--amber-hi, #ffce80); }
            .notification.error   .notification-code { color: var(--red-hi, #ff7f63); }

            .notification-content { flex: 1 1 auto; min-width: 0; }

            /* One title value per role, so the colour is doing triage rather than
               announcing that a message arrived. */
            .notification-title {
                margin-bottom: 2px;
                font-family: var(--font-head, 'Russo One', sans-serif);
                font-size: 11px;
                letter-spacing: 0.05em;
                text-transform: uppercase;
                color: var(--bright, #eef3fb);
                text-shadow: 0 1px 0 var(--ink, #05070d);
            }
            .notification.info    .notification-title { color: var(--bright, #eef3fb); }
            .notification.success .notification-title { color: var(--verdigris, #6ba880); }
            .notification.warning .notification-title { color: var(--amber-hi, #ffce80); }
            .notification.error   .notification-title { color: var(--red-hi, #ff7f63); }

            .notification-message {
                font-size: 13px;
                line-height: 1.4;
                color: var(--text, #cdd6e6);
                overflow-wrap: anywhere;
            }

            .notification-close {
                flex: 0 0 auto;
                box-sizing: border-box;
                display: flex;
                align-items: center;
                justify-content: center;
                width: 20px;
                height: 18px;
                padding: 0;
                cursor: pointer;
                pointer-events: auto;
                color: var(--text, #cdd6e6);
                background: linear-gradient(180deg, #445064, #1d2433 55%, #141a26);
                border: 2px solid var(--ink, #05070d);
                border-radius: 0;
                box-shadow:
                    inset 1px 1px 0 rgba(255, 255, 255, 0.16),
                    inset -1px -1px 0 rgba(0, 0, 0, 0.5),
                    0 2px 0 var(--ink, #05070d);
            }
            .notification-close .close-mark { display: block; width: 10px; height: 10px; color: var(--text, #cdd6e6); }
            /* The face is restated on hover because style.css still carries a
               legacy global button:hover:not(:disabled) at (0,2,1) that would
               otherwise replace this key's bevelled steel with a flat blue-grey
               fill the moment the pointer touches it. */
            .notification-container .notification-close:hover:not(:disabled) {
                filter: brightness(1.2);
                background: linear-gradient(180deg, var(--steel-hi, #445064), var(--steel-3, #1d2433) 55%, var(--steel-4, #141a26));
            }
            .notification-close:hover .close-mark { color: var(--bright, #eef3fb); }
            .notification-close:active { transform: translateY(2px); box-shadow: inset 2px 2px 5px rgba(0, 0, 0, 0.7); }

            /* DWELL GAUGE - A TROUGH WITH A SCALE, AND IT BELONGS TO THE MESSAGE.
               Two structural faults, both visible at 3x:

               NO TRACK. The bar was drawn in a groove whose bed sampled
               byte-identical to the plate face, so the unfilled remainder was
               nothing at all: the fill simply got shorter with no reference and
               6-of-7 remaining could not be told from 3-of-7. The trough is now
               the same recessed instrument bed .loading-track uses - #05080e,
               2px ink rim, hard inset shadow - and the EMPTY segments are drawn
               as dimmed steel ticks rather than as absence, so the gauge reads as
               a scale whether it is full, half or nearly out.

               THREE LEFT EDGES. It was an absolutely-positioned sibling pinned to
               the plate's own padding while the title and message started ~40px
               further right, past the code chip. On a 240px card that reads as a
               stray element that failed to align. It is now a child of
               .notification-content and inherits that column's left edge, so it
               is visibly the timer for the text directly above it.

               --seg is measured per toast (see render) so the tick pitch lands on
               the steps() boundaries exactly, at any column width. */
            .notification-progress {
                position: relative;
                box-sizing: border-box;
                --seg: 8;
                width: 100%;
                height: 10px;
                margin-top: 8px;
                padding: 0;
                overflow: hidden;
                border: 2px solid var(--ink, #05070d);
                background:
                    repeating-linear-gradient(90deg,
                        rgba(150, 175, 215, 0.16) 0 calc(100% / var(--seg) - 2px),
                        rgba(0, 0, 0, 0) calc(100% / var(--seg) - 2px) calc(100% / var(--seg))),
                    #05080e;
            }
            .notification-progress-bar {
                width: 100%;
                height: 100%;
                background: linear-gradient(180deg, #e8eefa, #a9b7cb 55%, #59657a);
            }
            /* Dividers and the recess ride ABOVE the fill, so the bar stays one
               element and the tick marks are a static mask that cannot drift out
               of register with it. */
            .notification-progress::after {
                content: "";
                position: absolute;
                inset: 0;
                pointer-events: none;
                background: repeating-linear-gradient(90deg,
                    rgba(0, 0, 0, 0) 0 calc(100% / var(--seg) - 2px),
                    var(--ink, #05070d) calc(100% / var(--seg) - 2px) calc(100% / var(--seg)));
                box-shadow: inset 2px 2px 5px rgba(0, 0, 0, 0.85);
            }
            .notification.success .notification-progress-bar {
                background: linear-gradient(180deg, var(--verdigris-hi, #95c6a5), var(--verdigris, #6ba880) 55%, var(--verdigris-lo, #315e40));
            }
            .notification.warning .notification-progress-bar {
                background: linear-gradient(180deg, var(--amber-hi, #ffce80), var(--amber, #f0a233) 55%, var(--amber-lo, #9a5d11));
            }
            /* Pinned to the role tokens, and built like the other three: a lit
               top, the role colour at the waist, a dark foot. It used to open on
               a bare #d4715c literal that belonged to no token and matched no
               other crimson mark in the console, so the one gauge that means
               "something was destroyed" was the one gauge painted off-palette. */
            .notification.error .notification-progress-bar,
            .notification.role-red .notification-progress-bar {
                background: linear-gradient(180deg, var(--red-hi, #ff7f63), var(--red, #b8392a) 55%, #6f2016);
            }

            /* ---- Loading indicator ---------------------------------------- */
            /* It is a plate inside .confirm-modal-overlay now, not a free-floating
               fixed box: see showLoading(). Everything positional comes from the
               overlay's own centring, so only size lives here. */
            .confirm-modal.loading-indicator {
                width: auto;
                min-width: 296px;
                max-width: min(420px, 92vw);
            }
            .loading-body { padding: 11px 13px 13px; }
            .loading-text {
                font-family: var(--font-head, 'Russo One', sans-serif);
                font-size: 12.5px;
                letter-spacing: 0.05em;
                text-transform: uppercase;
                margin-bottom: 4px;
                color: var(--bright, #eef3fb);
                text-shadow: 0 1px 0 var(--ink, #05070d);
            }
            .loading-subtext {
                font-family: var(--font-mono, 'Share Tech Mono', ui-monospace, monospace);
                font-size: 10px;
                letter-spacing: 0.11em;
                color: var(--muted, #8b94a8);
            }
            /* A BARBER POLE, NOT A TRAVELLING PILL. The previous readout was a
               38%-wide soft gradient bouncing across a black trough: live it
               looked busy, but every FROZEN frame - which is what a store page, a
               press screenshot and a trailer still are - showed an amber smear
               parked mid-track with empty bed on both sides, i.e. a stuck bar.
               A full-width hatch is a full readout in every still, and the motion
               still reads as working. It animates transform on an over-wide
               pseudo-element (one composited layer, no repaint, no relayout)
               rather than background-position. */
            .loading-track {
                position: relative;
                height: 9px;
                margin-top: 11px;
                overflow: hidden;
                background: #05080e;
                border: 2px solid var(--ink, #05070d);
            }
            .loading-track::after {
                content: "";
                position: absolute;
                top: 0;
                bottom: 0;
                left: -24px;
                right: -24px;
                opacity: 0.56;
                background: repeating-linear-gradient(45deg,
                    var(--amber, #f0a233) 0 6px, var(--ink, #05070d) 6px 12px);
                animation: loadingSweep 0.7s linear infinite;
                will-change: transform;
            }
            .loading-track::before {
                content: "";
                position: absolute;
                inset: 0;
                z-index: 1;
                pointer-events: none;
                box-shadow: inset 2px 2px 5px rgba(0, 0, 0, 0.85);
            }
            /* 12px along a 45deg gradient axis is 12*sqrt(2) along x, so this is
               exactly one period and the loop is seamless. */
            @keyframes loadingSweep {
                from { transform: translateX(0); }
                to   { transform: translateX(16.971px); }
            }

            /* ---- Confirmation / order dialog ------------------------------- */
            .confirm-modal-overlay {
                position: fixed;
                inset: 0;
                z-index: 10003;
                display: flex;
                align-items: center;
                justify-content: center;
                background: rgba(3, 6, 11, 0.72);
            }
            .confirm-modal {
                box-sizing: border-box;
                /* Shrink-to-fit, capped. width:90% made every dialog 520px wide
                   whatever it said, which is where most of the "padded with void"
                   came from. */
                width: auto;
                min-width: min(340px, 92vw);
                max-width: min(560px, 92vw);
                max-height: 92vh;
                padding: 1px 1px 0;
                color: var(--text, #cdd6e6);
                font-family: var(--font-ui, 'Rajdhani', 'Segoe UI', system-ui, sans-serif);
            }
            .modal-rail {
                margin: -1px -1px 0;
                padding: 7px 11px 6px;
                font-family: var(--font-head, 'Russo One', sans-serif);
                font-size: 11px;
                letter-spacing: 0.07em;
                text-transform: uppercase;
                color: var(--amber-hi, #ffce80);
                background: linear-gradient(180deg, #1a222f, #0d121c);
                border-bottom: 2px solid var(--ink, #05070d);
                box-shadow: inset 0 1px 0 rgba(255,255,255,0.09), inset 0 -2px 0 rgba(0,0,0,0.55);
                text-shadow: 0 1px 0 var(--ink, #05070d);
            }
            /* The stencilled code, for pages that do not carry style.css's
               [data-code] signage rule. */
            .modal-rail { position: relative; }
            .modal-rail[data-code]::after {
                content: attr(data-code);
                position: absolute;
                top: 8px;
                right: 10px;
                font-family: var(--font-mono, 'Share Tech Mono', ui-monospace, monospace);
                font-size: 9px;
                letter-spacing: 0.16em;
                color: var(--faint, #5e6678);
                pointer-events: none;
            }
            .confirm-modal .modal-rail { position: sticky; top: 0; z-index: 3; margin-bottom: 0; }
            /* THE BODY SCROLLS, NOT THE PLATE. Two reasons, one of them a real
               hazard rather than a preference.

               The keys must never scroll out of the dialog that needs them, and
               with overflow-y:auto on the plate a long battle report pushed
               CONFIRM below the fold.

               And a shrink-to-fit box (this plate is width:auto) that also owns
               a vertical scrollbar is the classic layout-oscillation shape: the
               scrollbar takes width, the narrower text wraps taller, the taller
               content keeps the scrollbar, and the browser can settle on a box
               that jitters by a pixel between frames. A dialog whose geometry is
               not settled is a dialog an automated click never finds actionable -
               and this is the dialog every fleet order goes through. Scrolling
               the CONTENT, which has a definite width by then, cannot do that. */
            .confirm-modal-content {
                padding: 12px 14px 11px;
                font-size: 14px;
                line-height: 1.5;
                max-height: 62vh;
                overflow-y: auto;
                overscroll-behavior: contain;
            }

            /* THE FOOT IS A TWO-ENDED INSTRUMENT. It used to be the button row
               alone, pinned right, which left the lower-left of the game's
               highest-stakes dialog as bare plate - roughly 55% of it - on the
               one screen where the player is being asked to spend hulls. The
               stakes block takes that run: the hazard stamp the map key uses,
               and the numbers the decision is actually made on, stencilled. With
               no stakes supplied the row collapses to the keys and the plate
               simply wraps its content instead of being padded to a size. */
            .confirm-modal-foot {
                display: flex;
                align-items: flex-end;
                justify-content: flex-end;
                gap: 14px;
                padding: 0 14px 13px;
            }
            /* NO STAKES, NO VOID. With a stakes block the keys are compact and
               sit opposite it. Without one - a surrender prompt, a Close - the
               row has nothing to be opposite, and right-aligned keys just move
               the empty plate from one corner to the other. The keys take the row
               instead and share it evenly, centred and capped so a single-action
               dialog gets one deliberate key rather than a 300px amber slab.
               This is what a dialog of this era does anyway. */
            .confirm-modal-foot.is-bare { justify-content: center; }
            .confirm-modal-foot.is-bare .confirm-modal-buttons { flex: 1 1 auto; justify-content: center; }
            .confirm-modal-foot.is-bare .confirm-modal-buttons button { flex: 1 1 0; max-width: 240px; }
            .confirm-stakes {
                display: flex;
                align-items: stretch;
                gap: 8px;
                flex: 1 1 auto;
                min-width: 0;
            }
            /* A STAMP, NOT A SLOT. The socket used to stretch to the stake list's
               height, so a 34px-wide well ran ~50px tall around a 19px hairline
               glyph - roughly a fifth of the socket carrying anything, which at
               12x is a placeholder box. It is square now and top-aligned with the
               readout beside it, and the filled stamp takes 26 of its 34px. */
            .confirm-hazard {
                flex: 0 0 auto;
                align-self: flex-start;
                display: grid;
                place-items: center;
                box-sizing: border-box;
                width: 34px;
                height: 34px;
                background: #05080e;
                border: 2px solid var(--ink, #05070d);
                box-shadow: inset 2px 2px 5px rgba(0, 0, 0, 0.85);
                color: var(--red-hi, #ff7f63);
            }
            .confirm-hazard svg { display: block; width: 26px; height: 26px; }
            .confirm-hazard.is-warn { color: var(--amber-hi, #ffce80); }
            .stake-list {
                flex: 1 1 auto;
                min-width: 0;
                margin: 0;
                padding: 4px 7px 3px;
                list-style: none;
                /* No tick hatch behind this one. It was tried and pulled: a 4px
                   hatch is right behind a mostly-empty run (the advisory's source
                   well) and wrong behind three lines of 9.5px mono, where it
                   striped the glyphs and cost more legibility than the texture
                   was worth. The dotted leaders already fill the run. */
                background: #05080e;
                border: 2px solid var(--ink, #05070d);
                box-shadow: inset 2px 2px 5px rgba(0, 0, 0, 0.85);
            }
            .stake-row {
                display: flex;
                align-items: baseline;
                gap: 6px;
                font-family: var(--font-mono, 'Share Tech Mono', ui-monospace, monospace);
                font-size: 9.5px;
                letter-spacing: 0.13em;
                line-height: 1.5;
                white-space: nowrap;
            }
            .stake-row .stake-label { flex: 0 0 auto; color: var(--faint, #5e6678); }
            .stake-row .stake-rule {
                flex: 1 1 auto;
                min-width: 6px;
                height: 0;
                margin-bottom: 2px;
                border-bottom: 1px dotted rgba(176, 198, 232, 0.16);
            }
            .stake-row .stake-value { flex: 0 0 auto; color: var(--bright, #eef3fb); }
            .stake-row.is-alert .stake-value { color: var(--red-hi, #ff7f63); }

            .confirm-modal-buttons {
                display: flex;
                gap: 9px;
                justify-content: flex-end;
                flex: 0 0 auto;
            }
            /* Geometry only where the console keys already exist; full material
               below for pages that do not carry them. */
            .confirm-modal-buttons .gp-key { padding: 10px 18px; font-size: 12px; }
            .confirm-modal-buttons button {
                font-family: var(--font-head, 'Russo One', sans-serif);
                letter-spacing: 0.05em;
                text-transform: uppercase;
                cursor: pointer;
                color: var(--text, #cdd6e6);
                border: 2px solid var(--ink, #05070d);
                border-radius: 2px;
                background: linear-gradient(180deg, #445064, #1d2433 55%, #141a26);
                text-shadow: 0 1px 0 var(--ink, #05070d);
                box-shadow:
                    inset 1px 1px 0 rgba(255, 255, 255, 0.18),
                    inset -2px -2px 0 rgba(0, 0, 0, 0.55),
                    0 3px 0 var(--ink, #05070d);
            }
            /* THE BRIGHTEST KEY MUST NOT BE THE IRREVERSIBLE ONE.
               Bronze is this console's "do this" colour - End Turn, Shop, Home,
               Settle - and it was also on CONFIRM in the surrender prompt ("your
               empire is dissolved immediately") and on CONFIRM in a fleet order
               that kills a quarter of every hull sent. The most attractive,
               most finger-drawing control on screen was the one that cannot be
               taken back.
               Every dialog that comes through confirm() is an order the player
               cannot undo, so the triage is inverted there: the affirmative key
               takes the console's EXISTING danger atom (dark steel, crimson
               stencil - the same one the Surrender key in the top bar already
               wears) and the bronze primary moves to CANCEL. The bevel geometry
               is byte-identical between the two, so colour does the triage and
               shape stays constant, and there is no coloured edge anywhere: the
               lip under both keys is ink. The literals below only paint on a
               page without style.css; on the game screen the .gp-key--danger and
               .gp-key--amber atoms do. */
            .confirm-modal-buttons .gp-key--amber {
                color: #2a1803;
                background: linear-gradient(180deg, var(--amber-hi, #ffce80), var(--amber, #f0a233) 52%, var(--amber-lo, #9a5d11));
                text-shadow: 0 1px 0 rgba(255, 228, 175, 0.45);
            }
            .confirm-modal-buttons .gp-key--danger {
                color: #ff8f74;
                background: linear-gradient(180deg, #3d2a2a, #1e1517 58%, #150e10);
                text-shadow: 0 1px 0 var(--ink, #05070d);
            }
            .confirm-modal-buttons .gp-key--danger:hover:not(:disabled) {
                color: #ffe3da;
                background: linear-gradient(180deg, #9c3524, #56180c);
            }

            @media (max-width: 560px) {
                .notification { min-width: 0; }
                .notification-message { font-size: 12.5px; }
                .confirm-modal-foot { flex-direction: column; align-items: stretch; }
                .confirm-modal-buttons { justify-content: flex-end; }
            }
            @media (prefers-reduced-motion: reduce) {
                .loading-track::after { animation: none; }
                .notification { animation: none; }
            }
        `;
        document.head.appendChild(style);
    }

    /* ------------------------------------------------------------------ */
    /* Messages                                                            */
    /* ------------------------------------------------------------------ */

    /**
     * The primary entry point. title is the stencilled heading, message the body.
     * duration 0 keeps the message up until it is dismissed.
     */
    function notify(title, message, type = 'info', duration = 5000) {
        return render({ title, message, type, duration });
    }

    /** Older argument order, kept because payment/game helpers below use it. */
    function show(message, type = 'info', duration = 5000, title = '') {
        return render({ title, message, type, duration });
    }

    function render({ title, message, type, duration }) {
        if (!container) initialize();
        const kindKey = normalizeType(type);
        const kind = KINDS[kindKey];
        const id = ++notificationId;

        // Never let the stack grow into a wall of plates over the map.
        while (activeNotifications.length >= MAX_VISIBLE) {
            const oldest = activeNotifications.shift();
            if (oldest && oldest.element) oldest.element.remove();
        }

        const notification = document.createElement('div');
        // `has-gauge` used to ride here to buy the absolutely-positioned gauge its
        // padding. The gauge is in flow inside the text column now, so the class
        // styled nothing; a hook that hooks nothing is how the next reader gets
        // misled about where the layout comes from.
        notification.className = `notification gp-plate ${kindKey} role-${kind.role}`;
        notification.dataset.id = id;
        notification.setAttribute('role', kind.role === 'red' ? 'alert' : 'status');
        notification.innerHTML = `
            <span class="notification-code">${kind.code}</span>
            <div class="notification-content">
                ${title ? `<div class="notification-title">${escapeHtml(title)}</div>` : ''}
                <div class="notification-message">${escapeHtml(message)}</div>
                ${duration > 0 ? '<div class="notification-progress" aria-hidden="true"><div class="notification-progress-bar"></div></div>' : ''}
            </div>
            <button type="button" class="notification-close" title="Dismiss" aria-label="Dismiss">${GLYPH_CLOSE}</button>
        `;
        notification.querySelector('.notification-close').addEventListener('click', () => remove(id));

        container.appendChild(notification);
        activeNotifications.push({ id, element: notification });
        queuePlacement();

        if (duration > 0) {
            const gauge = notification.querySelector('.notification-progress');
            const progressBar = notification.querySelector('.notification-progress-bar');
            if (gauge && progressBar) {
                // The tick pitch is a percentage of the gauge and the drain is a
                // steps() transition, so the two only stay in register if the
                // step COUNT is derived from the width that actually rendered.
                // One measurement per toast; the drain itself then relayouts once
                // per segment instead of once per frame.
                const segments = Math.max(GAUGE_SEG_MIN, Math.min(GAUGE_SEG_MAX,
                    Math.round((gauge.clientWidth || GAUGE_PITCH * 8) / GAUGE_PITCH)));
                gauge.style.setProperty('--seg', String(segments));
                requestAnimationFrame(() => {
                    progressBar.style.transition = `width ${duration}ms steps(${segments}, end)`;
                    progressBar.style.width = '0%';
                });
            }
            setTimeout(() => remove(id), duration);
        }

        return id;
    }

    // Remove notification
    function remove(id) {
        const index = activeNotifications.findIndex(n => n.id === id);
        if (index === -1) return;

        const notification = activeNotifications[index];
        activeNotifications.splice(index, 1);
        notification.element.classList.add('removing');

        setTimeout(() => {
            notification.element.remove();
        }, 260);
    }

    /**
     * Blocking progress plate.
     *
     * It goes through buildModal now. The old one was appended straight to
     * <body> with nothing behind it, so a plate whose own copy said "do not
     * close this window" left the entire HUD and map at full brightness and
     * apparently interactive - while buildModal, twelve lines further down the
     * same file, did create a scrim. One file, two contradictory ideas of what
     * "blocking" means. It now inherits the scrim and the centring that were
     * already proven on the confirm dialog; the only thing it omits is the
     * click-to-dismiss listener, because this one genuinely is not dismissable.
     */
    function showLoading(text = 'STANDBY', subtext = '', rail = 'Working') {
        hideLoading();
        const { overlay, modalEl } = buildModal(rail, `
            <div class="loading-body">
                <div class="loading-text">${escapeHtml(text)}</div>
                ${subtext ? `<div class="loading-subtext">${escapeHtml(subtext)}</div>` : ''}
                <div class="loading-track" role="progressbar" aria-label="${escapeHtml(text)}"></div>
            </div>
        `, { code: 'TRX-11', plateClass: 'loading-indicator', bare: true });
        // Assigned here as literals rather than plumbed through buildModal's
        // options: the id audit (tests/no-dead-dom-targets.test.js) reads
        // `.id = "..."` statically, and an id it cannot see is an id that can be
        // renamed out from under hideLoading() without anything failing.
        overlay.id = 'loading-overlay';
        modalEl.id = 'loading-indicator';
        modalEl.setAttribute('aria-busy', 'true');
        document.body.appendChild(overlay);
    }

    // Hide loading indicator
    function hideLoading() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) { overlay.remove(); return; }
        // Belt and braces for a loader built before this file was reloaded.
        const loader = document.getElementById('loading-indicator');
        if (loader) (loader.closest('.confirm-modal-overlay') || loader).remove();
    }

    /**
     * options:
     *   code        stencilled plate marking on the rail (e.g. 'ORD-08')
     *   plateClass  extra class on the plate
     *   bare        content is already wrapped; skip .confirm-modal-content
     */
    function buildModal(title, contentHtml, options = {}) {
        addStyles();
        const overlay = document.createElement('div');
        overlay.className = 'confirm-modal-overlay';
        const modalEl = document.createElement('div');
        modalEl.className = `confirm-modal gp-plate${options.plateClass ? ` ${options.plateClass}` : ''}`;
        modalEl.setAttribute('role', 'dialog');
        modalEl.setAttribute('aria-modal', 'true');
        const code = options.code ? ` data-code="${escapeHtml(options.code)}"` : '';
        modalEl.innerHTML = `
            <div class="gp-titlebar modal-rail"${code}>${escapeHtml(title)}</div>
            ${options.bare ? contentHtml : `<div class="confirm-modal-content">${contentHtml}</div>`}
        `;
        overlay.appendChild(modalEl);
        return { overlay, modalEl };
    }

    function keyClass(primary) {
        return primary ? 'gp-key gp-key--amber btn-confirm' : 'gp-key btn-cancel';
    }

    /**
     * The stakes block: the hazard stamp plus the numbers the order is being
     * judged on. Callers pass what they already computed; nothing is parsed out
     * of the message text.
     */
    function stakesMarkup(options) {
        const stakes = Array.isArray(options.stakes) ? options.stakes.filter(Boolean) : [];
        const glyph = GLYPH_HAZARD[options.hazard];
        if (!stakes.length && !glyph) return '';
        const rows = stakes.map(stake => `<li class="stake-row${stake.alert ? ' is-alert' : ''}">`
            + `<span class="stake-label">${escapeHtml(stake.label)}</span>`
            + '<span class="stake-rule"></span>'
            + `<span class="stake-value">${escapeHtml(stake.value)}</span></li>`).join('');
        return '<div class="confirm-stakes">'
            + (glyph ? `<span class="confirm-hazard${options.hazard === 'shoal' ? ' is-warn' : ''}">${glyph}</span>` : '')
            + (rows ? `<ul class="stake-list">${rows}</ul>` : '')
            + '</div>';
    }

    function appendFoot(modalEl, options, buttonsHtml) {
        const stakes = stakesMarkup(options);
        const foot = document.createElement('div');
        foot.className = `confirm-modal-foot${stakes ? '' : ' is-bare'}`;
        foot.innerHTML = `${stakes}<div class="confirm-modal-buttons">${buttonsHtml}</div>`;
        modalEl.appendChild(foot);
        return foot.querySelector('.confirm-modal-buttons');
    }

    /**
     * Confirmation dialog.
     *
     * confirm(title, message, onConfirm, onCancel, options)
     *
     * options is optional and additive - every existing four-argument call is
     * unchanged:
     *   stakes: [{ label, value, alert }]  stencilled left of the keys
     *   hazard: 'shoal' | 'void'           stamped hazard mark, map-key language
     *   code:   'ORD-08'                   plate marking on the rail
     *   confirmLabel / cancelLabel
     *   destructive: false                 opt OUT of the danger triage below
     *
     * WHY DESTRUCTIVE IS THE DEFAULT HERE. confirm() is not a general yes/no
     * box - it is the "you cannot take this back" gate, and every call site in
     * the product is one: dispatching hulls into a shoal or a void, attacking
     * with everything, dissolving the empire. So the affirmative key wears the
     * console's danger atom and the bronze primary sits on CANCEL, which is the
     * key a hesitating finger should land on. A caller with a genuinely benign
     * confirmation passes destructive:false and gets the old arrangement; the
     * class names (.btn-confirm / .btn-cancel) never move, because the harness
     * clicks them.
     */
    function confirm(title, message, onConfirm, onCancel = null, options = {}) {
        const { overlay, modalEl } = buildModal(title, escapeHtml(message), { code: options.code || 'ORD-08' });
        const destructive = options.destructive !== false;
        const confirmClass = destructive ? 'gp-key gp-key--danger btn-confirm' : keyClass(true);
        const cancelClass = destructive ? 'gp-key gp-key--amber btn-cancel' : keyClass(false);
        const buttons = appendFoot(modalEl, options, `
            <button type="button" class="${cancelClass}">${escapeHtml(options.cancelLabel || 'Cancel')}</button>
            <button type="button" class="${confirmClass}">${escapeHtml(options.confirmLabel || 'Confirm')}</button>
        `);
        document.body.appendChild(overlay);

        buttons.querySelector('.btn-confirm').onclick = () => {
            overlay.remove();
            if (onConfirm) onConfirm();
        };
        buttons.querySelector('.btn-cancel').onclick = () => {
            overlay.remove();
            if (onCancel) onCancel();
        };
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                overlay.remove();
                if (onCancel) onCancel();
            }
        };
    }

    function modal(title, bodyHtml, actions = [], options = {}) {
        const { overlay, modalEl } = buildModal(title, bodyHtml, { code: options.code || 'MSG-12' });
        const safeActions = Array.isArray(actions) && actions.length ? actions : [{ label: 'Close', action: null }];
        const buttons = appendFoot(modalEl, options, '');
        safeActions.forEach(action => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = keyClass(action.primary);
            btn.textContent = action.label || 'Close';
            btn.onclick = () => {
                overlay.remove();
                if (typeof action.action === 'function') {
                    action.action();
                }
            };
            buttons.appendChild(btn);
        });
        overlay.addEventListener('click', e => {
            if (e.target === overlay) {
                overlay.remove();
            }
        });
        document.body.appendChild(overlay);
    }

    // Payment-specific notifications
    const payment = {
        // ONE EVENT, ONE PIECE OF CHROME. This used to raise the blocking plate
        // AND a duration-0 (sticky) toast saying the same sentence, so the player
        // got the message twice in two different languages, one of them printed
        // over the tactical map. success() and error() below already notify on
        // completion; the toast here was pure duplication. The strings are in the
        // console's own register rather than web-commerce copy.
        processing: () => showLoading('Settling Transaction', 'CHANNEL OPEN — DO NOT DISCONNECT', 'Transaction'),

        success: (item) => {
            hideLoading();
            return notify('Payment Complete', `Successfully purchased ${item}!`, 'success', 5000);
        },

        error: (error) => {
            hideLoading();
            return notify('Payment Error', error || 'Payment failed. Please try again.', 'error', 8000);
        },

        declined: () => {
            hideLoading();
            return notify('Payment Declined', 'Your card was declined. Please check your details and try again.', 'error', 8000);
        },

        cancelled: () => {
            hideLoading();
            return notify('Payment', 'Payment cancelled.', 'warning', 3000);
        }
    };

    // Game-specific notifications
    const game = {
        connected: () => notify('Link', 'Connected to game server', 'success', 3000),
        disconnected: () => notify('Connection Lost', 'Disconnected from server', 'error', 0),
        turnComplete: () => notify('Turn', 'Turn completed', 'info', 2000),
        battleWon: () => notify('Battle Complete', 'Victory! You won the battle!', 'success', 5000),
        battleLost: () => notify('Battle Complete', 'Defeat. You lost the battle.', 'error', 5000),
        resourcesLow: () => notify('Warning', 'Low resources! Build more extractors.', 'warning', 5000),
        techUnlocked: (tech) => notify('Technology Complete', `${tech} researched!`, 'success', 4000),
        buildingComplete: (building) => notify('Building Complete', `${building} construction complete!`, 'success', 4000)
    };

    return {
        initialize,
        notify,
        show,
        remove,
        showLoading,
        hideLoading,
        confirm,
        payment,
        game,
        modal
    };
})();

// Initialize on load
if (typeof window !== 'undefined') {
    window.NotificationSystem = NotificationSystem;
    document.addEventListener('DOMContentLoaded', () => {
        NotificationSystem.initialize();
    });
}
